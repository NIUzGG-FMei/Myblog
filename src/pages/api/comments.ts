import type { APIRoute } from "astro";
import type { NativeComment } from "@/types/comment";
import {
	normalizeCommentPath,
	validateCommentSubmission,
} from "@/utils/comments/comment-validation";
import { getGuestbookEnv } from "@/utils/guestbook/guestbook-env";
import {
	encryptContact,
	hmacSha256,
	jsonResponse,
	sha256,
	verifyTurnstile,
} from "@/utils/guestbook/guestbook-server";
import { moderateContent } from "@/utils/guestbook/guestbook-validation";

export const prerender = false;

interface CommentRow {
	id: string;
	path: string;
	display_name: string;
	content: string;
	parent_id: string | null;
	is_author: number;
	created_at: number;
}

function publicCommentFromRow(row: CommentRow): NativeComment {
	return {
		id: row.id,
		path: row.path,
		displayName: row.display_name,
		content: row.content,
		parentId: row.parent_id,
		isAuthor: row.is_author === 1,
		createdAt: new Date(row.created_at).toISOString(),
	};
}

async function checkCommentRateLimit(
	db: GuestbookD1Database,
	ipHash: string,
	contentHash: string,
	now: number,
): Promise<{ allowed: boolean; duplicate: boolean }> {
	const dayAgo = now - 86_400_000;
	const [counts, duplicate] = await Promise.all([
		db
			.prepare(
				`SELECT
					SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS minute_count,
					COUNT(*) AS day_count
				FROM comments
				WHERE ip_hash = ? AND created_at >= ?`,
			)
			.bind(now - 60_000, ipHash, dayAgo)
			.first<{ day_count: number; minute_count: number }>(),
		db
			.prepare(
				"SELECT id FROM comments WHERE content_hash = ? AND created_at >= ? LIMIT 1",
			)
			.bind(contentHash, dayAgo)
			.first<{ id: string }>(),
	]);

	return {
		allowed:
			Number(counts?.minute_count || 0) < 1 &&
			Number(counts?.day_count || 0) < 20,
		duplicate: Boolean(duplicate),
	};
}

export const GET: APIRoute = async ({ url }) => {
	const env = await getGuestbookEnv();
	if (!env.DB) return jsonResponse({ message: "评论数据库尚未配置" }, 503);

	const path = normalizeCommentPath(url.searchParams.get("path"));
	if (!path) return jsonResponse({ message: "评论页面地址无效" }, 400);

	try {
		const result = await env.DB.prepare(
			`SELECT id, path, display_name, content, parent_id, is_author, created_at
			FROM comments
			WHERE path = ? AND status = 'published'
			ORDER BY created_at ASC, id ASC
			LIMIT 500`,
		)
			.bind(path)
			.all<CommentRow>();
		return jsonResponse({
			comments: (result.results || []).map(publicCommentFromRow),
		});
	} catch (error) {
		console.error(
			JSON.stringify({
				message: "failed to list comments",
				error: error instanceof Error ? error.message : "unknown error",
				path,
			}),
		);
		return jsonResponse({ message: "暂时无法加载评论，请稍后重试" }, 500);
	}
};

export const POST: APIRoute = async ({ request }) => {
	const env = await getGuestbookEnv();
	if (!env.DB) return jsonResponse({ message: "评论数据库尚未配置" }, 503);

	const requestUrl = new URL(request.url);
	const origin = request.headers.get("Origin");
	if (!origin || origin !== requestUrl.origin) {
		return jsonResponse({ message: "不允许跨站提交评论" }, 403);
	}
	const contentLength = Number(request.headers.get("Content-Length") || 0);
	if (contentLength > 8192)
		return jsonResponse({ message: "请求内容过大" }, 413);
	if (!request.headers.get("Content-Type")?.includes("application/json")) {
		return jsonResponse({ message: "请求内容格式不正确" }, 415);
	}

	let rawBody: unknown;
	try {
		rawBody = await request.json();
	} catch {
		return jsonResponse({ message: "请求内容格式不正确" }, 400);
	}
	const validation = validateCommentSubmission(rawBody);
	if (!validation.ok) return jsonResponse({ message: validation.message }, 422);

	const remoteIp = request.headers.get("CF-Connecting-IP") || "unknown";
	if (env.TURNSTILE_SECRET_KEY) {
		let turnstileValid = false;
		try {
			turnstileValid = await verifyTurnstile(
				env.TURNSTILE_SECRET_KEY,
				validation.data.turnstileToken,
				remoteIp,
				"comment-submit",
				requestUrl.hostname,
			);
		} catch {
			return jsonResponse({ message: "人机验证服务暂时不可用" }, 503);
		}
		if (!turnstileValid)
			return jsonResponse({ message: "人机验证未通过" }, 403);
	}

	const moderation = moderateContent(validation.data.content);
	if (moderation.status !== "published") {
		return jsonResponse({ message: "评论内容未通过安全检查" }, 422);
	}

	if (validation.data.parentId) {
		const parent = await env.DB.prepare(
			"SELECT id FROM comments WHERE id = ? AND path = ? AND status = 'published' LIMIT 1",
		)
			.bind(validation.data.parentId, validation.data.path)
			.first<{ id: string }>();
		if (!parent) {
			return jsonResponse({ message: "要回复的评论不存在" }, 404);
		}
	}

	const now = Date.now();
	const contentHash = await sha256(
		`${validation.data.path}\n${validation.data.content}`,
	);
	const ipHash = env.IP_HASH_SECRET
		? await hmacSha256(env.IP_HASH_SECRET, remoteIp)
		: await sha256(`firefly:${remoteIp}`);

	try {
		await env.DB.prepare(
			"UPDATE comments SET ip_hash = NULL WHERE created_at < ? AND ip_hash IS NOT NULL",
		)
			.bind(now - 30 * 86_400_000)
			.run();
		const rateLimit = await checkCommentRateLimit(
			env.DB,
			ipHash,
			contentHash,
			now,
		);
		if (!rateLimit.allowed || rateLimit.duplicate) {
			return jsonResponse(
				{
					message: rateLimit.duplicate
						? "相同评论已提交，请勿重复发布"
						: "评论过于频繁，请稍后再试",
				},
				429,
			);
		}

		const id = crypto.randomUUID();
		let contactCiphertext: string | null = null;
		let contactIv: string | null = null;
		if (validation.data.contact) {
			if (!env.CONTACT_ENCRYPTION_KEY) {
				return jsonResponse({ message: "私密联系方式服务尚未配置" }, 503);
			}
			const contact = await encryptContact(
				env.CONTACT_ENCRYPTION_KEY,
				validation.data.contact,
			);
			contactCiphertext = contact.ciphertext;
			contactIv = contact.iv;
		}
		await env.DB.prepare(
			`INSERT INTO comments (
				id, path, display_name, content, status, parent_id, is_author,
				contact_ciphertext, contact_iv, content_hash, ip_hash, created_at
			) VALUES (?, ?, ?, ?, 'published', ?, 0, ?, ?, ?, ?, ?)`,
		)
			.bind(
				id,
				validation.data.path,
				validation.data.displayName,
				validation.data.content,
				validation.data.parentId,
				contactCiphertext,
				contactIv,
				contentHash,
				ipHash,
				now,
			)
			.run();

		return jsonResponse(
			{
				comment: {
					id,
					path: validation.data.path,
					displayName: validation.data.displayName,
					content: validation.data.content,
					parentId: validation.data.parentId,
					isAuthor: false,
					createdAt: new Date(now).toISOString(),
				} satisfies NativeComment,
			},
			201,
		);
	} catch (error) {
		console.error(
			JSON.stringify({
				message: "failed to create comment",
				error: error instanceof Error ? error.message : "unknown error",
				path: validation.data.path,
			}),
		);
		return jsonResponse({ message: "评论提交失败，请稍后重试" }, 500);
	}
};
