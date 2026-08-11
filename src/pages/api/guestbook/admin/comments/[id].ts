import type { APIRoute } from "astro";
import { getGuestbookEnv } from "@/utils/guestbook/guestbook-env";
import {
	authenticateAdmin,
	jsonResponse,
} from "@/utils/guestbook/guestbook-server";

export const prerender = false;

export const DELETE: APIRoute = async ({ params, request }) => {
	const env = await getGuestbookEnv();
	const auth = await authenticateAdmin(request, env);
	if (!auth.ok) return jsonResponse({ message: auth.message }, auth.status);
	if (!env.DB) return jsonResponse({ message: "评论数据库尚未配置" }, 503);
	if (!params.id) return jsonResponse({ message: "评论不存在" }, 404);

	try {
		const now = Date.now();
		await env.DB.batch([
			env.DB.prepare(
				`UPDATE comments
				SET status = 'deleted', content = '', display_name = '匿名', ip_hash = NULL
				WHERE id = ? AND status = 'published'`,
			).bind(params.id),
			env.DB.prepare(
				`UPDATE comments
				SET status = 'deleted', content = '', display_name = '匿名', ip_hash = NULL
				WHERE parent_id = ? AND status = 'published'`,
			).bind(params.id),
			env.DB.prepare(
				"DELETE FROM comments WHERE status = 'deleted' AND created_at < ?",
			).bind(now - 30 * 86_400_000),
		]);
		return jsonResponse({ id: params.id, status: "deleted" });
	} catch (error) {
		console.error(
			"[Admin] Failed to delete comment:",
			error instanceof Error ? error.message : "unknown error",
		);
		return jsonResponse({ message: "删除评论失败" }, 500);
	}
};
