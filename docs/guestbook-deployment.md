# 便签墙与评论部署指南

便签墙和文章评论现在共用一个 Cloudflare D1 数据库，不再依赖 Waline。最简单的部署只需要：

- 一个 Cloudflare 账号
- 一个 D1 数据库
- 一个 Cloudflare Worker

下面的命令都在项目根目录执行。

## 第一次部署

### 1. 登录 Cloudflare

```bash
pnpm exec wrangler login
pnpm exec wrangler whoami
```

第二条命令能显示你的账号，就说明登录成功。

### 2. 确认 D1 数据库

项目当前的数据库配置在 `wrangler.jsonc`：

```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "mfwblog-guestbook",
      "database_id": "3d8fabfc-5ee9-4c86-a13b-7d182038fc32"
    }
  ]
}
```

先执行：

```bash
pnpm exec wrangler d1 info mfwblog-guestbook
```

如果能显示数据库信息，直接进入下一步。如果提示找不到数据库，说明这个数据库不在你当前登录的 Cloudflare 账号中。创建一个新的：

```bash
pnpm exec wrangler d1 create mfwblog-guestbook
```

命令会返回新的 `database_id`。把它替换到 `wrangler.jsonc` 的 `database_id` 中。

### 3. 建立数据表

先建立本地测试数据库，再建立线上数据库：

```bash
pnpm db:migrate:local
pnpm db:migrate:remote
```

迁移会建立便签墙和文章评论所需的数据表。以后新增 migration 时，仍然执行这两条命令。

### 4. 本地检查

```bash
pnpm check
pnpm type-check
pnpm build
pnpm preview
```

打开终端显示的网址，测试：

1. 进入 `/guestbook/`，发布一张便签。
2. 打开一篇允许评论的文章，在底部发布评论。
3. 刷新页面，确认刚才的内容仍然存在。

### 5. 部署 Worker

```bash
pnpm run deploy
```

`pnpm run deploy` 会使用 Astro 生成的 `dist/server/wrangler.json`，这样静态页面和 `/api/*` 后端会一起部署。注意不能写成 `pnpm deploy`，否则会被 pnpm 自带命令拦截。

## GitHub Actions 自动部署

仓库工作流需要两个 Repository Secrets：

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

API Token 至少需要 Workers Scripts 和 D1 编辑权限。推送到 `master` 后，工作流会依次检查项目、构建、迁移线上 D1、部署 Worker。

`PUBLIC_BACKGROUND_VIDEO_URL` 和 `PUBLIC_MUSIC_BASE_URL` 都是可选的 Repository Variables，与便签墙和评论无关。

## 设置管理员密码

管理页面（`/guestbook/admin/`）需要密码登录，用于审核便签、删除/回复文章评论：

```bash
pnpm exec wrangler secret put ADMIN_PASSWORD
```

按提示输入并回车即可。密码只保存在 Cloudflare，不会出现在代码里。本地开发时把 `.dev.vars.example` 复制为 `.dev.vars`，填入 `ADMIN_PASSWORD=你的密码`。

## 可选：开启 Turnstile

不配置 Turnstile 时，便签墙和评论也可以正常使用，并保留同源检查、蜜罐和基础限流。

如果网站公开后垃圾留言较多，再开启 Turnstile。Site Key 和 Secret Key 必须同时配置：

1. 在 Cloudflare Turnstile 创建 Widget，并添加你的正式域名。
2. 把 Site Key 保存为构建变量 `PUBLIC_TURNSTILE_SITE_KEY`。
3. 执行 `pnpm exec wrangler secret put TURNSTILE_SECRET_KEY`，按提示输入 Secret Key。
4. 重新执行 `pnpm build` 和 `pnpm deploy`。

本地测试时可以把 `.dev.vars.example` 复制为 `.dev.vars`，再填写 Cloudflare 官方测试 Site Key 和 Secret Key。`.dev.vars` 已被 Git 忽略，不会提交到仓库。

如果决定关闭已经启用的 Turnstile，要同时清空构建变量并删除 Worker Secret：

```bash
pnpm exec wrangler secret delete TURNSTILE_SECRET_KEY
```

## 常见问题

### 显示“数据库尚未配置”

检查 `wrangler.jsonc` 中的 binding 是否仍为 `DB`，并确认部署使用的是 `pnpm deploy`。

### 显示“no such table”

说明数据库存在，但 migration 没有执行。运行：

```bash
pnpm db:migrate:remote
```

### 页面正常，但提交后刷新内容消失

通常是本地预览和线上站点连接了不同数据库。用 `--local` 执行的 migration 只影响本地；线上必须执行 `pnpm db:migrate:remote`。

### 显示“人机验证未通过”

说明 Worker 中存在 `TURNSTILE_SECRET_KEY`，但页面没有对应 Site Key，或者 Widget 没有添加当前域名。按“可选：开启 Turnstile”同时检查两项配置；不使用 Turnstile 时删除这项 Secret。
