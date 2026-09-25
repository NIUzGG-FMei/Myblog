# 图床自定义域名绑定指南

更新日期：2026-09-26。**用户已在控制台完成绑定，HTTPS 与 14 张图片哈希验证通过。**

正式地址：`https://img.2298321.xyz`。本地配置已同步 Custom Domain，保留 workers.dev 测试入口；随后三篇博文均已接入，用户本地验收正常，博客已发布并通过线上页面与图片哈希检查。以下保留绑定步骤供维护参考，不要重复添加。

## 检查结果与边界

- 现有 Worker：`mfwblog-images`，已有 14 张博文正文及封面图片。
- 当前可用测试域名：`mfwblog-images.niuziqq7878.workers.dev`。
- 绑定前的公开 DNS 查询：`img.2298321.xyz` 的 A、AAAA、CNAME 均为 NXDOMAIN（无公开可解析记录）。
- 公开 DNS 不能代替控制台检查：仍需核实同名 DNS、其他 Worker 的 Custom Domain，以及可能匹配 `*.2298321.xyz/*` 的 Worker Route。
- 随后用户在控制台完成 Custom Domain 添加；助手验证 HTTPS 并同步本地配置，没有再次执行云端绑定或修改文章。

## 推荐的绑定方式：Worker Custom Domain

Cloudflare 会为 Custom Domain 自动创建 DNS 记录并签发证书。
不要先手工添加指向 workers.dev 的 CNAME，也不要把 `img.2298321.xyz/*` 当成 Custom Domain 名称。

1. 打开 Cloudflare 控制台，选择管理 `2298321.xyz` 的账号。
2. 在该域名的 DNS 记录页面搜索 `img`，确认没有其他服务正在使用它。若存在记录，停止并核对用途，不直接删除或替换。
3. 检查 Workers 的域名/路由配置，确认没有同名 Custom Domain，且没有会拦截该子域名的既有 Worker Route。若发现冲突，先讨论处理方式。
4. 进入 **Workers & Pages → mfwblog-images → Settings → 域 → 添加域名**（当前用户界面）；部分版本显示 Domains & Routes → Add → Custom Domain。不要选择“添加路由”。
5. 输入且仅输入 **`img.2298321.xyz`**。
6. 确认目标是图床 Worker，再添加。如出现替换其他服务或覆盖 DNS 的提示，停止，不直接确认覆盖。
7. 等待证书及域名状态就绪。不要启用付费服务，也不要改动博客主域名的绑定。

控制台菜单名称可能随版本变化，核心是给 `mfwblog-images` 添加 Custom Domain，而不是给博客 Worker 添加路由。

## 为什么不直接无人值守执行？

本机 Wrangler 4.122.0 的 Custom Domain 发布实现中，非终端输出模式会启用覆盖已有域名来源与冲突 DNS 的选项。
因此不能仅凭公开 DNS 的 NXDOMAIN，就直接在自动化环境中运行带新域名的发布命令。

自动化绑定也可以继续研究，但必须先做账号内的冲突检查，并确保不默许覆盖。不要为此在聊天或仓库中粘贴 Token。

## 绑定之后要做什么？

1. 确认 Cloudflare 控制台显示绑定已完成，HTTPS 证书可用。
2. 验证 14 张图片在新域名下全部返回 200，内容哈希与本地一致；检查响应类型与缓存。
3. 检查不存在图片路径应返回 404，根路径无首页返回 404 属正常。
4. 保留现有 workers.dev 测试入口，暂不关闭。
5. 将控制台配置同步到 `image-host/wrangler.jsonc`，避免以后部署时发生配置漂移。本次已验证并同步如下配置，未来修改时仅作参考：

```json
{
  "workers_dev": true,
  "routes": [
    { "pattern": "img.2298321.xyz", "custom_domain": true }
  ]
}
```

这是配置片段，不是完整文件；不要直接覆盖现有 Wrangler 配置。同步后先 dry-run，确认发布范围不变。

6. 验证新域名后再生成清单：

```bash
node image-host/image-host.mjs links https://img.2298321.xyz
```

`links` 只改变本地清单，不绑定 DNS，也不改文章；其保守的“待发布清单”提示不代表已上线图片自动下线。

7. 更新 `README.md`、`PROGRESS.md` 和使用指南中的当前域名及验证结果。
8. 另行确认一篇博文试接入，检查正文和封面及 Astro 图片链路，再考虑其余文章。不能把绑定成功等同于博客已经接入。

## 回退原则

保留 workers.dev 入口和原图。若新域名访问异常，在未迁移文章前保持原博客不动，先查证书、DNS 和网络。
撤销域名绑定会影响所有使用该域名的链接，属于另一项需确认的云端更改；不要随意删除自动创建的 DNS 记录。

官方参考：https://developers.cloudflare.com/workers/configuration/routing/custom-domains/
