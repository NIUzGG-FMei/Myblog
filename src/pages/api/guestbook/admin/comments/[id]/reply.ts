import type { APIRoute } from "astro";
import { getGuestbookEnv } from "@/utils/guestbook/guestbook-env";
import {
	authenticateAdmin,
	jsonResponse,
} from "@/utils/guestbook/guestbook-server";
import {
	moderateContent,
	normalizePlainText,
} from "@/utils/guestbook/guestbook-validation";

export const prerender = false;

export const POST: APIRoute = async ({ params, request }) => {
	const env = await getGuestbookEnv();
	const auth = await authenticateAdmin(request, env);
	if (!auth.ok) return jsonResponse({ message: auth.message }, auth.status);
	if (!env.DB) return jsonResponse({ message: "评论数据库尚未配置" }, 503);
	if (!params.id) return jsonResponse({ message: "评论不存在" }, 404);

	let rawBody: unknown;
	try {
		rawBody = await request.json();
	} catch {
		return jsonResponse({ message: "请求内容格式不正确" }, 400);
	}
	const content = normalizePlainText(
		(rawBody as { content?: unknown })?.content,
	);
	if (content.length < 2 || content.length > 500) {
		return jsonResponse({ message: "回复内容需为 2 至 500 个字符" }, 422);
	}
	const moderation = moderateContent(content);
	if (moderation.status !== "published") {
		return jsonResponse({ message: "回复内容未通过安全检查" }, 422);
	}

	try {
		const parent = await env.DB.prepare(
			"SELECT id, path, parent_id FROM comments WHERE id = ? AND status = 'published' LIMIT 1",
		)
			.bind(params.id)
			.first<{ id: string; path: string; parent_id: string | null }>();
		if (!parent) return jsonResponse({ message: "要回复的评论不存在" }, 404);

		// 被回复的评论本身是回复时，统一挂到最顶层评论下，避免多层嵌套
		const topLevelId = parent.parent_id || parent.id;

		const now = Date.now();
		const id = crypto.randomUUID();
		await env.DB.prepare(
			`INSERT INTO comments (
				id, path, display_name, content, status, parent_id, is_author, content_hash, ip_hash, created_at
			) VALUES (?, ?, '博主', ?, 'published', ?, 1, ?, NULL, ?)`,
		)
			.bind(id, parent.path, content, topLevelId, `author:${content}`, now)
			.run();

		return jsonResponse(
			{
				comment: {
					id,
					path: parent.path,
					displayName: "博主",
					content,
					parentId: topLevelId,
					isAuthor: true,
					createdAt: new Date(now).toISOString(),
				},
			},
			201,
		);
	} catch (error) {
		console.error(
			"[Admin] Failed to reply comment:",
			error instanceof Error ? error.message : "unknown error",
		);
		return jsonResponse({ message: "回复失败，请稍后重试" }, 500);
	}
};
