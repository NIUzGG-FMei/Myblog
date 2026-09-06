// 将课表 xls/xlsx 文件转换为内置课表 JSON 数据
// 用法：npx tsx scripts/convert-schedule.ts <xls路径> <第1周周一日期YYYY-MM-DD> <课表名称> [输出路径]
// 示例：npx tsx scripts/convert-schedule.ts "/mnt/c/.../我的课表2026-秋季.xls" 2026-09-07 "2026-秋季课表"

import fs from "node:fs/promises";
import path from "node:path";
import XLSX from "xlsx";
import { parseScheduleRows } from "../src/utils/schedule/schedule-utils";

async function main() {
	const args = process.argv.slice(2);
	if (args.length < 3) {
		console.error(
			"用法：npx tsx scripts/convert-schedule.ts <xls路径> <第1周周一日期YYYY-MM-DD> <课表名称> [输出路径]",
		);
		process.exit(1);
	}

	const [xlsPath, startDate, name, outputPath] = args;
	const output = outputPath ?? path.resolve("src/constants/scheduleData.json");

	// 校验日期格式
	if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
		console.error("日期格式不正确，应为 YYYY-MM-DD");
		process.exit(1);
	}

	const workbook = XLSX.readFile(xlsPath, { cellDates: false });
	const sheetName = workbook.SheetNames[0];
	if (!sheetName) {
		console.error("xls 文件中没有工作表");
		process.exit(1);
	}
	const sheet = workbook.Sheets[sheetName];
	const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
		header: 1,
		raw: false,
		defval: "",
	});

	const courses = parseScheduleRows(rows);
	if (!courses.length) {
		console.error("未解析出任何课程，请检查课表格式");
		process.exit(1);
	}

	const data = { name, startDate, courses };
	await fs.writeFile(output, `${JSON.stringify(data, null, "\t")}\n`, "utf8");
	console.log(
		`已生成 ${output}：共 ${courses.length} 条课程记录，第 1 周周一 = ${startDate}`,
	);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
