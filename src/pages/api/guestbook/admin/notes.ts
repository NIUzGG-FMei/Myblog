import type { APIRoute } from "astro";
import { guestbookConfig } from "@/config/guestbookConfig";
import { type GuestbookNoteStatus, guestbookStatuses } from "@/types/guestbook";
import { getGuestbookEnv } from "@/utils/guestbook/guestbook-env";
import {
	type AdminNoteRow,
	adminNoteFromRow,
	authenticateAdmin,
	decodeCursor,
	encodeCursor,
	jsonResponse,
} from "@/utils/guestbook/guestbook-server";

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
	const env = await getGuestbookEnv();
	const auth = await authenticateAdmin(request, env);
	if (!auth.ok) return jsonResponse({ message: auth.message }, auth.status);
	if (!env.DB) return jsonResponse({ message: "便签墙数据库尚未配置" }, 503);

	const statusValue = url.searchParams.get("status") || "pending";
	if (!guestbookStatuses.includes(statusValue as GuestbookNoteStatus)) {
		return jsonResponse({ message: "审核状态不正确" }, 400);
	}
	const cursorValue = url.searchParams.get("cursor");
	const cursor = decodeCursor(cursorValue);
	if (cursorValue && !cursor)
		return jsonResponse({ message: "分页参数无效" }, 400);

	const conditions = ["n.status = ?"];
	const bindings: unknown[] = [statusValue];
	if (cursor) {
		conditions.push("(n.created_at < ? OR (n.created_at = ? AND n.id < ?))");
		bindings.push(cursor[0], cursor[0], cursor[1]);
	}

	try {
		const result = await env.DB.prepare(
			`SELECT n.id, n.content, n.display_name, n.is_anonymous, n.note_type,
				n.color, n.status, n.moderation_reason, n.created_at, n.reviewed_at,
				CASE WHEN c.note_id IS NULL THEN 0 ELSE 1 END AS has_contact
			FROM guestbook_notes n
			LEFT JOIN guestbook_contacts c ON c.note_id = n.id
			WHERE ${conditions.join(" AND ")}
			ORDER BY n.created_at DESC, n.id DESC
			LIMIT ?`,
		)
			.bind(...bindings, guestbookConfig.pageSize + 1)
			.all<AdminNoteRow>();
		const rows = result.results || [];
		const visibleRows = rows.slice(0, guestbookConfig.pageSize);
		const last = visibleRows.at(-1);
		return jsonResponse({
			notes: visibleRows.map(adminNoteFromRow),
			nextCursor:
				rows.length > guestbookConfig.pageSize && last
					? encodeCursor(last.created_at, last.id)
					: null,
		});
	} catch (error) {
		console.error(
			"[Guestbook] Failed to load admin notes:",
			error instanceof Error ? error.message : "unknown error",
		);
		return jsonResponse({ message: "无法加载审核队列" }, 500);
	}
};
