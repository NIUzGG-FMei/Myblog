import type { APIRoute } from "astro";
import { getGuestbookEnv } from "@/utils/guestbook/guestbook-env";
import {
	authenticateAdmin,
	decryptContact,
	jsonResponse,
} from "@/utils/guestbook/guestbook-server";

export const prerender = false;

export const GET: APIRoute = async ({ params, request }) => {
	const env = await getGuestbookEnv();
	const auth = await authenticateAdmin(request, env);
	if (!auth.ok) return jsonResponse({ message: auth.message }, auth.status);
	if (!env.DB || !env.CONTACT_ENCRYPTION_KEY) {
		return jsonResponse({ message: "私密联系方式服务尚未配置" }, 503);
	}
	if (!params.id) return jsonResponse({ message: "便签不存在" }, 404);

	try {
		const row = await env.DB.prepare(
			"SELECT ciphertext, iv FROM guestbook_contacts WHERE note_id = ? LIMIT 1",
		)
			.bind(params.id)
			.first<{ ciphertext: string; iv: string }>();
		if (!row) return jsonResponse({ message: "该便签没有私密联系方式" }, 404);
		const contact = await decryptContact(
			env.CONTACT_ENCRYPTION_KEY,
			row.ciphertext,
			row.iv,
		);
		return jsonResponse({ contact });
	} catch (error) {
		console.error(
			"[Guestbook] Failed to decrypt contact:",
			error instanceof Error ? error.message : "unknown error",
		);
		return jsonResponse({ message: "无法读取私密联系方式" }, 500);
	}
};
