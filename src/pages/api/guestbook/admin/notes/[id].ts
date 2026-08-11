import type { APIRoute } from "astro";
import { getGuestbookEnv } from "@/utils/guestbook/guestbook-env";
import {
	authenticateAdmin,
	jsonResponse,
} from "@/utils/guestbook/guestbook-server";

export const prerender = false;

export const PATCH: APIRoute = async ({ params, request }) => {
	const env = await getGuestbookEnv();
	const auth = await authenticateAdmin(request, env);
	if (!auth.ok) return jsonResponse({ message: auth.message }, auth.status);
	if (!env.DB) return jsonResponse({ message: "便签墙数据库尚未配置" }, 503);
	if (!params.id) return jsonResponse({ message: "便签不存在" }, 404);

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return jsonResponse({ message: "请求内容格式不正确" }, 400);
	}
	const status = (body as { status?: unknown })?.status;
	if (status !== "published" && status !== "rejected") {
		return jsonResponse({ message: "审核操作不正确" }, 422);
	}

	const now = Date.now();
	try {
		await env.DB.prepare(
			`UPDATE guestbook_notes
			SET status = ?, moderation_reason = ?, reviewed_at = ?,
				published_at = CASE WHEN ? = 'published' THEN COALESCE(published_at, ?) ELSE published_at END
			WHERE id = ? AND status != 'deleted'`,
		)
			.bind(
				status,
				status === "rejected" ? "manual_rejection" : null,
				now,
				status,
				now,
				params.id,
			)
			.run();
		return jsonResponse({ id: params.id, status });
	} catch (error) {
		console.error(
			"[Guestbook] Failed to moderate note:",
			error instanceof Error ? error.message : "unknown error",
		);
		return jsonResponse({ message: "审核操作失败" }, 500);
	}
};

export const DELETE: APIRoute = async ({ params, request }) => {
	const env = await getGuestbookEnv();
	const auth = await authenticateAdmin(request, env);
	if (!auth.ok) return jsonResponse({ message: auth.message }, auth.status);
	if (!env.DB) return jsonResponse({ message: "便签墙数据库尚未配置" }, 503);
	if (!params.id) return jsonResponse({ message: "便签不存在" }, 404);

	try {
		await env.DB.batch([
			env.DB.prepare("DELETE FROM guestbook_contacts WHERE note_id = ?").bind(
				params.id,
			),
			env.DB.prepare(
				`UPDATE guestbook_notes
				SET status = 'deleted', content = '', display_name = '匿名', ip_hash = NULL,
					moderation_reason = 'deleted_by_admin', reviewed_at = ?
				WHERE id = ?`,
			).bind(Date.now(), params.id),
		]);
		return jsonResponse({ id: params.id, status: "deleted" });
	} catch (error) {
		console.error(
			"[Guestbook] Failed to delete note:",
			error instanceof Error ? error.message : "unknown error",
		);
		return jsonResponse({ message: "删除便签失败" }, 500);
	}
};
