import type { ScheduleCourse, ServerSchedule } from "@/types/schedule";
import { jsonResponse, sha256 } from "@/utils/guestbook/guestbook-server";

type ScheduleRow = {
	id: string;
	name: string;
	start_date: string;
	courses: string;
	created_at: number;
};

export type ScheduleConflict = Pick<ServerSchedule, "id" | "name">;

export class ScheduleNameConflict extends Error {
	constructor(public readonly existing: ScheduleConflict) {
		super(`课表名称“${existing.name}”已存在`);
		this.name = "ScheduleNameConflict";
	}
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function verifySchedulePassword(
	expectedPassword: string | undefined,
	submitted: unknown,
): Promise<boolean> {
	if (!expectedPassword) return false;
	if (typeof submitted !== "string" || submitted.length === 0) return false;
	const start = Date.now();
	let matches = false;
	try {
		const [expected, actual] = await Promise.all([
			sha256(expectedPassword),
			sha256(submitted),
		]);
		matches = expected === actual;
	} catch {
		matches = false;
	}
	await new Promise((resolve) =>
		setTimeout(resolve, Math.max(0, 300 - (Date.now() - start))),
	);
	return matches;
}

// 校验单条课程结构，避免脏数据入库
function isValidCourse(value: unknown): value is ScheduleCourse {
	if (!value || typeof value !== "object") return false;
	const course = value as Record<string, unknown>;
	return (
		typeof course.name === "string" &&
		typeof course.classroom === "string" &&
		Array.isArray(course.weeks) &&
		course.weeks.every(
			(week) => Number.isInteger(week) && week > 0 && week <= 60,
		) &&
		typeof course.day === "number" &&
		course.day >= 1 &&
		course.day <= 7 &&
		typeof course.startLesson === "number" &&
		course.startLesson >= 1 &&
		course.startLesson <= 11 &&
		typeof course.endLesson === "number" &&
		course.endLesson >= 1 &&
		course.endLesson <= 11
	);
}

export function parseSchedulePayload(body: unknown): {
	name: string;
	startDate: string;
	courses: ScheduleCourse[];
} | null {
	if (!body || typeof body !== "object") return null;
	const payload = body as Record<string, unknown>;
	const name = typeof payload.name === "string" ? payload.name.trim() : "";
	const prefix =
		typeof payload.prefix === "string" ? payload.prefix.trim() : "";
	const startDate =
		typeof payload.startDate === "string" ? payload.startDate.trim() : "";
	const courses = Array.isArray(payload.courses) ? payload.courses : [];
	if (!name || name.length > 200 || !prefix || prefix.length > 100) return null;
	if (!DATE_RE.test(startDate)) return null;
	if (!courses.length || courses.length > 2000) return null;
	if (!courses.every(isValidCourse)) return null;
	return { name, startDate, courses };
}

function rowToSchedule(row: ScheduleRow): ServerSchedule | null {
	try {
		const courses = JSON.parse(row.courses);
		if (
			!Array.isArray(courses) ||
			!courses.length ||
			!courses.every(isValidCourse)
		) {
			return null;
		}
		return {
			id: row.id,
			name: row.name,
			startDate: row.start_date,
			courses,
		};
	} catch {
		return null;
	}
}

export async function findServerScheduleByName(
	env: Env,
	name: string,
): Promise<ScheduleConflict | null> {
	if (!env.DB) return null;
	const row = await env.DB.prepare(
		"SELECT id, name FROM schedule_imports WHERE name = ? ORDER BY created_at ASC, id ASC LIMIT 1",
	)
		.bind(name)
		.first<ScheduleConflict>();
	return row ?? null;
}

async function findServerScheduleById(
	env: Env,
	id: string,
): Promise<ServerSchedule | null> {
	if (!env.DB) return null;
	const row = await env.DB.prepare(
		"SELECT id, name, start_date, courses, created_at FROM schedule_imports WHERE id = ?",
	)
		.bind(id)
		.first<ScheduleRow>();
	return row ? rowToSchedule(row) : null;
}

export async function listServerSchedules(env: Env): Promise<ServerSchedule[]> {
	if (!env.DB) return [];
	const result = await env.DB.prepare(
		"SELECT id, name, start_date, courses, created_at FROM schedule_imports ORDER BY created_at ASC, id ASC",
	).all<ScheduleRow>();
	return (result.results ?? [])
		.map(rowToSchedule)
		.filter((schedule): schedule is ServerSchedule => schedule !== null);
}

export async function insertServerSchedule(
	env: Env,
	schedule: { name: string; startDate: string; courses: ScheduleCourse[] },
): Promise<ServerSchedule> {
	const id = crypto.randomUUID();
	const result: ServerSchedule = { id, ...schedule };
	if (!env.DB) throw new Error("数据库尚未配置");
	const insertResult = await env.DB.prepare(
		"INSERT INTO schedule_imports (id, name, start_date, courses, created_at) SELECT ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM schedule_imports WHERE name = ?)",
	)
		.bind(
			id,
			schedule.name,
			schedule.startDate,
			JSON.stringify(schedule.courses),
			Date.now(),
			schedule.name,
		)
		.run();
	if (insertResult.meta?.changes === 0) {
		const existing = await findServerScheduleByName(env, schedule.name);
		if (existing) throw new ScheduleNameConflict(existing);
		throw new Error("课表名称冲突，但无法读取现有课表");
	}
	return result;
}

export async function updateServerSchedule(
	env: Env,
	id: string,
	schedule: { name: string; startDate: string; courses: ScheduleCourse[] },
): Promise<ServerSchedule | null> {
	if (!env.DB) throw new Error("数据库尚未配置");
	await env.DB.prepare(
		"UPDATE schedule_imports SET start_date = ?, courses = ? WHERE id = ? AND name = ?",
	)
		.bind(
			schedule.startDate,
			JSON.stringify(schedule.courses),
			id,
			schedule.name,
		)
		.run();
	return findServerScheduleById(env, id);
}

export async function deleteServerSchedule(
	env: Env,
	id: string,
): Promise<void> {
	if (!env.DB) throw new Error("数据库尚未配置");
	await env.DB.prepare("DELETE FROM schedule_imports WHERE id = ?")
		.bind(id)
		.run();
}

export function unauthorized(): Response {
	return jsonResponse({ ok: false, message: "密码错误" }, 401);
}
