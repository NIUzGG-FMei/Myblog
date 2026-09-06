<script lang="ts">
import type { ScheduleCourse, ScheduleData, TimeMode } from "@/types/schedule";
import {
	addWeeksToMonday,
	DAY_COUNT,
	formatDateOnly,
	getBeijingToday,
	getLessonTime,
	getTimeModeForDate,
	getWeekNumber,
	LESSON_COUNT,
	parseDateOnly,
	parseScheduleRows,
} from "@/utils/schedule/schedule-utils";

interface Props {
	defaultSchedule: ScheduleData;
}

let { defaultSchedule }: Props = $props();

const STORAGE_KEY = "firefly-schedule-imports";
const DAY_NAMES = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const MODE_LABELS: Record<TimeMode, string> = {
	winter: "冬令时",
	summer: "夏令时",
};

function isScheduleData(value: unknown): value is ScheduleData {
	if (!value || typeof value !== "object") return false;
	const item = value as Record<string, unknown>;
	return (
		typeof item.name === "string" &&
		typeof item.startDate === "string" &&
		/^\d{4}-\d{2}-\d{2}$/.test(item.startDate) &&
		Array.isArray(item.courses)
	);
}

function loadImported(): ScheduleData[] {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const parsed: unknown = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed.filter(isScheduleData) : [];
	} catch {
		return [];
	}
}

function saveImported(list: ScheduleData[]) {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
	} catch {
		// 忽略存储失败（如隐私模式）
	}
}

let imported = $state<ScheduleData[]>(loadImported());
let selectedIndex = $state(0);
let weekOffset = $state(0);

let verifyDone = $state(false);
let passwordModalOpen = $state(false);
let password = $state("");
let passwordError = $state("");
let passwordBusy = $state(false);

	let importModalOpen = $state(false);
	let importFile = $state<File | null>(null);
	let importStartDate = $state("");
	let importPrefix = $state("");
	let importName = $state("");
	let importError = $state("");
	let importBusy = $state(false);
	let fileInput: HTMLInputElement | undefined = $state();

const schedules = $derived([defaultSchedule, ...imported]);
const schedule = $derived(schedules[selectedIndex] ?? defaultSchedule);
const startDate = $derived(parseDateOnly(schedule.startDate));
const today = getBeijingToday();
const todayDayIndex = $derived.by(() => {
	const day = today.getUTCDay();
	return day === 0 ? 7 : day;
});
const currentWeek = $derived(getWeekNumber(today, startDate));
const displayWeek = $derived(currentWeek + weekOffset);
const weekMonday = $derived(addWeeksToMonday(startDate, displayWeek - 1));
const timeMode = $derived(getTimeModeForDate(weekMonday));
const weekRange = $derived.by(() => {
	const start = formatDateOnly(weekMonday).slice(5);
	const end = formatDateOnly(
		new Date(weekMonday.getTime() + 6 * 86400000),
	).slice(5);
	return `${start} ~ ${end}`;
});
const weekDays = $derived.by(() =>
	Array.from(
		{ length: DAY_COUNT },
		(_, index) => new Date(weekMonday.getTime() + index * 86400000),
	),
);
const isCurrentWeek = $derived(displayWeek === currentWeek);

// 网格：行=节次，列=星期，单元格为该周当天该节次的课程
const grid = $derived.by(() => {
	const cells: ScheduleCourse[][] = Array.from(
		{ length: LESSON_COUNT * DAY_COUNT },
		() => [],
	);
	for (const course of schedule.courses) {
		if (!course.weeks.includes(displayWeek)) continue;
		if (course.day < 1 || course.day > DAY_COUNT) continue;
		for (
			let lesson = course.startLesson;
			lesson <= course.endLesson && lesson <= LESSON_COUNT;
			lesson++
		) {
			const index = (lesson - 1) * DAY_COUNT + (course.day - 1);
			const list = cells[index];
			if (
				!list.some(
					(item) =>
						item.name === course.name && item.classroom === course.classroom,
				)
			) {
				list.push(course);
			}
		}
	}
	return cells;
});

function cellCourses(lesson: number, day: number): ScheduleCourse[] {
	return grid[(lesson - 1) * DAY_COUNT + (day - 1)] ?? [];
}

const hasCoursesInWeek = $derived(grid.some((cell) => cell.length > 0));
const firstCourseWeek = $derived.by(() => {
	let min = Number.POSITIVE_INFINITY;
	for (const course of schedule.courses) {
		for (const week of course.weeks) {
			if (week < min) min = week;
		}
	}
	return Number.isFinite(min) ? min : null;
});
const lastCourseWeek = $derived.by(() => {
	let max = 0;
	for (const course of schedule.courses) {
		for (const week of course.weeks) {
			if (week > max) max = week;
		}
	}
	return max > 0 ? max : null;
});
const jumpWeek = $derived.by(() => {
	if (hasCoursesInWeek) return null;
	if (firstCourseWeek === null || lastCourseWeek === null) return null;
	if (displayWeek < firstCourseWeek) return firstCourseWeek;
	if (displayWeek > lastCourseWeek) return lastCourseWeek;
	return null;
});

function selectSchedule(index: number) {
	selectedIndex = index;
	weekOffset = 0;
}

function openImport() {
	passwordError = "";
	if (verifyDone) {
		resetImportForm();
		importModalOpen = true;
	} else {
		password = "";
		passwordModalOpen = true;
	}
}

async function submitPassword() {
	if (!password || passwordBusy) return;
	passwordBusy = true;
	passwordError = "";
	try {
		const response = await fetch("/api/schedule/verify/", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ password }),
		});
		const result = (await response.json()) as {
			ok?: boolean;
			message?: string;
		};
		if (response.ok && result.ok) {
			verifyDone = true;
			passwordModalOpen = false;
			resetImportForm();
			importModalOpen = true;
		} else {
			passwordError = result.message || "密码错误";
		}
	} catch {
		passwordError = "网络错误，请稍后重试";
	} finally {
		passwordBusy = false;
	}
}

	function resetImportForm() {
		importFile = null;
		importStartDate = "";
		importPrefix = "";
		importName = "";
		importError = "";
		if (fileInput) fileInput.value = "";
	}

async function confirmImport() {
	if (importBusy) return;
	const file = importFile;
	if (!file) {
		importError = "请选择要导入的 xls 课表文件";
		return;
	}
	if (!/^\d{4}-\d{2}-\d{2}$/.test(importStartDate.trim())) {
		importError = "请填写第 1 周星期一的日期（格式 YYYY-MM-DD）";
		return;
	}
	const date = parseDateOnly(importStartDate.trim());
	const weekday = date.getUTCDay();
	if (weekday !== 1) {
		importError = "该日期不是星期一，请检查后重新填写";
		return;
	}
	importBusy = true;
	importError = "";
	try {
		const XLSX = await import("xlsx");
		const buffer = await file.arrayBuffer();
		const workbook = XLSX.read(buffer, { type: "array" });
		const sheetName = workbook.SheetNames[0];
		if (!sheetName) throw new Error("文件中没有工作表");
		const sheet = workbook.Sheets[sheetName];
		const rows = XLSX.utils.sheet_to_json(sheet, {
			header: 1,
			raw: false,
			defval: "",
		}) as unknown[][];
		const courses = parseScheduleRows(rows);
		if (!courses.length) {
			throw new Error("未解析出任何课程，请确认课表格式与示例一致");
		}
			const fileBaseName = file.name.replace(/\.(xls|xlsx)$/i, "");
			const prefix = importPrefix.trim();
			const suffix = importName.trim() || fileBaseName;
			const newSchedule: ScheduleData = {
				name: prefix ? `${prefix}·${suffix}` : suffix,
				startDate: importStartDate.trim(),
				courses,
			};
		imported = [...imported, newSchedule];
		saveImported(imported);
		selectSchedule(imported.length);
		importModalOpen = false;
	} catch (error) {
		importError = error instanceof Error ? error.message : "导入失败，请重试";
	} finally {
		importBusy = false;
	}
}

function deleteSelected() {
	if (selectedIndex <= 0) return;
	const target = schedules[selectedIndex];
	if (!window.confirm(`确定删除课表「${target.name}」吗？`)) return;
	const importedIndex = selectedIndex - 1;
	imported = imported.filter((_, index) => index !== importedIndex);
	saveImported(imported);
	selectSchedule(0);
}

function portal(node: HTMLElement) {
	document.body.appendChild(node);
	return {
		destroy() {
			node.remove();
		},
	};
}

function onPasswordKeydown(event: KeyboardEvent) {
	if (event.key === "Enter") submitPassword();
}
</script>

<div class="flex flex-wrap items-center gap-2 mb-4">
	<select
		class="rounded-lg border border-(--line-divider) bg-(--card-bg) px-3 py-1.5 text-sm text-90 outline-none cursor-pointer"
		value={selectedIndex}
		onchange={(event) =>
			selectSchedule(Number((event.currentTarget as HTMLSelectElement).value))}
		aria-label="选择课表"
	>
		{#each schedules as item, index}
			<option value={index}>
				{index === 0 ? "默认课表 · " : "导入课表 · "}{item.name}
			</option>
		{/each}
	</select>

	{#if selectedIndex > 0}
		<button
			class="rounded-lg border border-(--line-divider) px-3 py-1.5 text-sm text-75 hover:text-(--danger-color, #f87171) hover:border-(--danger-color, #f87171) transition-colors cursor-pointer"
			onclick={deleteSelected}
		>
			删除此课表
		</button>
	{/if}

	<button
		class="ml-auto rounded-lg bg-(--primary) px-3.5 py-1.5 text-sm text-white transition-opacity hover:opacity-90 cursor-pointer"
		onclick={openImport}
	>
		导入课表
	</button>
</div>

<div class="flex items-center justify-between gap-3 mb-4">
	<button
		class="rounded-lg border border-(--line-divider) px-3 py-1.5 text-sm text-75 hover:bg-(--primary)/10 transition-colors cursor-pointer"
		onclick={() => (weekOffset -= 1)}
		aria-label="上一周"
	>
		‹ 上一周
	</button>

	<div class="text-center">
		<div class="text-lg font-bold text-90">
			{displayWeek >= 1 ? `第 ${displayWeek} 周` : "假期"}
		</div>
		<div class="text-xs text-75">
			{weekRange} · {MODE_LABELS[timeMode]}
			{isCurrentWeek ? " · 本周" : ""}
		</div>
	</div>

	<button
		class="rounded-lg border border-(--line-divider) px-3 py-1.5 text-sm text-75 hover:bg-(--primary)/10 transition-colors cursor-pointer"
		onclick={() => (weekOffset += 1)}
		aria-label="下一周"
	>
		下一周 ›
	</button>
</div>

{#if weekOffset !== 0}
	<div class="flex justify-center mb-4">
		<button
			class="rounded-lg bg-(--primary)/15 px-3.5 py-1.5 text-sm text-(--primary) transition-opacity hover:opacity-80 cursor-pointer"
			onclick={() => (weekOffset = 0)}
		>
			回到本周
		</button>
	</div>
{/if}

<div class="overflow-x-auto rounded-lg border border-(--line-divider)">
	<table class="w-full min-w-190 border-collapse text-sm">
		<thead>
			<tr class="bg-(--primary)/5">
				<th
					class="sticky left-0 z-10 border-r border-(--meta-divider) bg-(--card-bg) px-2 py-2 text-xs font-medium text-75 whitespace-nowrap"
				>
					节次 / 时间
				</th>
				{#each DAY_NAMES as name, dayIndex}
					<th
						class={`border-l border-(--meta-divider) px-2 py-2 text-xs font-medium text-75${isCurrentWeek && todayDayIndex === dayIndex + 1 ? " text-(--primary) font-bold" : ""}`}
					>
						{name}
					</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{#each Array.from({ length: LESSON_COUNT }, (_, index) => index + 1) as lesson (lesson)}
				{@const [lessonStart, lessonEnd] = getLessonTime(lesson, timeMode)}
				<tr class="border-t border-(--line-divider)">
					<td
						class="sticky left-0 z-10 border-r border-(--meta-divider) bg-(--card-bg) px-2 py-1.5 text-xs text-75 whitespace-nowrap"
					>
						<div class="font-medium text-90">第 {lesson} 节</div>
						<div>{lessonStart} - {lessonEnd}</div>
					</td>
					{#each weekDays as _, dayIndex}
						{@const courses = cellCourses(lesson, dayIndex + 1)}
						<td
							class={`border-l border-(--meta-divider) px-1.5 py-1.5 align-top${isCurrentWeek && todayDayIndex === dayIndex + 1 ? " bg-(--primary)/5" : ""}`}
						>
							{#if courses.length}
								{#each courses as course (course.name + course.classroom)}
									<div class="mb-1 last:mb-0">
										<div class="text-90 leading-snug">{course.name}</div>
										{#if course.classroom}
											<div class="text-xs text-75 leading-snug">
												{course.classroom}
											</div>
										{/if}
									</div>
								{/each}
							{/if}
						</td>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<div class="mt-4 rounded-lg border border-(--primary)/30 bg-(--primary)/10 p-3 text-sm text-90">
	<div class="mb-1.5 font-bold text-(--primary)">教室说明</div>
	<ul class="space-y-1">
		<li>N8：北校区8号教学楼</li>
		<li>S3：南校区3号教学楼</li>
		<li>T：阶梯教室</li>
		<li>A：理科楼</li>
	</ul>
</div>

{#if !hasCoursesInWeek}
	<div class="mt-3 flex flex-wrap items-center justify-center gap-3 rounded-lg border border-dashed border-(--line-divider) p-4 text-sm text-75">
		<span>
			{#if displayWeek < 1}
				学期尚未开始，第 1 周从 {formatDateOnly(startDate)}（周一）开始
			{:else}
				第 {displayWeek} 周暂无课程安排
			{/if}
		</span>
		{#if jumpWeek !== null}
			<button
				class="rounded-lg bg-(--primary) px-3.5 py-1.5 text-sm text-white transition-opacity hover:opacity-90 cursor-pointer"
				onclick={() => (weekOffset = jumpWeek - currentWeek)}
			>
				查看第 {jumpWeek} 周课程
			</button>
		{/if}
	</div>
{/if}

{#if passwordModalOpen}
	<div use:portal>
		<div
			class="fixed inset-0 z-100 flex items-center justify-center bg-black/50 p-4"
			role="dialog"
			aria-modal="true"
			onclick={(event) => {
				if (event.target === event.currentTarget) passwordModalOpen = false;
			}}
		>
			<div class="w-full max-w-sm rounded-(--radius-large) bg-(--card-bg) p-6 shadow-xl">
				<h3 class="mb-4 text-lg font-bold text-90">管理员验证</h3>
				<p class="mb-4 text-sm text-75">导入课表需要输入博客管理密码</p>
				<input
					type="password"
					class="mb-3 w-full rounded-lg border border-(--line-divider) bg-(--card-bg) px-3 py-2 text-sm text-90 outline-none focus:border-(--primary)"
					placeholder="请输入管理密码"
					bind:value={password}
					onkeydown={onPasswordKeydown}
				/>
				{#if passwordError}
					<p class="mb-3 text-sm text-(--danger-color, #f87171)">{passwordError}</p>
				{/if}
				<div class="flex justify-end gap-2">
					<button
						class="rounded-lg border border-(--line-divider) px-4 py-1.5 text-sm text-75 transition-colors hover:bg-(--primary)/10 cursor-pointer"
						onclick={() => (passwordModalOpen = false)}
					>
						取消
					</button>
					<button
						class="rounded-lg bg-(--primary) px-4 py-1.5 text-sm text-white transition-opacity hover:opacity-90 cursor-pointer disabled:opacity-60"
						onclick={submitPassword}
						disabled={passwordBusy || !password}
					>
						{passwordBusy ? "验证中…" : "确认"}
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

{#if importModalOpen}
	<div use:portal>
		<div
			class="fixed inset-0 z-100 flex items-center justify-center bg-black/50 p-4"
			role="dialog"
			aria-modal="true"
			onclick={(event) => {
				if (event.target === event.currentTarget) importModalOpen = false;
			}}
		>
			<div class="w-full max-w-md rounded-(--radius-large) bg-(--card-bg) p-6 shadow-xl">
				<h3 class="mb-4 text-lg font-bold text-90">导入课表</h3>

				<label class="mb-1 block text-sm text-75">课表文件（xls / xlsx）</label>
				<input
					type="file"
					accept=".xls,.xlsx"
					bind:this={fileInput}
					class="mb-3 w-full text-sm text-75 file:mr-3 file:rounded-lg file:border-0 file:bg-(--primary)/15 file:px-3 file:py-1.5 file:text-(--primary) file:cursor-pointer"
					onchange={(event) => {
						const input = event.currentTarget as HTMLInputElement;
						importFile = input.files?.[0] ?? null;
					}}
				/>

				<label class="mb-1 block text-sm text-75">
					第 1 周星期一的日期（YYYY-MM-DD）
				</label>
				<input
					type="date"
					class="mb-1 w-full rounded-lg border border-(--line-divider) bg-(--card-bg) px-3 py-2 text-sm text-90 outline-none focus:border-(--primary)"
					bind:value={importStartDate}
				/>
				<p class="mb-3 text-xs text-75">
					用于定位周次，例如示例课表为 2026-09-07
				</p>

				<label class="mb-1 block text-sm text-75">
					课表前缀（可选，如 mfw）
				</label>
				<input
					type="text"
					class="mb-1 w-full rounded-lg border border-(--line-divider) bg-(--card-bg) px-3 py-2 text-sm text-90 outline-none focus:border-(--primary)"
					placeholder="留空则不添加前缀"
					bind:value={importPrefix}
				/>
				<p class="mb-3 text-xs text-75">前缀与名称之间会自动用“·”连接</p>

				<label class="mb-1 block text-sm text-75">
					课表名称（如 2026-秋季课表）
				</label>
				<input
					type="text"
					class="mb-3 w-full rounded-lg border border-(--line-divider) bg-(--card-bg) px-3 py-2 text-sm text-90 outline-none focus:border-(--primary)"
					placeholder="默认使用文件名"
					bind:value={importName}
				/>

				{#if importError}
					<p class="mb-3 text-sm text-(--danger-color, #f87171)">{importError}</p>
				{/if}

				<div class="flex justify-end gap-2">
					<button
						class="rounded-lg border border-(--line-divider) px-4 py-1.5 text-sm text-75 transition-colors hover:bg-(--primary)/10 cursor-pointer"
						onclick={() => (importModalOpen = false)}
					>
						取消
					</button>
					<button
						class="rounded-lg bg-(--primary) px-4 py-1.5 text-sm text-white transition-opacity hover:opacity-90 cursor-pointer disabled:opacity-60"
						onclick={confirmImport}
						disabled={importBusy}
					>
						{importBusy ? "解析中…" : "导入"}
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}
