# 博客图床接入发布记录

日期：2026-09-26

## 发布前快照

- 用户已确认三篇本地预览正常，并明确批准发布博客。
- 部署目标：`mfwblog`；配置：`dist/server/wrangler.json`；通过 `pnpm run deploy` 执行现有 deploy 脚本。
- 修改范围：三篇博文共 16 处图片引用，指向 `https://img.2298321.xyz`；14 张原图保留，图床不重新部署。
- 发布前最新部署 ID：`e4212255-3486-4bae-aaf2-5f22bd5d90b3`。
- 发布前版本（100%）：`1709f703-45bd-44ee-8e7c-5f60491bb672`，用于必要时评估回滚。
- 发布前线上首页及三篇文章均 HTTP 200，图床 img 引用数量均为 0。
- check/type-check/build 与博客部署 dry-run 已通过。
- 生成配置使用现有 SESSION、RADAR_CACHE、DB，以及 Astro 的 IMAGES/ASSETS 绑定；本次没有主动创建存储资源、变更订阅或执行数据库迁移。
- 不提交、不推送 Git；没有计划更改域名绑定。

## 执行状态

**已真实发布，退出码 0，线上 HTTP 与图片哈希验收通过。**

- 首次调用 `pnpm deploy` 命中了 pnpm 内置工作区命令，报 ERR_PNPM_CANNOT_DEPLOY，未调用 Cloudflare。
- 随后使用 `env CI=true WRANGLER_HIDE_BANNER=true WRANGLER_SEND_METRICS=false pnpm run deploy`，成功执行项目脚本。
- 新博客版本：`1eb4d298-f96b-4105-9ce3-cc7dd2706128`。
- 部署上传 26 个新增/变化的静态产物，326 个文件已在平台存在；完整构建会刷新首页、RSS、搜索索引等派生产物，不只是三篇 HTML。源文章修改仍仅为三篇的 16 处 URL。
- 现有 KV、D1、IMAGES 和 ASSETS 绑定保持使用，没有执行数据库迁移或开通新订阅。
- 图床 Worker 未重新部署，本轮不更改任何域名绑定。

## 线上验收

| 地址 | HTTP | 图床 img 数量 |
|---|---:|---:|
| https://2298321.xyz/ | 200 | 3 |
| https://2298321.xyz/posts/detr/ | 200 | 7 |
| https://2298321.xyz/posts/obb-slender-small-objects/ | 200 | 8 |
| https://2298321.xyz/posts/naibao-desktop-pet/ | 200 | 1 |

从线上 HTML 提取图床引用去重后为 14 张，全部重新下载并通过 SHA-256 校验，均 HTTP 200。
验证环境为用户 WSL 的当前网络；不能替代大陆/海外所有网络的可达性和性能评估。
用户已确认三篇本地视觉效果正常，并在发布后查看线上页面，反馈没有异常。

临时本地预览已停止。原图、图床基线和备份保留；博客发布完成时尚未进行 Git commit 或 push，后续同步以 Git 历史为准。

## Git 同步前检查

- 目标仓库：NIUzGG-FMei/Myblog；检查时分支为 master，本地 HEAD 与 origin/master 一致。
- 本次候选为 32 个文件约 6.45 MiB，包含三篇文章、图床工具与 14 张 WebP、使用文档及发布基线。
- 备份、缓存、临时文件、构建目录及链接清单被忽略；常见凭据模式扫描未发现匹配项。此检查不等同于完整安全审计。
- 原有未跟踪 docs/naibao-blog-plan.md 与本次无关，不纳入提交。
- 重要：现有 deploy.yml 在 push master 时会执行远程 D1 migrations 和博客部署。若仅需保存成果，可先推送新分支；直接推送 master 前须确认接受该自动化流程。
- 用户已选择新建 feat/blog-image-host 分支提交并推送，仅同步此次相关文件，不合并 master、不主动执行部署或数据库迁移；执行结果以 Git 历史及远程分支为准。
- 后续若要合并 master，需另行确认接受上述自动部署及远程 D1 迁移流程。

## 后续发布命令区分

- 图床：`node image-host/image-host.mjs publish https://img.2298321.xyz --confirm-deploy`
- 博客：检查并构建后，明确使用 `pnpm run deploy`，不要使用有歧义的 `pnpm deploy`。
- 两者都是实际云端变更，只有准备好相应内容且明确需要时才执行。


## 回滚原则

若发布后出错，先验证线上影响，记录新版本，再明确选择回滚。旧版本号已保留；回滚应只针对 mfwblog，不删除图床资产或改动数据库。
是否可直接回滚需核实 Cloudflare 当前版本、绑定和资产兼容性；不在未知状态下重复发布或自动撤回。原图保留，可通过 BLOG-MIGRATION.md 的映射恢复源码引用并重新构建。
