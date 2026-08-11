import type { APIRoute } from "astro";
import { getGuestbookEnv } from "@/utils/guestbook/guestbook-env";
import {
	authenticateAdmin,
	jsonResponse,
} from "@/utils/guestbook/guestbook-server";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
	const env = await getGuestbookEnv();
	const auth = await authenticateAdmin(request, env);
	return jsonResponse({ authenticated: auth.ok });
};
