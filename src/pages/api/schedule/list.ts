import type { APIRoute } from "astro";
import { getGuestbookEnv } from "@/utils/guestbook/guestbook-env";
import { jsonResponse } from "@/utils/guestbook/guestbook-server";
import { listServerSchedules } from "@/utils/schedule/schedule-server";

export const prerender = false;

export const GET: APIRoute = async () => {
	const env = await getGuestbookEnv();
	if (!env.DB) {
		return jsonResponse({ message: "课表数据库尚未配置" }, 503);
	}
	try {
		const schedules = await listServerSchedules(env);
		return jsonResponse({ schedules });
	} catch (error) {
		console.error("list schedules failed:", error);
		return jsonResponse({ message: "读取课表列表失败" }, 500);
	}
};
