import type { ScheduleCourse, TimeMode } from "@/types/schedule";

// 总节次与星期列数
export const LESSON_COUNT = 11;
export const DAY_COUNT = 7;

// 夏令时区间：5月1日 ~ 9月30日（含）使用夏令时，其余时间使用冬令时
const SUMMER_START_MONTH = 5;
const SUMMER_END_MONTH = 9;

// 冬令时时间排表（第 1 ~ 11 节）
export const WINTER_TIMES = [
	["08:00", "08:45"],
	["08:55", "09:40"],
	["10:10", "10:55"],
	["11:05", "11:50"],
	["14:00", "14:45"],
	["14:55", "15:40"],
	["16:00", "16:45"],
	["16:55", "17:40"],
	["19:00", "19:45"],
	["19:50", "20:35"],
	["20:40", "21:25"],
] as const;

// 夏令时时间排表：第 1 ~ 4 节与冬令时一致，第 5 节起整体延后 30 分钟
export const SUMMER_TIMES = [
	["08:00", "08:45"],
	["08:55", "09:40"],
	["10:10", "10:55"],
	["11:05", "11:50"],
	["14:30", "15:15"],
	["15:25", "16:10"],
	["16:30", "17:15"],
	["17:25", "18:10"],
	["19:30", "20:15"],
	["20:20", "21:05"],
	["21:10", "21:55"],
] as const;

// 根据日期（date-only，按 UTC 存储）判断使用冬令时还是夏令时
export function getTimeModeForDate(date: Date): TimeMode {
	const month = date.getUTCMonth() + 1;
	return month >= SUMMER_START_MONTH && month <= SUMMER_END_MONTH
		? "summer"
		: "winter";
}

// 获取某一节次在指定时间模式下的起止时间
export function getLessonTime(
	lesson: number,
	mode: TimeMode,
): readonly [string, string] {
	const times = mode === "summer" ? SUMMER_TIMES : WINTER_TIMES;
	return times[lesson - 1] ?? (["--:--", "--:--"] as const);
}

// 将 "YYYY-MM-DD" 解析为 date-only 的 Date（UTC 零点，避免时区干扰）
export function parseDateOnly(value: string): Date {
	const match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(value.trim());
	if (!match) throw new Error(`无法解析日期：${value}`);
	return new Date(
		Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
	);
}

// 将 date-only 的 Date 格式化为 "YYYY-MM-DD"
export function formatDateOnly(date: Date): string {
	const year = date.getUTCFullYear();
	const month = String(date.getUTCMonth() + 1).padStart(2, "0");
	const day = String(date.getUTCDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

// 当前北京时间（UTC+8）对应的本地时间 Date，便于取年月日
export function getBeijingNow(): Date {
	const now = new Date();
	return new Date(now.getTime() + (now.getTimezoneOffset() + 480) * 60000);
}

// 北京时间今天的 date-only 日期
export function getBeijingToday(): Date {
	const beijing = getBeijingNow();
	return new Date(
		Date.UTC(beijing.getFullYear(), beijing.getMonth(), beijing.getDate()),
	);
}

// 获取某个 date-only 日期所在周的星期一
export function getMondayOfWeek(date: Date): Date {
	const day = date.getUTCDay(); // 0=周日
	const offset = day === 0 ? -6 : 1 - day;
	return new Date(date.getTime() + offset * 86400000);
}

// 计算 date 相对于课表第 1 周星期一所在的周次（可能小于 1）
export function getWeekNumber(date: Date, startDate: Date): number {
	const monday = getMondayOfWeek(date);
	const days = Math.round((monday.getTime() - startDate.getTime()) / 86400000);
	return Math.floor(days / 7) + 1;
}

// 给某个星期一增加若干周
export function addWeeksToMonday(monday: Date, weeks: number): Date {
	return new Date(monday.getTime() + weeks * 7 * 86400000);
}

// 解析 "7-10周"、"2-4周,6-10周"、"12周" 等周次文本
export function parseWeeks(raw: string): number[] {
	const weeks = new Set<number>();
	for (const part of raw.split(/[,，、]/)) {
		const trimmed = part.trim();
		if (!trimmed) continue;
		const rangeMatch = /^(\d+)\s*[-~～]\s*(\d+)/.exec(trimmed);
		if (rangeMatch) {
			const start = Number(rangeMatch[1]);
			const end = Number(rangeMatch[2]);
			for (
				let week = Math.min(start, end);
				week <= Math.max(start, end);
				week++
			) {
				weeks.add(week);
			}
			continue;
		}
		const singleMatch = /(\d+)/.exec(trimmed);
		if (singleMatch) weeks.add(Number(singleMatch[1]));
	}
	return [...weeks].sort((a, b) => a - b);
}

// 解析 "第1节" 等节次文本
export function parseLessonNumber(raw: unknown): number {
	const text = String(raw ?? "");
	const match = /(\d+)/.exec(text);
	return match
		? Math.min(Math.max(Number(match[1]), 1), LESSON_COUNT)
		: Number.NaN;
}

// 解析 "星期一" ~ "星期日" 文本，返回 1~7
const DAY_LABELS: Record<string, number> = {
	星期一: 1,
	星期二: 2,
	星期三: 3,
	星期四: 4,
	星期五: 5,
	星期六: 6,
	星期日: 7,
	星期天: 7,
};

export function parseDayOfWeek(raw: unknown): number {
	const text = String(raw ?? "").trim();
	if (/^\d+$/.test(text)) {
		const num = Number(text);
		return num >= 1 && num <= 7 ? num : Number.NaN;
	}
	return DAY_LABELS[text] ?? Number.NaN;
}

// 从 xls 行数据（首行为表头）解析出课程列表，兼容导入与构建期转换
export function parseScheduleRows(rows: unknown[][]): ScheduleCourse[] {
	if (!rows.length) return [];
	const header = rows[0].map((cell) => String(cell ?? "").trim());
	const indexOf = (name: string) => header.indexOf(name);
	const nameIndex = indexOf("课程名");
	const weeksIndex = indexOf("上课周次");
	const dayIndex = indexOf("上课星期");
	const startIndex = indexOf("开始节次");
	const endIndex = indexOf("结束节次");
	const classroomIndex = indexOf("教室名称");
	if (
		nameIndex < 0 ||
		weeksIndex < 0 ||
		dayIndex < 0 ||
		startIndex < 0 ||
		endIndex < 0 ||
		classroomIndex < 0
	) {
		throw new Error(
			"课表格式不正确：缺少 课程名/上课周次/上课星期/开始节次/结束节次/教室名称 列",
		);
	}

	const courses: ScheduleCourse[] = [];
	for (const row of rows.slice(1)) {
		const name = String(row[nameIndex] ?? "").trim();
		const weeksRaw = String(row[weeksIndex] ?? "").trim();
		const day = parseDayOfWeek(row[dayIndex]);
		const startLesson = parseLessonNumber(row[startIndex]);
		const endLesson = parseLessonNumber(row[endIndex]);
		const classroom = String(row[classroomIndex] ?? "").trim();
		if (!name || !weeksRaw || Number.isNaN(day)) continue;
		if (Number.isNaN(startLesson) || Number.isNaN(endLesson)) continue;
		courses.push({
			name,
			classroom,
			weeks: parseWeeks(weeksRaw),
			day,
			startLesson: Math.min(startLesson, endLesson),
			endLesson: Math.max(startLesson, endLesson),
		});
	}
	return courses;
}
