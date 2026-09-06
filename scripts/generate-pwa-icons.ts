// 生成 PWA / 移动端桌面图标（manifest 图标 + apple-touch-icon）
// 用法：npx tsx scripts/generate-pwa-icons.ts
// 来源图片：src/assets/images/logo/maomao1.png

import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const SRC = "src/assets/images/logo/maomao1.png";
const OUT_DIR = "public/favicon";

// padding 为图标四周留白比例（maskable 需要更大留白，避免被系统裁成圆形/圆角时切掉内容）
const targets = [
	{ file: "apple-touch-icon.png", size: 180, padding: 0.06 },
	{ file: "app-icon-192.png", size: 192, padding: 0.06 },
	{ file: "app-icon-512.png", size: 512, padding: 0.06 },
	{ file: "app-icon-maskable-512.png", size: 512, padding: 0.22 },
];

async function main() {
	await fs.mkdir(OUT_DIR, { recursive: true });
	for (const target of targets) {
		const pad = Math.round(target.size * target.padding);
		const inner = target.size - pad * 2;
		const innerBuffer = await sharp(SRC)
			.resize(inner, inner, { fit: "contain" })
			.png()
			.toBuffer();
		await sharp({
			create: {
				width: target.size,
				height: target.size,
				channels: 4,
				background: { r: 0, g: 0, b: 0, alpha: 0 },
			},
		})
			.composite([{ input: innerBuffer, left: pad, top: pad }])
			.png()
			.toFile(path.join(OUT_DIR, target.file));
		console.log(`已生成 ${target.file} (${target.size}x${target.size})`);
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
