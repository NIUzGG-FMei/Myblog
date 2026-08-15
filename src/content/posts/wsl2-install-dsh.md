---
title: "WSL2 Ubuntu 安装 DeepSeek Harness(dsh):踩坑与实战记录"
published: 2026-08-15
description: "记录在 WSL2 的 Ubuntu 中从源码安装 DeepSeek Harness 的完整过程:npx 安装的坑、环境准备、源码构建、全局命令配置与实用技巧。"
tags: [WSL2, Ubuntu, DeepSeek Harness, dsh, 安装教程, AI Agent]
category: 开发工具
draft: false
slug: wsl2-install-dsh
---

目前网上针对 WSL2 的 Ubuntu 安装 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)(以下简称 DSH)的教程比较少,下面是我个人安装的经验记录。DSH 是一个"一切皆插件"的 Agent Harness,由 [Cordis](https://github.com/cordiverse/cordis) 驱动,目前处于 **developer preview** 阶段,迭代很快,安装时建议以官方仓库为准。

> **环境说明**:Windows 11 + WSL2,Ubuntu 发行版,Node.js v24.19.0。文中命令均在 WSL2 的终端中执行。

## 1. 为什么不用 `npx` 直接安装

官方 README 推荐的最简方式是:

```bash
npx @deepseek-ai/dsh web
```

但我个人实测,在 WSL2 的 Ubuntu 中运行该命令后,只会返回:

```
npx @deepseek-ai/dsh web
Need to install the following packages:
@deepseek-ai/dsh@0.1.0-rc.6
Ok to proceed? (y) y
npm warn deprecated node-domexception@1.0.0: Use your platform's native DOMException instead
```

并不会出现预期中的启动成功提示:

```
served at 127.0.0.1:3080
```

至于具体原因(可能是 WSL2 网络/环境差异,也可能是 preview 阶段的包分发问题),我没有深究,直接改用 GitHub 源码安装方式,一次成功。下面的步骤就是完整可复现的流程。

## 2. 环境准备

### 2.1 Node.js(22.19+ 或 24+)

DSH 官方要求 Node.js **22.19+ 或 24+**(CI 覆盖 22.19、24、26)。推荐在 WSL2 里用 nvm 安装,方便切换版本:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
nvm install 24
```

验证版本:

```bash
node -v
# v24.19.0
```

### 2.2 pnpm(Corepack 启用)

DSH 仓库在 `package.json` 中固定使用 `pnpm@11.7.0`,需要启用 Corepack 才能正确解析:

```bash
corepack enable
pnpm --version
# 11.7.0
```

如果 `pnpm --version` 无法通过 Corepack 解析,先执行 `corepack enable` 再试。

### 2.3 构建工具

从源码编译需要 `build-essential`,否则 `pnpm install` 阶段编译原生模块会失败:

```bash
sudo apt update
sudo apt install -y build-essential
```

Git 版本需要 2.26+,一般 Ubuntu 自带版本即可满足。

## 3. 源码安装步骤

逐条执行以下命令:

```bash
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install
pnpm run build
pnpm dsh web
```

`pnpm install` 和 `pnpm run build` 都比较耗时,耐心等待即可。执行 `pnpm dsh web` 后,终端返回:

```
$ node --import tsx/esm apps/cli/src/bin.ts web
dsh web: http://127.0.0.1:3080
```

出现 `dsh web: http://127.0.0.1:3080` 即代表运行成功,按住 **Ctrl 单击链接**即可跳转到 Web 界面。

> **注意**:`pnpm run build` 是必须的。跳过构建直接运行 `pnpm dsh web` 会因缺少构建产物而启动失败。

## 4. 安装全局命令,任意路径启动

源码方式只能在 `deepseek-harness` 目录内通过 `pnpm dsh web` 启动。为了在任何终端路径下都能打开 DSH,再安装全局命令:

```bash
npm install -g @deepseek-ai/dsh
```

之后在任意目录下直接运行:

```bash
dsh web
```

即可打开 Web 端。

## 5. 使用技巧

### 5.1 智力测试:极简模式 + max

建议使用 **极简模式 + max** 组合来测试模型的智力水平。这个组合下,思维链通常以 `We need`、`I will` 之类的起手式展开,推理过程比较直观。

### 5.2 安装插件:让联网 Agent 代劳

DSH 的**极简模式下没有联网能力**,而**标准模式经常"雷霆大思考"**(长时间深度思考,响应很慢),这两种模式都不适合手动安装插件。

更高效的做法是:使用 **opencode / Hermes / codex** 等自带联网模式的工具,把插件的 GitHub 链接直接发给它,让它帮你完成插件的安装。例如 [dsh-routing-suite](https://github.com/yjh051108/dsh-routing-suite) 这个推荐插件,就可以用这种方式安装。

## 6. 推荐资源

- **推荐插件**:
  - **官方 api**:
    - **flash 用**:[dsh-routing-suite](https://github.com/yjh051108/dsh-routing-suite)
    - **pro 用**:[dsh-anchored-standard](https://github.com/xiaobright/dsh-anchored-standard)
  - **opencode go**:
    - **flash 用**:[v4-flash-godmode-opencode-go](https://github.com/SheberDavid/v4-flash-godmode-opencode-go)
    - **pro 用**:[myDshPresets](https://github.com/0liveiraaa/myDshPresets)
- **Harness 对照分析**:[xiaobright/modeltest — DEEPSEEK_V4_PRO_HARNESS_ANALYSIS](https://github.com/xiaobright/modeltest/blob/main/docs/v4.1/DEEPSEEK_V4_PRO_HARNESS_ANALYSIS_20260814.md)
- **官方仓库**:[deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)
- **官方开发指南**:[docs/development.zh.md](https://github.com/deepseek-ai/DeepSeek-Harness/blob/master/docs/development.zh.md)

## 7. 小结

| 步骤 | 命令 | 说明 |
|---|---|---|
| 装 Node | `nvm install 24` | 22.19+ 或 24+ |
| 开 Corepack | `corepack enable` | 固定 pnpm@11.7.0 |
| 装构建工具 | `sudo apt install -y build-essential` | 编译原生模块必需 |
| 拉源码 | `git clone ... && cd deepseek-harness` | — |
| 装依赖 | `pnpm install` | — |
| 构建 | `pnpm run build` | 必须执行 |
| 启动 | `pnpm dsh web` | 成功后 Ctrl+单击链接 |
| 全局化 | `npm install -g @deepseek-ai/dsh && dsh web` | 任意路径启动 |

DSH 目前还是 developer preview,接口和插件体系都在快速演进,升级或重装时留意 breaking changes。希望这份记录能帮你在 WSL2 里少踩几个坑。
