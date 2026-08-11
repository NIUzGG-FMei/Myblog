
<div align="center">

# NiuzG 的博客 / Firefly

> 一款基于 **Fuwari** 与 **Firefly** 二次创作的 Astro 个人博客
>
> ![Node.js >= 22](https://img.shields.io/badge/node.js-%3E%3D22-brightgreen)
> ![pnpm >= 9](https://img.shields.io/badge/pnpm-%3E%3D9-blue)
> ![Astro](https://img.shields.io/badge/Astro-7.1.3-orange)
> ![TypeScript](https://img.shields.io/badge/TypeScript-5.9.2-blue)
> ![GitHub License](https://img.shields.io/github/license/NIUzGG-FMei/Firefly)

</div>

---

本博客基于 [fuwari](https://github.com/saicaca/fuwari) 和 [Firefly](https://github.com/CuteLeaf/Firefly) 二次创作而来，在保留两者清新优雅的布局与设计语言的基础上，深度定制了适合个人使用的功能，并部署于 Cloudflare Workers。

> [!TIP]
>
> **如果你参考或使用了本项目的组件设计和相关代码，请注明来自本项目。**
>
> 本项目继承自 Firefly 与 Fuwari 的开源成果，版权声明详见文末「许可协议」。
>
> 部分非简体中文的 UI 文案由 AI 翻译生成，如有错误欢迎指正。

## ✨ 二次创作特色

- [x] **原生评论系统** - 基于 Cloudflare D1 的自建评论，支持回复、管理员审核与删除，评论数据完全自主可控
- [x] **留言板管理后台** - 留言（访问/反馈/求物）分类管理，管理员登录会话、联系方式（QQ/微信/邮箱）加密存储
- [x] **Cloudflare Workers 部署** - GitHub Actions 自动构建 + D1 数据库迁移 + Wrangler 部署，无需服务器
- [x] **背景视频播放** - 支持本地/远程背景视频，多视频随机/顺序循环
- [x] **RSS 订阅页** - 独立的 RSS 介绍与订阅链接复制页面，自动生成完整 RSS Feed
- [x] **防机器人** - 留言与评论接入 Cloudflare Turnstile 人机验证，配合 IP 哈希限流
- [x] **个性化定制** - 自定义主题色、壁纸轮播、音乐播放器、看板娘（Spine / Live2D）、动态页、相册等

## 🚀 快速开始

### 环境要求

- Node.js ≥ 22
- pnpm ≥ 9

### 本地开发部署

1. **克隆仓库：**
   ```bash
   git clone https://github.com/NIUzGG-FMei/Firefly.git
   cd Firefly
   ```

2. **安装依赖：**
   ```bash
   # 如果没有安装 pnpm，先安装
   npm install -g pnpm

   # 安装项目依赖
   pnpm install
   ```

3. **配置博客：**
   - 编辑 `src/config/` 目录下的配置文件自定义博客设置
   - 本地环境变量参考 `.dev.vars.example`，复制为 `.dev.vars` 并按需填写

4. **启动开发服务器：**
   ```bash
   pnpm dev
   ```
   博客将在 `http://localhost:4321` 可用

### 部署到 Cloudflare Workers

1. 在 GitHub 仓库配置 Secrets：
   - `CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_API_TOKEN`
2. 配置 Vars（可选）：`PUBLIC_TURNSTILE_SITE_KEY`、`PUBLIC_BACKGROUND_VIDEO_URL`、`PUBLIC_MUSIC_BASE_URL` 等
3. `wrangler.jsonc` 中按需创建/绑定 KV 命名空间与 D1 数据库
4. 推送 `master` 分支，GitHub Actions 会自动构建、执行 D1 迁移并部署
5. 生产密钥通过 `pnpm exec wrangler secret put` 设置（如 `ADMIN_PASSWORD`、`CONTACT_ENCRYPTION_KEY`）

## 📖 配置说明

博客配置集中在 `src/config/` 目录：

```
src/
├── config/
│   ├── index.ts                  # 配置索引文件
│   ├── siteConfig.ts             # 站点基础配置
│   ├── backgroundWallpaper.ts    # 背景壁纸与视频配置
│   ├── commentConfig.ts          # 评论系统配置
│   ├── dynamicConfig.ts          # 动态页面配置
│   ├── galleryConfig.ts          # 相册配置
│   ├── musicConfig.ts            # 音乐播放器配置
│   ├── navBarConfig.ts           # 导航栏配置
│   ├── pioConfig.ts              # 看板娘配置
│   ├── profileConfig.ts          # 用户资料配置
│   └── ...                       # 其余功能模块配置
```

设置网站默认语言，编辑 `src/config/siteConfig.ts`：

```typescript
const SITE_LANG = "zh_CN"; // zh_CN | zh_TW | en | ja | ru | ko
```

## ⚙️ 文章 Frontmatter

```yaml
---
title: My First Blog Post
published: 2023-09-09
description: This is the first post of my new Astro blog.
image: ./cover.jpg  # 或使用 "api" 来启用随机封面图
tags: [Foo, Bar]
category: Front-end
draft: false
lang: zh-CN      # 仅当文章语言与网站语言不同时需要设置
pinned: false    # 置顶
comment: true    # 是否允许评论
---
```

## 🧞 指令

下列指令均需要在项目根目录执行：

| Command                    | Action                                 |
| :------------------------- | :------------------------------------- |
| `pnpm install`             | 安装依赖                               |
| `pnpm dev`                 | 在 `localhost:4321` 启动本地开发服务器 |
| `pnpm build`               | 构建网站至 `./dist/`                   |
| `pnpm preview`             | 本地预览已构建的网站                   |
| `pnpm check`               | 检查代码中的错误                       |
| `pnpm type-check`          | TypeScript 类型检查                    |
| `pnpm format`              | 使用 Biome 格式化您的代码              |
| `pnpm lint`                | Biome 代码检查与安全修复               |
| `pnpm new-post <filename>` | 创建新文章                             |
| `pnpm new-d <content>`     | 创建一条动态                           |
| `pnpm db:migrate:remote`   | 应用 D1 数据库迁移（部署时会自动执行） |
| `pnpm run deploy`          | 使用 Wrangler 部署到 Cloudflare        |
| `pnpm astro ...`           | 执行 `astro add`, `astro check` 等指令 |

## 🧩 Markdown 扩展语法

除了 Astro 默认支持的 [GitHub Flavored Markdown](https://github.github.com/gfm/) 之外，还包含了一些额外的 Markdown 功能：

- 提醒块（Admonitions） - 支持 GitHub, Obsidian, VitePress, Docusaurus 四种风格主题配置
- GitHub 仓库卡片
- 基于 Expressive Code 的增强代码块（[文档](https://expressive-code.com/)）

## 🙏 致谢

本博客是基于以下开源项目二次创作的个人作品：

- [fuwari](https://github.com/saicaca/fuwari) - 由 [saicaca](https://github.com/saicaca) 开发的 Astro 博客模板，本项目的地基
- [Firefly](https://github.com/CuteLeaf/Firefly) - 由 [CuteLeaf](https://github.com/CuteLeaf) 基于 fuwari 二次开发的博客主题，本项目的主要代码来源

流萤部分相关图片素材版权归游戏 [《崩坏：星穹铁道》](https://sr.mihoyo.com/) 开发商 [米哈游](https://www.mihoyo.com/) 所有

### 技术栈

- [Astro](https://astro.build)
- [Tailwind CSS](https://tailwindcss.com)
- [Iconify](https://iconify.design)
- [Cloudflare Workers / D1 / KV](https://workers.cloudflare.com/)

## 🍀 贡献者

本项目的二次开发与定制由以下成员共同完成：

| 成员 | 角色 |
| :--- | :--- |
| [NIUzGG-FMei](https://github.com/NIUzGG-FMei) | 项目维护者，功能设计与实现 |
| DeepSeek | AI 编程助手，参与代码开发与调试 |
| GPT | AI 编程助手，参与代码开发与调试 |

感谢以下贡献者对原项目 [fuwari](https://github.com/saicaca/fuwari) 做出的贡献，为本项目奠定了基础。

><a href="https://github.com/saicaca/fuwari/graphs/contributors">
>  <img src="https://contrib.rocks/image?repo=saicaca/fuwari" />
></a>

## 📝 许可协议

本项目遵循 [MIT license](https://mit-license.org/) 开源协议，详细查看 [LICENSE](./LICENSE) 文件

**版权声明：**
- Copyright (c) 2024 [saicaca](https://github.com/saicaca) - [fuwari](https://github.com/saicaca/fuwari)
- Copyright (c) 2025 [CuteLeaf](https://github.com/CuteLeaf) - [Firefly](https://github.com/CuteLeaf/Firefly)
- Copyright (c) 2026 [NIUzGG-FMei](https://github.com/NIUzGG-FMei) - 本博客二次创作

根据 MIT 开源协议，你可以自由使用、修改、分发代码，但需保留上述版权声明。
