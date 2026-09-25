# 独立静态图床（14 张博文图片已上线）

## 阅读入口与当前状态

更新日期：2026-09-26。已完成首次真实部署和 14 张图片的 HTTPS/哈希验证；用户已绑定自定义域名 `img.2298321.xyz`，14 张图片的 HTTPS/哈希验证通过；三篇博文已接入并发布博客，线上首页及三篇文章、14 张图片全部验证通过。

当前范围：仅博文正文和封面，共 14 张。用户已确认 Workers Free 并批准真实发布，不涉及其他网站素材。

- 正式图片地址：`https://img.2298321.xyz`
- 保留的测试入口：`https://mfwblog-images.niuziqq7878.workers.dev`
- 示例：[打开 DETR 流程图](https://img.2298321.xyz/images/fb86737cdd993c0a44c4a3a018d60b46988f7c6daa41ec6195a51b03ec708cb3.webp)
- 纯图片站没有首页，直接访问根地址返回 404 属正常；请使用图片完整链接。
- 当前 `published.json` 已建立基线，后续发布不要使用 `--first-deploy`。

- **首次使用**：先读 [分步使用指南](../MyGuidance/图床使用指南.md)，按“导入 → 校验 → 清单 → 备份”操作。
- **实际进展**：查看 [建设进度与验证记录](PROGRESS.md)，区分已完成与计划步骤。
- **自定义域名**：查看 [绑定指引与冲突注意事项](CUSTOM-DOMAIN.md)；已完成控制台绑定及 HTTPS 验证。
- **命令速查**：继续阅读本页；`links.md` 是脚本生成的图片清单；当前 14 张图片已验证，未来新生成的链接仍需部署后验证。

当前图集为 DETR 6 张、OBB 7 张、桌面宠物封面 1 张，总计 6.33 MiB。原图全部保留。
“发布前检查”是本地检查，不会验证账号套餐、域名绑定或云端资源。
只有明确执行带确认参数的 `publish` 才会调用云端部署；不能将模拟测试当作真实上线。


使用博客现有 pnpm、sharp 和 Wrangler，不新增依赖，不修改博客部署配置。
已部署的独立 Worker 名为 `mfwblog-images`；只有 `public/` 上传，不包含下面的本地清单和备份。
配置已同步 `img.2298321.xyz` 的 Custom Domain，保留 `workers_dev: true`；没有账号密钥、R2/KV/D1 或 Worker 业务脚本。

## 博文接入状态

三篇共 14 张唯一图片、16 处正文/封面引用已上线。用户已确认三篇本地预览正常；博客发布后首页及三篇文章 HTTP 200，14 张图片下载哈希全部匹配。

- 博客：https://2298321.xyz/
- 图床：https://img.2298321.xyz （无首页，请使用完整图片链接）
- [博客发布结果与旧版本回滚信息](BLOG-RELEASE.md)
- [三篇图片映射与源码回滚](BLOG-MIGRATION.md)

临时本地预览已停止，所有原图保留，没有 Git 提交或推送。博客部署应使用 `pnpm run deploy`；图床仍使用本目录脚本，不要混淆。

## 1. 导入单张图片

在博客根目录运行：

```bash
# 论文图表：保留尺寸，无损编码
node image-host/image-host.mjs add src/content/posts/images/detr/detr-overview.png --lossless
# 普通照片：最长边 2400，WebP quality 85
node image-host/image-host.mjs add path/to/photo.jpg
```

仅接收工作区内、image-host 目录外的静态 PNG/JPEG/WebP/AVIF。
拒绝符号链接、SVG、动画。原图不改动；按 EXIF 方向旋转，默认移除原始元数据。
无损编码不恢复原图已有损失；完全透明区域的隐藏 RGB 可能被编码器归一化，不保证源文件全部通道字节相同。哈希基于输出内容，重复图片共享同一输出文件。
更换编码版本/模式可能产生新哈希；不会自动删除旧文件。

## 2. 整目录批量导入（先预览）

```bash
# 递归列出将导入与跳过的文件，不处理图片、不新增清单
node image-host/image-host.mjs batch src/content/posts/images/detr --lossless
# 看过预览后确认导入
node image-host/image-host.mjs batch src/content/posts/images/detr --lossless --confirm-import
```

目录中的不支持格式或损坏图片会列出原因并跳过。符号链接会中止整个预览，不跟随链接。
每次确认会重新扫描，请确认目录未被其他程序修改。不要选择包含依赖/备份的整个项目目录。
批处理不是事务：中途失败时保留已经成功导入的图片及来源记录，修复问题后重跑可去重。
同一时间只运行一个图床命令；异常退出遗留 `.operation-lock` 时，确认没有任务运行后才移除该空目录。

## 3. 可读清单

```bash
node image-host/image-host.mjs check
node image-host/image-host.mjs links https://img.2298321.xyz
```

- `manifest.json`：持久来源记录，包含原始相对路径、原图哈希与大小、输出尺寸、模式和输出大小。多个来源可对应一张图片。建议纳入私有备份/Git，不上传图床。
- `links.md`：可再生清单，显示文件名、尺寸、压缩前后大小、比例和 Markdown 链接；已被 Git 忽略。
- 旧图片若没有来源记录，仍可生成链接，标记为“来源未记录”；重新 `add` 原图可补记录。
- 域名仅用于生成链接，不会配置 DNS，也不意味着链接已经可访问。
- 原始路径本身可能包含隐私，不要把清单提交到不适合公开的仓库。

## 4. 本地备份与误删保护

```bash
node image-host/image-host.mjs backup
# 首次上线前的纯本地预检
node image-host/image-host.mjs publish-check --first-deploy
# 已经成功发布过则直接使用：
node image-host/image-host.mjs publish-check
```

`backup` 创建 `.backups/<时间-随机标识>/`，复制完整 public、清单、配置和已有发布基线，并校验复制内容。
备份不包含原图；原图仍需单独保留。备份目录被 Git 忽略，不会上传。
本地备份和原文件在同一磁盘，不能应对磁盘损坏，请另行复制到自己的离线盘/备份位置。脚本不自动清理旧备份。

首次成功发布后生成 `published.json`，记录上次发布的图片哈希清单和 Worker 名称。
后续发布及 `publish-check` 会拒绝：上次发布的图片缺失、内容改变、Worker 名称变化、损坏的基线、未决部署。
`check` 也会在有基线时检查旧图片完整性。新图片可以追加，旧图不会自动清理。

恢复误删：从最近的完整备份复制缺失图片回 `public/images/`，再运行 `check` 和 `publish-check`。
不要删除/篡改 `published.json` 来绕过保护。第一版不提供强制删除已发布图片的选项。
该机制是本地防误操作，不是远程资产审计：不能检测别人通过控制台部署的修改，也无法识别被手动删除的全部状态文件。
`--first-deploy` 仅用于真正首次发布，不能用于已有线上服务；首次上线前务必核实同名 Worker 不存在。

## 5. 发布（当前已完成首次部署）

部署前确认：自己的账号、Workers Free、无同名服务冲突、图片可公开、不升级或开通付费服务。
本机通过 Wrangler 授权；不要向聊天、仓库或脚本粘贴 Token。
先使用实际 workers.dev 测试域名，随后另行确认绑定自定义域名，不自动覆盖 DNS。

```bash
# 仅供未来另建全新图床参考；当前图床不要再次使用首次标记
node image-host/image-host.mjs publish https://实际测试域名 --confirm-deploy --first-deploy
# 后续追加图片
node image-host/image-host.mjs publish https://img.2298321.xyz --confirm-deploy
```

发布流程：本地检查 → 检查上次图片基线 → 完整本地备份 → 写入未决记录 → 调用固定配置的 Wrangler → 成功后更新基线 → 生成链接。
实际调用固定 `image-host/wrangler.jsonc`，不调用博客根目录 `pnpm deploy`。
脚本不核实账号账单计划，不开通付费订阅，也不自动绑定 DNS。

若 CLI 失败、被中断或成功后写基线失败，将保留 `publish-pending.json` 并阻止重试。
恢复时先人工核对 Cloudflare 部署历史及未决记录：确认未部署则保留原基线；确认部署成功则按当次资产清单修复基线；状态不明时停止，不要直接删除文件重试。
部署成功退出码不代表所有地区的链接都已可用，需要真实网络测试。

## 6. 免费边界和限制

官方文档核实日期 2026-09-26：Workers Static Assets 静态请求免费，资源存储不另收费；Free 每版本最多 20,000 文件，单文件最多 25 MiB。
本项目为两个辅助文件预留位置，最多接受 19,998 张图片；不将清单/备份放入 public，不使用在线转换服务。
政策可能变化，不承诺永久免费。现有域名续费不属于免费图床服务。

- https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workers/static-assets/get-started/

robots/noindex 不是访问控制。没有防盗链；任何知道链接的人均可访问，不要导入隐私或侵权内容。
不保证大陆访问速度；上线后分别测试大陆和海外网络。
文章封面、Markdown 与 Astro 图片处理链路需要另行验证，当前不迁移文章、Live2D 纹理或图标。
`public/images/` 是持久图片库，不是可以随意删除的构建输出。

## 本地测试

部署配置试运行（不上传、不创建发布基线）：

```bash
node image-host/image-host.mjs dry-run
```

`dry-run` 与真实发布共用运行参数：子进程设置 `WRANGLER_HIDE_BANNER=true`，跳过横幅附带的后台版本检查；`CI=true` 避免命令后的可选技能安装建议；`WRANGLER_SEND_METRICS=false` 关闭遥测。不会改动全局环境或代理配置，也不会隐藏 CLI 的错误信息。
这是基于本机 Wrangler 4.122.0 的已验证处理方式，不代表所有超时都由版本检查造成。未来升级后重新验证；进程非零退出时仍按失败处理，不能仅看结束提示。

本地自动化测试：

```bash
node --test image-host/workflow.test.mjs
```

测试只使用临时合成图片。涉及部署的测试以临时 PATH 中的本地 `pnpm` 桩替代真实 CLI，不调用 Wrangler，不访问云端；临时文件自动清理。
