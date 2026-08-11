import type { APIRoute } from "astro";
import { getGuestbookEnv } from "@/utils/guestbook/guestbook-env";
import {
	authenticateAdmin,
	decryptContact,
	jsonResponse,
} from "@/utils/guestbook/guestbook-server";
import type { AdminCommentItem } from "@/types/comment";

export const prerender = false;

interface AdminCommentRow {
	id: string;
	path: string;
	display_name: string;
	content: string;
	parent_id: string | null;
	is_author: number;
	status: "published" | "deleted";
	contact_ciphertext: string | null;
	contact_iv: string | null;
	created_at: number;
}

export const GET: APIRoute = async ({ request, url }) => {
	const env = await getGuestbookEnv();
	const auth = await authenticateAdmin(request, env);
	if (!auth.ok) return jsonResponse({ message: auth.message }, auth.status);
	if (!env.DB) return jsonResponse({ message: "评论数据库尚未配置" }, 503);

	const pathFilter = url.searchParams.get("path")?.trim() || "";
	if (pathFilter.length > 300) {
		return jsonResponse({ message: "文章地址无效" }, 400);
	}
	const statusFilter = url.searchParams.get("status") || "published";
	if (statusFilter !== "published" && statusFilter !== "deleted" && statusFilter !== "all") {
		return jsonResponse({ message: "评论状态不正确" }, 400);
	}

	try {
		const conditions = [];
		const bindings: unknown[] = [];
		if (pathFilter) {
			conditions.push("path = ?");
			bindings.push(pathFilter);
		}
		if (statusFilter !== "all") {
			conditions.push("status = ?");
			bindings.push(statusFilter);
		}
		const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
		const result = await env.DB.prepare(
			`SELECT id, path, display_name, content, parent_id, is_author, status,
				contact_ciphertext, contact_iv, created_at
			FROM comments
			${whereClause}
			ORDER BY created_at DESC, id DESC
			LIMIT 200`,
		)
			.bind(...bindings)
			.all<AdminCommentRow>();
		const rows = result.results || [];
		const comments: AdminCommentItem[] = [];
		for (const row of rows) {
			let contact: string | null = null;
			if (row.contact_ciphertext && row.contact_iv && env.CONTACT_ENCRYPTION_KEY) {
				try {
					contact = await decryptContact(
						env.CONTACT_ENCRYPTION_KEY,
						row.contact_ciphertext,
						row.contact_iv,
					);
				} catch {
					contact = null;
				}
			}
			comments.push({
				id: row.id,
				path: row.path,
				displayName: row.display_name,
				content: row.content,
				parentId: row.parent_id,
				isAuthor: row.is_author === 1,
				status: row.status,
				contact,
				createdAt: new Date(row.created_at).toISOString(),
			});
		}
		return jsonResponse({ comments });
	} catch (error) {
		console.error(
			"[Admin] Failed to load comments:",
			error instanceof Error ? error.message : "unknown error",
		);
		return jsonResponse({ message: "无法加载评论列表" }, 500);
	}
};
