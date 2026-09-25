# 三篇博文图床接入与验收记录

日期：2026-09-26\
**状态：三篇接入完成，用户本地验收正常，博客已发布并通过线上检查。**

本文件记录源码映射；发布版本和旧版本回滚信息见 [博客发布记录](BLOG-RELEASE.md)。

## 范围

| 文章 | 本地文件 | 引用替换 | 唯一图片 | 用户视觉验收 |
|---|---|---:|---:|---|
| DETR | src/content/posts/detr.md | 7 | 6 | 用户确认正常 |
| OBB | src/content/posts/obb-slender-small-objects.md | 8 | 7 | 用户确认正常 |
| 桌面宠物 | src/content/posts/naibao-desktop-pet.md | 1 | 1 | 用户确认正常 |
| 合计 | 三篇 | 16 | 14 | 博客已发布 |

OBB 为 7 张正文图及 1 处封面，桌面宠物只有封面。原图全部保留，不处理头像、横幅、相册、动态、图标或 Live2D。

## 验证

- `pnpm check`：219 files，0 errors / warnings / hints。
- `pnpm type-check` 和 `pnpm build`：退出码均为 0。
- 三篇生成 HTML 的图床直链 img 数量分别为 7 / 8 / 1；首页卡片为 3。
- 重启后的本地预览：三篇详情页和首页均 HTTP 200，图片引用数量符合预期。
- 把三篇新 URL 反向替换为原路径后，与 Git HEAD 逐字一致，证明文章修改只涉及图片 URL。
- 对 14 张原图重新计算 SHA-256，全部与来源清单一致。
- 已跟踪文件的差异只有三篇文章的 16 行 URL 替换；构建没有留下额外已跟踪产物差异。
- 编辑器对文章目录无错误或警告。

构建仍有之前的 npm 配置、大于 500 kB 的打包文件和 Pagefind 对两页缺少 html 的提示，不声称构建完全没有提示，也没有扩散修改范围。

用户随后明确确认新增两篇显示正常并授权博客发布；博客已经部署成功，线上页面及 14 张图片检查通过。未提交或推送 Git。没有获取浏览器截图，也没有完成跨地区网络或移动端性能评估。

## 本机验收入口

以下是之前本地验收使用的地址；正式发布后临时预览已停止。需要重新检查本地构建时，再手动启动服务：

- OBB：http://localhost:4321/posts/obb-slender-small-objects/
- 桌面宠物：http://localhost:4321/posts/naibao-desktop-pet/
- 首页：http://localhost:4321/
- DETR 回归检查：http://localhost:4321/posts/detr/

若看到旧内容，请刷新页面；服务停止后可在项目根目录运行 `pnpm preview --host 0.0.0.0 --port 4321`。不要误用 `pnpm deploy`。

重点查看：首页三张封面，OBB 的封面与正文七张图，桌面宠物透明背景封面；确认没有破图、持续透明、异常拉伸，并在手机宽度下检查是否溢出。图片放大也需实际点击检查。

## 逐项回滚映射

回滚时，在对应文章中把“新地址”换回“原路径”；同一 URL 同时用于正文和封面时，应恢复两处。只做有针对性的替换，不要整仓库 reset，以免覆盖其他修改。

- 原路径：`./images/detr/benchmark-table.png`
  - 新地址：`https://img.2298321.xyz/images/c9648016041f8ad92f4f8b6ba50df8652d2427ee9e03dedc5e0fe4db7e9c9374.webp`
- 原路径：`./images/detr/decoder-attention.png`
  - 新地址：`https://img.2298321.xyz/images/8faea4b2277a428fc2d4f3cb95400b8e407f5f4a0fbd45e2aad49442aa97091f.webp`
- 原路径：`./images/detr/detr-architecture.png`
  - 新地址：`https://img.2298321.xyz/images/fefb02e6f18019844db116262c78899f06f3bab56948458c8d383e787c48b32d.webp`
- 原路径：`./images/detr/detr-overview.png`
  - 新地址：`https://img.2298321.xyz/images/fb86737cdd993c0a44c4a3a018d60b46988f7c6daa41ec6195a51b03ec708cb3.webp`
- 原路径：`./images/detr/encoder-attention.png`
  - 新地址：`https://img.2298321.xyz/images/30c62ae153a43fcd90bcd5d927ec83b6720c3e561d78a95cf1a20c13268f3df9.webp`
- 原路径：`./images/detr/object-query-slots.png`
  - 新地址：`https://img.2298321.xyz/images/afba7f0901f0ae65e62c3cade8097c9c9ff4f81c25b68c91b18540029b0bb3bf.webp`
- 原路径：`./images/naibao/naibao.png`
  - 新地址：`https://img.2298321.xyz/images/e3fac74ee67301d2fade56245b20052881273b2f1076230a1eeb4ca54bb92002.webp`
- 原路径：`./images/obb-slender-small-objects/fig1-fn-truck.png`
  - 新地址：`https://img.2298321.xyz/images/43b3ca87c4e17cba483504d6b0136b819607d839d38b3331b0ecf19ba79f1c00.webp`
- 原路径：`./images/obb-slender-small-objects/fig2-fp-background-truck.png`
  - 新地址：`https://img.2298321.xyz/images/01ce15a8765c8ea4fc8c22d285ffd69c6fdb4a775275fb4bbd9f647899813014.webp`
- 原路径：`./images/obb-slender-small-objects/fig3-fp-partial-truck.png`
  - 新地址：`https://img.2298321.xyz/images/d3b605e7c80fdff74f871161f2c97e7d3a3ba0cb798e71777f582c02fe97d534.webp`
- 原路径：`./images/obb-slender-small-objects/fig4-fp-similar-object.png`
  - 新地址：`https://img.2298321.xyz/images/fc2a3f4ed73676dd87cc7e71f1a77322a4400bbceda646dca1504f5dee73049b.webp`
- 原路径：`./images/obb-slender-small-objects/fig5-patch-256.png`
  - 新地址：`https://img.2298321.xyz/images/1f79acb318cdb4019b35e366773404b070a295ea0e51e2fcad173aebfae0d068.webp`
- 原路径：`./images/obb-slender-small-objects/fig6-rect-out-of-bounds.png`
  - 新地址：`https://img.2298321.xyz/images/4d22d98ef555b7dd798decbc39ea2e71400bae049d0f1280a40158f4da71de95.webp`
- 原路径：`./images/obb-slender-small-objects/fig7-clipped-gt-box.png`
  - 新地址：`https://img.2298321.xyz/images/78fe74579d8afa01293a91367b373b781efa41acd3d01d18e2e8efbe7948ccdb.webp`

回滚不需要删除云端图片或本地原图。恢复后重新执行三项检查和本地预览。博客现已发布：只恢复本地源码不会改变线上页面。若需线上回滚，先参阅 BLOG-RELEASE.md 并明确确认方案，再执行版本回滚或恢复源码后重建发布。

## 下一步

三篇用户本地验收及博客发布已完成。下一步在真实浏览器刷新线上页面，并按需演练新增图片、备份及后续发布流程。
