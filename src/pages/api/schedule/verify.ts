import type { APIRoute } from "astro";
import { getGuestbookEnv } from "@/utils/guestbook/guestbook-env";
import { jsonResponse } from "@/utils/guestbook/guestbook-server";
import {
	unauthorized,
	verifySchedulePassword,
} from "@/utils/schedule/schedule-server";

export const prerender = false;

// 校验博客管理密码，用于课表导入等需要管理员权限的操作
export const POST: APIRoute = async ({ request }) => {
	const env = await getGuestbookEnv();
	if (!env.SCHEDULE_PASSWORD) {
		return jsonResponse({ ok: false, message: "管理员密码尚未配置" }, 503);
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return jsonResponse({ ok: false, message: "请求内容格式不正确" }, 400);
	}
	const password = (body as { password?: unknown })?.password;
	if (typeof password !== "string" || password.length === 0) {
		return jsonResponse({ ok: false, message: "请输入密码" }, 422);
	}

	if (!(await verifySchedulePassword(env.SCHEDULE_PASSWORD, password))) {
		return unauthorized();
	}
	return jsonResponse({ ok: true });
};
