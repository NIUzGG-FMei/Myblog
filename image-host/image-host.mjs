import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, lstat, writeFile, rename, rm, copyFile } from "node:fs/promises";
import { dirname, resolve, relative, sep, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import sharp from "sharp";

const home = dirname(fileURLToPath(import.meta.url));
const root = resolve(home, "..");
const publicDir = resolve(home, "public");
const manifestPath = resolve(home, "manifest.json");
const baselinePath = resolve(home, "published.json");
const pendingPath = resolve(home, "publish-pending.json");
const maxBytes = 25 * 1024 * 1024;
const digest = data => createHash("sha256").update(data).digest("hex");
const slash = path => path.split(sep).join("/");
const escapeMd = text => String(text).replace(/[\\`*_{}\[\]<>|]/g, "\\$&").replace(/[\r\n]/g, " ");

async function safePath(path, base = root) {
	const rel = relative(base, path);
	if (rel === ".." || rel.startsWith(`..${sep}`)) throw new Error("路径必须位于工作区内");
	let cursor = base;
	if ((await lstat(cursor)).isSymbolicLink()) throw new Error("拒绝符号链接");
	for (const part of rel.split(sep).filter(Boolean)) {
		cursor = resolve(cursor, part);
		if ((await lstat(cursor)).isSymbolicLink()) throw new Error(`拒绝符号链接：${cursor}`);
	}
	return path;
}

async function readJson(path, fallback) {
	try {
		await safePath(path);
		return JSON.parse(await readFile(path, "utf8"));
	} catch (error) {
		if (error.code === "ENOENT") return fallback;
		throw error;
	}
}

async function atomic(path, value) {
	const temp = `${path}.${randomUUID()}.tmp`;
	try {
		await writeFile(temp, value, { flag: "wx" });
		await rename(temp, path);
	} finally { await rm(temp, { force: true }); }
}
const jsonWrite = (path, data) => atomic(path, `${JSON.stringify(data, null, 2)}\n`);

async function scan(dir) {
	await safePath(dir);
	const files = [];
	for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
		const path = resolve(dir, entry.name);
		if (entry.isSymbolicLink()) throw new Error(`拒绝符号链接：${path}`);
		if (entry.isDirectory()) files.push(...await scan(path));
		else if (entry.isFile()) files.push(path);
		else throw new Error(`不支持的文件：${path}`);
	}
	return files;
}

async function inventory() {
	const files = await scan(publicDir);
	if (files.length > 20000) throw new Error("文件数超过免费方案限制");
	const records = [];
	for (const path of files) {
		const name = slash(relative(publicDir, path));
		if (!["_headers", "robots.txt"].includes(name) && !/^images\/[a-f0-9]{64}\.webp$/.test(name)) throw new Error(`发布目录出现非白名单文件：${name}`);
		const data = await readFile(path);
		if (data.length > maxBytes) throw new Error(`文件超过 25 MiB：${name}`);
		if (!name.startsWith("images/")) continue;
		const hash = digest(data);
		if (name !== `images/${hash}.webp`) throw new Error(`内容哈希不匹配：${name}`);
		const meta = await sharp(data).metadata();
		if (meta.format !== "webp" || (meta.pages ?? 1) > 1) throw new Error(`不是静态 WebP：${name}`);
		records.push({ path: name, sha256: hash, bytes: data.length, width: meta.width, height: meta.height });
	}
	return records;
}

async function manifest() {
	const result = await readJson(manifestPath, { version: 1, assets: {} });
	if (result.version !== 1 || !result.assets || typeof result.assets !== "object" || Array.isArray(result.assets)) throw new Error("manifest.json 无效，请恢复备份");
	return result;
}

async function plan(sources, directoryMode) {
	const paths = new Set();
	for (const source of sources) {
		const path = await safePath(resolve(process.cwd(), source));
		// Prevent re-importing the output library, backups, or local state.
		const inHome = relative(home, path);
		if (inHome === "" || (!inHome.startsWith(`..${sep}`) && inHome !== "..")) throw new Error("请从 image-host/ 以外的原图目录导入");
		const info = await lstat(path);
		if (directoryMode && info.isDirectory()) {
			for (const file of await scan(path)) paths.add(file);
		} else if (!directoryMode && info.isFile()) paths.add(path);
		else throw new Error(directoryMode ? "batch 需要目录" : "add 需要文件");
	}
	const accepted = [], skipped = [];
	for (const path of paths) {
		const source = slash(relative(root, path));
		try {
			if (!/\.(png|jpe?g|webp|avif)$/i.test(extname(path))) throw new Error("不支持的扩展名");
			const meta = await sharp(path).metadata();
			if (!["png", "jpeg", "webp", "avif"].includes(meta.format) || (meta.pages ?? 1) > 1) throw new Error("仅支持静态图片");
			accepted.push({ path, source });
		} catch (error) {
			if (!directoryMode) throw error;
			skipped.push({ source, reason: error.message });
		}
	}
	return { accepted, skipped };
}

async function importImages(items, lossless) {
	const existing = new Set((await inventory()).map(asset => asset.path));
	const state = await manifest();
	await mkdir(resolve(publicDir, "images"), { recursive: true });
	for (const item of items) {
		await safePath(item.path);
		const original = await readFile(item.path);
		let pipeline = sharp(original).rotate();
		if (!lossless) pipeline = pipeline.resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true });
		const data = await pipeline.webp(lossless ? { lossless: true } : { quality: 85 }).toBuffer();
		if (data.length > maxBytes) throw new Error("处理后的文件超过 25 MiB");
		const hash = digest(data), path = `images/${hash}.webp`;
		if (!existing.has(path) && existing.size >= 19998) throw new Error("图片数量已达上限");
		const target = resolve(publicDir, path);
		try { await writeFile(target, data, { flag: "wx" }); }
		catch (error) {
			if (error.code !== "EEXIST") throw error;
			await safePath(target);
			if (digest(await readFile(target)) !== hash) throw new Error("同名目标被修改，拒绝覆盖");
		}
		existing.add(path);
		const meta = await sharp(data).metadata();
		const entry = state.assets[path] ?? { path, sha256: hash, bytes: data.length, width: meta.width, height: meta.height, sources: [] };
		const record = { path: item.source, originalBytes: original.length, originalSha256: digest(original), mode: lossless ? "lossless" : "quality85-max2400" };
		entry.sources = entry.sources.filter(s => s.path !== item.source);
		entry.sources.push(record);
		state.assets[path] = entry;
		await jsonWrite(manifestPath, state);
		console.log(`已本地导入：${item.source} → ${path}`);
	}
}

function baseUrl(value) {
	const url = new URL(value);
	if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("请提供不含路径、凭据和参数的 HTTPS 域名");
	return url.origin;
}

async function links(records, origin, deployed = false) {
	const state = await manifest();
	const lines = ["# 图片清单", "", deployed ? "部署命令成功；域名绑定与实际访问仍须验证。" : "待发布清单：未验证上线和域名绑定，请勿直接替换文章。", ""];
	for (const asset of records) {
		const sources = state.assets[asset.path]?.sources ?? [];
		lines.push(`## ${escapeMd(sources.length ? basename(sources[0].path) : "来源未记录")}`, "", `- 输出尺寸：${asset.width} × ${asset.height}`, `- 输出大小：${asset.bytes} 字节`, `- 输出文件：${asset.path}`);
		for (const source of sources) {
			lines.push(`- 原图：${escapeMd(source.path)}；${source.originalBytes} 字节；体积减少 ${(100 * (1 - asset.bytes / source.originalBytes)).toFixed(1)}%；模式 ${source.mode}`);
		}
		const alt = escapeMd(sources.length ? basename(sources[0].path, extname(sources[0].path)) : "图片");
		lines.push("", `![${alt}](${origin}/${asset.path})`, "");
	}
	await atomic(resolve(home, "links.md"), `${lines.join("\n")}\n`);
	console.log("已生成本地可读清单 image-host/links.md");
}

export function assertNoLoss(previous, current) {
	if (!previous || previous.version !== 1 || !Array.isArray(previous.assets) || previous.assets.length === 0) throw new Error("发布基线无效，拒绝发布");
	const now = new Map(current.map(asset => [asset.path, asset.sha256]));
	for (const asset of previous.assets) {
		if (!/^images\/[a-f0-9]{64}\.webp$/.test(asset.path) || !/^[a-f0-9]{64}$/.test(asset.sha256)) throw new Error("发布基线无效");
		if (now.get(asset.path) !== asset.sha256) throw new Error(`误删保护：已发布图片缺失或改变 ${asset.path}；请从备份恢复，不要删除基线绕过检查`);
	}
}

async function guard(records, allowFirst = false) {
	if (await readJson(pendingPath, null)) throw new Error("存在未决部署 publish-pending.json；先核对上次部署结果，禁止直接重试");
	const previous = await readJson(baselinePath, null);
	if (!previous) {
		if (!allowFirst) throw new Error("没有成功发布基线；首次部署需额外 --first-deploy，已有线上服务不可使用此标记绕过保护");
		return;
	}
	const config = await readJson(resolve(home, "wrangler.jsonc"), null);
	if (previous.worker !== config?.name) throw new Error("Worker 名称与发布基线不一致");
	assertNoLoss(previous, records);
}

async function backup(records) {
	const folder = resolve(home, ".backups", `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`);
	await mkdir(resolve(home, ".backups"), { recursive: true });
	await safePath(resolve(home, ".backups"));
	await mkdir(folder);
	for (const path of await scan(publicDir)) {
		const target = resolve(folder, "public", relative(publicDir, path));
		await mkdir(dirname(target), { recursive: true });
		await copyFile(path, target);
		if (digest(await readFile(path)) !== digest(await readFile(target))) throw new Error("备份内容校验失败");
	}
	for (const name of ["manifest.json", "published.json", "wrangler.jsonc"]) {
		try { await safePath(resolve(home, name)); await copyFile(resolve(home, name), resolve(folder, name)); }
		catch (error) { if (error.code !== "ENOENT") throw error; }
	}
	await jsonWrite(resolve(folder, "snapshot.json"), { version: 1, createdAt: new Date().toISOString(), assets: records });
	console.log(`已完成本地备份：${slash(relative(root, folder))}（不是异地备份）`);
	return folder;
}

function runWrangler(extraArgs = []) {
	return spawnSync("pnpm", ["exec", "wrangler", "deploy", "--config", resolve(home, "wrangler.jsonc"), ...extraArgs], {
		cwd: root,
		stdio: "inherit",
		// Disable optional startup update checks and post-command skill suggestions.
		// These settings affect only this child, not the user's global shell/proxy.
		env: { ...process.env, CI: "true", WRANGLER_HIDE_BANNER: "true", WRANGLER_SEND_METRICS: "false" },
	});
}

async function main() {
	const [command = "help", ...args] = process.argv.slice(2);
	const allowed = { add: ["--lossless"], batch: ["--lossless", "--confirm-import"], check: [], "dry-run": [], links: [], backup: [], "publish-check": ["--first-deploy"], publish: ["--confirm-deploy", "--first-deploy"], help: [] };
	if (!Object.hasOwn(allowed, command)) throw new Error(`未知命令：${command}`);
	for (const arg of args.filter(a => a.startsWith("--"))) if (!allowed[command].includes(arg)) throw new Error(`未知参数：${arg}`);
	const values = args.filter(a => !a.startsWith("--"));
	if (command === "help") {
		console.log("从博客根目录运行：\nnode image-host/image-host.mjs add <文件...> [--lossless]\nnode image-host/image-host.mjs batch <目录...> [--lossless] [--confirm-import]\nnode image-host/image-host.mjs check\nnode image-host/image-host.mjs dry-run\nnode image-host/image-host.mjs links https://图片域名\nnode image-host/image-host.mjs backup\nnode image-host/image-host.mjs publish-check [--first-deploy]\nnode image-host/image-host.mjs publish https://图片域名 --confirm-deploy [--first-deploy]");
		return;
	}
	if (["links", "publish"].includes(command) ? values.length !== 1 : ["add", "batch"].includes(command) ? !values.length : values.length !== 0) throw new Error("参数数量错误，请运行 help");
	if (command === "add" || command === "batch") {
		const { accepted, skipped } = await plan(values, command === "batch");
		console.log(`导入预览：${accepted.length} 张可处理，${skipped.length} 个跳过；模式 ${args.includes("--lossless") ? "无损保留尺寸" : "quality85/最长边2400"}`);
		for (const item of accepted) console.log(`  导入 ${item.source}`);
		for (const item of skipped) console.log(`  跳过 ${item.source}：${item.reason}`);
		if (command === "batch" && !args.includes("--confirm-import")) { console.log("仅预览，未导入；确认后加 --confirm-import"); return; }
		if (!accepted.length) throw new Error("没有可处理图片");
		await importImages(accepted, args.includes("--lossless"));
	} else {
		const records = await inventory();
		if (command === "check") {
			const previous = await readJson(baselinePath, null);
			if (previous) assertNoLoss(previous, records);
			console.log(`校验通过：${records.length} 张图片，${(records.reduce((n, r) => n + r.bytes, 0) / 1048576).toFixed(2)} MiB；${previous ? "发布基线完整" : "尚无发布基线"}。未上传。`);
		} else if (command === "links") await links(records, baseUrl(values[0]));
		else if (command === "backup") await backup(records);
		else if (command === "dry-run") {
			const result = runWrangler(["--dry-run"]);
			if (result.error || result.status !== 0) throw new Error("Wrangler dry-run 未正常完成；未执行真实部署");
			console.log("Wrangler dry-run 正常退出；未上传，未更新发布基线。");
		}
		else {
			if (!records.length) throw new Error("没有可发布图片");
			await guard(records, args.includes("--first-deploy"));
			if (command === "publish-check") { console.log("发布预检通过（纯本地，不代表云端账号或域名已核实）"); return; }
			const origin = baseUrl(values[0]);
			if (!args.includes("--confirm-deploy")) throw new Error("未部署：缺少 --confirm-deploy");
			const config = await readJson(resolve(home, "wrangler.jsonc"), null);
			const folder = await backup(records);
			const pending = { version: 1, worker: config.name, startedAt: new Date().toISOString(), backup: slash(relative(home, folder)), assets: records };
			await jsonWrite(pendingPath, pending);
			// Fixed explicit config: never use the blog deployment command.
			const result = runWrangler();
			if (result.error || result.status !== 0) throw new Error("部署未确认成功；保留未决记录，核对云端后再恢复操作");
			await jsonWrite(baselinePath, { version: 1, worker: config.name, deployedAt: new Date().toISOString(), assets: records });
			await rm(pendingPath);
			await links(records, origin, true);
		}
	}
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const lock = resolve(home, ".operation-lock");
	let locked = false;
	try {
		await mkdir(lock);
		locked = true;
		await main();
	} catch (error) {
		console.error(error.code === "EEXIST" && !locked ? "图床操作锁存在：先确认没有其他任务运行，异常退出后人工移除 .operation-lock 空目录" : error.message);
		process.exitCode = 1;
	} finally { if (locked) await rm(lock, { recursive: true }); }
}
