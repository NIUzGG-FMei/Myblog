// 课表相关类型定义
// Schedule related type definitions

// 单条课程安排（来自 xls 的一行，可能跨多节课/多周）
export type ScheduleCourse = {
	name: string; // 课程名
	classroom: string; // 教室名称
	weeks: number[]; // 上课周次（从第 1 周开始计数）
	day: number; // 星期几：1=周一 ... 7=周日
	startLesson: number; // 开始节次（1~11）
	endLesson: number; // 结束节次（1~11）
};

// 一份课表数据
export type ScheduleData = {
	name: string; // 课表名称
	startDate: string; // 第 1 周星期一的日期（YYYY-MM-DD）
	courses: ScheduleCourse[];
};

// 保存在服务端（D1）的课表
export type ServerSchedule = ScheduleData & {
	id: string;
};

// 时间排表模式：冬令时 / 夏令时
export type TimeMode = "winter" | "summer";
