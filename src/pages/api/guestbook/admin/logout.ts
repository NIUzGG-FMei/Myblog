import type { APIRoute } from "astro";
import { getGuestbookEnv } from "@/utils/guestbook/guestbook-env";
import {
	ADMIN_SESSION_COOKIE,
	destroyAdminSession,
	jsonResponse,
} from "@/utils/guestbook/guestbook-server";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
	const env = await getGuestbookEnv();
	await destroyAdminSession(request, env);
	return jsonResponse({ message: "已退出登录" }, 200, {
		"Set-Cookie": `${ADMIN_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`,
	});
};
