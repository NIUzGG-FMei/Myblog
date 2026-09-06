import type { APIRoute } from "astro";
import { getGuestbookEnv } from "@/utils/guestbook/guestbook-env";
import { jsonResponse } from "@/utils/guestbook/guestbook-server";
import {
	deleteServerSchedule,
	unauthorized,
	verifySchedulePassword,
} from "@/utils/schedule/schedule-server";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
	const env = await getGuestbookEnv();
	if (!env.DB) {
		return jsonResponse({ ok: false, message: "课表数据库尚未配置" }, 503);
	}
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
	if (!(await verifySchedulePassword(env.SCHEDULE_PASSWORD, password))) {
		return unauthorized();
	}

	const id = (body as { id?: unknown })?.id;
	if (typeof id !== "string" || !id || id.length > 64) {
		return jsonResponse({ ok: false, message: "课表 ID 不正确" }, 422);
	}

	try {
		await deleteServerSchedule(env, id);
		return jsonResponse({ ok: true });
	} catch {
		return jsonResponse({ ok: false, message: "删除课表失败" }, 500);
	}
};
