import type { APIRoute } from "astro";
import { getGuestbookEnv } from "@/utils/guestbook/guestbook-env";
import { jsonResponse } from "@/utils/guestbook/guestbook-server";
import {
	findServerScheduleByName,
	insertServerSchedule,
	parseSchedulePayload,
	ScheduleNameConflict,
	unauthorized,
	updateServerSchedule,
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
	const overwriteIdValue = (body as { overwriteId?: unknown })?.overwriteId;
	const overwriteId =
		typeof overwriteIdValue === "string" ? overwriteIdValue.trim() : "";
	if (!(await verifySchedulePassword(env.SCHEDULE_PASSWORD, password))) {
		return unauthorized();
	}
	if (overwriteIdValue !== undefined && typeof overwriteIdValue !== "string") {
		return jsonResponse({ ok: false, message: "覆盖目标不正确" }, 422);
	}
	if (overwriteId.length > 64) {
		return jsonResponse({ ok: false, message: "覆盖目标不正确" }, 422);
	}

	const parsed = parseSchedulePayload(body);
	if (!parsed) {
		return jsonResponse({ ok: false, message: "课表数据格式不正确" }, 422);
	}

	try {
		if (overwriteId) {
			const schedule = await updateServerSchedule(env, overwriteId, parsed);
			if (schedule) return jsonResponse({ ok: true, schedule });

			const existing = await findServerScheduleByName(env, parsed.name);
			if (existing) {
				return jsonResponse(
					{
						ok: false,
						duplicate: true,
						existingSchedule: existing,
						message: `课表名称“${parsed.name}”已存在`,
					},
					409,
				);
			}
			return jsonResponse({ ok: false, message: "要覆盖的课表不存在" }, 404);
		}

		const schedule = await insertServerSchedule(env, parsed);
		return jsonResponse({ ok: true, schedule });
	} catch (error) {
		if (error instanceof ScheduleNameConflict) {
			return jsonResponse(
				{
					ok: false,
					duplicate: true,
					existingSchedule: error.existing,
					message: error.message,
				},
				409,
			);
		}

		console.error("save schedule failed:", error);
		return jsonResponse({ ok: false, message: "保存课表失败" }, 500);
	}
};
