import type { APIRoute } from "astro";
import { getGuestbookEnv } from "@/utils/guestbook/guestbook-env";
import {
	createAdminSession,
	jsonResponse,
} from "@/utils/guestbook/guestbook-server";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
	const env = await getGuestbookEnv();
	const expectedPassword = env.ADMIN_PASSWORD;
	if (!expectedPassword) {
		return jsonResponse({ message: "管理员密码尚未配置" }, 503);
	}
	if (!env.SESSION) return jsonResponse({ message: "会话服务尚未配置" }, 503);

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return jsonResponse({ message: "请求内容格式不正确" }, 400);
	}
	const password = (body as { password?: unknown })?.password;
	if (
		typeof password !== "string" ||
		password.length === 0 ||
		password.length > 200
	) {
		return jsonResponse({ message: "请输入密码" }, 422);
	}

	const start = Date.now();
	let passwordMatches = false;
	try {
		const [expected, submitted] = await Promise.all([
			crypto.subtle.digest("SHA-256", new TextEncoder().encode(expectedPassword)),
			crypto.subtle.digest("SHA-256", new TextEncoder().encode(password)),
		]);
		const hex = (bytes: ArrayBuffer) =>
			Array.from(new Uint8Array(bytes), (byte) =>
				byte.toString(16).padStart(2, "0"),
			).join("");
		passwordMatches = hex(expected) === hex(submitted);
	} catch {
		passwordMatches = false;
	}
	await new Promise((resolve) => setTimeout(resolve, Math.max(0, 300 - (Date.now() - start))));
	if (!passwordMatches) {
		return jsonResponse({ message: "密码错误" }, 401);
	}

	const session = await createAdminSession(env);
	if (!session) return jsonResponse({ message: "会话创建失败" }, 500);
	return jsonResponse({ message: "登录成功" }, 200, {
		"Set-Cookie": session.cookie,
	});
};
