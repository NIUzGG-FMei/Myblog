import type { APIRoute } from "astro";
import { guestbookConfig } from "@/config/guestbookConfig";
import { type GuestbookNoteType, guestbookTypes } from "@/types/guestbook";
import { getGuestbookEnv } from "@/utils/guestbook/guestbook-env";
import {
	checkRateLimit,
	cleanupAbuseData,
	decodeCursor,
	encodeCursor,
	encryptContact,
	hmacSha256,
	jsonResponse,
	publicNoteFromRow,
	sha256,
	verifyTurnstile,
} from "@/utils/guestbook/guestbook-server";
import {
	moderateContent,
	validateSubmission,
} from "@/utils/guestbook/guestbook-validation";

export const prerender = false;

type PublicNoteRow = Parameters<typeof publicNoteFromRow>[0];

export const GET: APIRoute = async ({ url }) => {
	const env = await getGuestbookEnv();
	if (!env.DB) return jsonResponse({ message: "便签墙数据库尚未配置" }, 503);

	const requestedType = url.searchParams.get("type");
	const type = requestedType && requestedType !== "all" ? requestedType : null;
	if (type && !guestbookTypes.includes(type as GuestbookNoteType)) {
		return jsonResponse({ message: "便签类型不正确" }, 400);
	}

	const cursorValue = url.searchParams.get("cursor");
	const cursor = decodeCursor(cursorValue);
	if (cursorValue && !cursor)
		return jsonResponse({ message: "分页参数无效" }, 400);

	const conditions = ["status = 'published'"];
	const bindings: unknown[] = [];
	if (type) {
		conditions.push("note_type = ?");
		bindings.push(type);
	}
	if (cursor) {
		conditions.push("(created_at < ? OR (created_at = ? AND id < ?))");
		bindings.push(cursor[0], cursor[0], cursor[1]);
	}

	try {
		const result = await env.DB.prepare(
			`SELECT id, content, display_name, is_anonymous, note_type, color, created_at
			FROM guestbook_notes
			WHERE ${conditions.join(" AND ")}
			ORDER BY created_at DESC, id DESC
			LIMIT ?`,
		)
			.bind(...bindings, guestbookConfig.pageSize + 1)
			.all<PublicNoteRow>();
		const rows = result.results || [];
		const visibleRows = rows.slice(0, guestbookConfig.pageSize);
		const last = visibleRows.at(-1);
		return jsonResponse({
			notes: visibleRows.map(publicNoteFromRow),
			nextCursor:
				rows.length > guestbookConfig.pageSize && last
					? encodeCursor(last.created_at, last.id)
					: null,
		});
	} catch (error) {
		console.error(
			"[Guestbook] Failed to list notes:",
			error instanceof Error ? error.message : "unknown error",
		);
		return jsonResponse({ message: "暂时无法加载便签，请稍后重试" }, 500);
	}
};

export const POST: APIRoute = async ({ request }) => {
	const env = await getGuestbookEnv();
	if (!env.DB) return jsonResponse({ message: "便签墙数据库尚未配置" }, 503);
	const origin = request.headers.get("Origin");
	if (!origin || origin !== new URL(request.url).origin) {
		return jsonResponse({ message: "不允许跨站提交便签" }, 403);
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
	const validation = validateSubmission(rawBody);
	if (!validation.ok) return jsonResponse({ message: validation.message }, 422);

	const remoteIp = request.headers.get("CF-Connecting-IP") || "unknown";
	if (env.TURNSTILE_SECRET_KEY) {
		let turnstileValid = false;
		try {
			turnstileValid = await verifyTurnstile(
				env.TURNSTILE_SECRET_KEY,
				validation.data.turnstileToken,
				remoteIp,
				"guestbook-submit",
				new URL(request.url).hostname,
			);
		} catch {
			return jsonResponse({ message: "人机验证服务暂时不可用" }, 503);
		}
		if (!turnstileValid)
			return jsonResponse({ message: "人机验证未通过" }, 403);
	}

	const now = Date.now();
	const contentHash = await sha256(validation.data.content);
	const ipHash = env.IP_HASH_SECRET
		? await hmacSha256(env.IP_HASH_SECRET, remoteIp)
		: await sha256(`firefly:${remoteIp}`);

	try {
		await cleanupAbuseData(env.DB, now);
		const rateLimit = await checkRateLimit(env.DB, ipHash, contentHash, now);
		if (!rateLimit.allowed || rateLimit.duplicate) {
			return jsonResponse(
				{
					message: rateLimit.duplicate
						? "相同内容已提交，请勿重复发布"
						: "提交过于频繁，请稍后再试",
				},
				429,
			);
		}

		const moderation = moderateContent(validation.data.content);
		const id = crypto.randomUUID();
		const statements = [
			env.DB.prepare(
				`INSERT INTO guestbook_notes (
					id, content, display_name, is_anonymous, note_type, color, status,
					moderation_reason, content_hash, ip_hash, created_at, published_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			).bind(
				id,
				validation.data.content,
				validation.data.displayName,
				validation.data.anonymous ? 1 : 0,
				validation.data.type,
				validation.data.color,
				moderation.status,
				moderation.reason,
				contentHash,
				ipHash,
				now,
				moderation.status === "published" ? now : null,
			),
			env.DB.prepare(
				"INSERT INTO guestbook_submission_events (ip_hash, content_hash, result, created_at) VALUES (?, ?, ?, ?)",
			).bind(ipHash, contentHash, moderation.status, now),
		];

		if (moderation.status !== "rejected" && validation.data.contact) {
			if (!env.CONTACT_ENCRYPTION_KEY) {
				return jsonResponse({ message: "私密联系方式服务尚未配置" }, 503);
			}
			const contact = await encryptContact(
				env.CONTACT_ENCRYPTION_KEY,
				validation.data.contact,
			);
			statements.push(
				env.DB.prepare(
					"INSERT INTO guestbook_contacts (note_id, ciphertext, iv, created_at) VALUES (?, ?, ?, ?)",
				).bind(id, contact.ciphertext, contact.iv, now),
			);
		}

		await env.DB.batch(statements);
		if (moderation.status === "rejected") {
			return jsonResponse({ message: "便签内容未通过安全检查" }, 422);
		}
		if (moderation.status === "pending") {
			return jsonResponse(
				{ id, message: "便签已提交，审核后会出现在墙上", status: "pending" },
				202,
			);
		}

		return jsonResponse(
			{
				note: {
					id,
					content: validation.data.content,
					displayName: validation.data.displayName,
					anonymous: validation.data.anonymous,
					type: validation.data.type,
					color: validation.data.color,
					createdAt: new Date(now).toISOString(),
				},
				status: "published",
			},
			201,
		);
	} catch (error) {
		console.error(
			"[Guestbook] Failed to create note:",
			error instanceof Error ? error.message : "unknown error",
		);
		return jsonResponse({ message: "便签提交失败，请稍后重试" }, 500);
	}
};
