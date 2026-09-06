import type { APIRoute } from "astro";
import { getGuestbookEnv } from "@/utils/guestbook/guestbook-env";
import { jsonResponse } from "@/utils/guestbook/guestbook-server";
import {
	insertServerSchedule,
	parseSchedulePayload,
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

	const parsed = parseSchedulePayload(body);
	if (!parsed) {
		return jsonResponse({ ok: false, message: "课表数据格式不正确" }, 422);
	}

	try {
		const schedule = await insertServerSchedule(env, parsed);
		return jsonResponse({ ok: true, schedule });
	} catch (error) {
		console.error("save schedule failed:", error);
		return jsonResponse({ ok: false, message: "保存课表失败" }, 500);
	}
};
