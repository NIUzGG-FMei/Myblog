# DETR 图床试接入与回滚记录

日期：2026-09-26\
状态：**DETR 本地接入与检查通过，用户已确认显示正常；随后博客已发布并验收。**

后续 OBB 与桌面宠物也已接入并经用户本地验收，博客已发布。最新汇总见 [三篇博文接入记录](BLOG-MIGRATION.md)。以下单篇记录保留当时修改范围。

## 修改范围

- 文件：`src/content/posts/detr.md`。
- 6 张正文图片 + 1 处封面引用，共替换 7 处；流程图正文与封面共用同一个 URL。
- 使用 `https://img.2298321.xyz`；没有改文章文字、替代文本、图源说明或其他 frontmatter。
- 所有原图保留；OBB 与桌面宠物文章均未修改。
- 没有改全局图片组件或 Astro 配置，没有新增在线图片转换服务。

## 映射（原路径 → 图床地址）

- 原路径：`./images/detr/detr-overview.png`
  - 新地址：`https://img.2298321.xyz/images/fb86737cdd993c0a44c4a3a018d60b46988f7c6daa41ec6195a51b03ec708cb3.webp`
- 原路径：`./images/detr/benchmark-table.png`
  - 新地址：`https://img.2298321.xyz/images/c9648016041f8ad92f4f8b6ba50df8652d2427ee9e03dedc5e0fe4db7e9c9374.webp`
- 原路径：`./images/detr/decoder-attention.png`
  - 新地址：`https://img.2298321.xyz/images/8faea4b2277a428fc2d4f3cb95400b8e407f5f4a0fbd45e2aad49442aa97091f.webp`
- 原路径：`./images/detr/detr-architecture.png`
  - 新地址：`https://img.2298321.xyz/images/fefb02e6f18019844db116262c78899f06f3bab56948458c8d383e787c48b32d.webp`
- 原路径：`./images/detr/encoder-attention.png`
  - 新地址：`https://img.2298321.xyz/images/30c62ae153a43fcd90bcd5d927ec83b6720c3e561d78a95cf1a20c13268f3df9.webp`
- 原路径：`./images/detr/object-query-slots.png`
  - 新地址：`https://img.2298321.xyz/images/afba7f0901f0ae65e62c3cade8097c9c9ff4f81c25b68c91b18540029b0bb3bf.webp`

## 验证结果

| 检查 | 结果 |
|---|---|
| pnpm check | 通过，219 files，0 errors / warnings / hints |
| pnpm type-check | 退出码 0 |
| pnpm build | 退出码 0 |
| DETR 构建 HTML | 7 个图床直链 img，6 个唯一 URL |
| 首页卡片 HTML | 1 个对应图床封面直链 |
| pnpm preview HTTP | /posts/detr/ 与 / 均 200，图片引用数量正确 |
| Git 跟踪文件差异 | 仅 detr.md 的 7 行替换；无额外构建产物差异 |
| 编辑器诊断 | detr.md 无错误或警告 |

构建提示仍存在：npm 的 manage-package-manager-versions 配置提示、Vite 超过 500 kB 的包体积提示、Pagefind 对 booknav/bangumi 缺少 html 元素的提示，以及中文 stemming 不支持说明。未为此进行无关修改。

封面组件的远程分支使用原生 img，正文构建输出也保留图床直链；本次图片没有被包进 /_image 或 Cloudflare Images 转换 URL。其他网站图片仍沿用原来的处理方式。

没有获得浏览器截图或真实桌面/移动端视觉验收结果，不把 HTML 检查等同于所有图片已在浏览器显示，不提供性能评分。

## 本地预览验收

这是当时本地验收使用的地址；正式发布后预览已停止，重新启动后才能打开：

- 详情页：`http://localhost:4321/posts/detr/`
- 首页：`http://localhost:4321/`

如果服务已经停止，在博客根目录运行 `pnpm preview --host 0.0.0.0 --port 4321`。该命令仅提供本地构建预览，不发布博客。若端口占用，先确认现有进程，不要随意终止其他服务。

依次检查：

1. 首页 DETR 卡片封面能否加载。
2. 文章封面及正文六张图片是否显示，是否有破图或持续透明状态。
3. 图中文字是否清晰，点击图片的放大行为是否正常。
4. 缩小到手机宽度，是否出现溢出或明显布局跳动。
5. 如需判断大陆访问体验，使用真实大陆网络测试，不要将带代理环境的成功当成全部网络成功。

## 回滚（仅在明确需要时）

按上面的映射，将 DETR 文件中对应新 URL 换回原来的 `./images/detr/...png`；流程图 URL 出现两次，应同时恢复封面与正文。

不要使用整个仓库的 reset/checkout，避免覆盖其他修改。不要删除图床上的图片、发布基线或原图；仅恢复文章引用即可。

恢复后重新运行 `pnpm check`、`pnpm type-check`、`pnpm build`，再检查本地页面。博客后来已发布，回滚线上版本前请参阅 BLOG-RELEASE.md 并另行确认。

## 下一步

用户已确认三篇本地显示正常，随后明确授权并完成博客发布。线上结果和回滚版本见 BLOG-RELEASE.md。
