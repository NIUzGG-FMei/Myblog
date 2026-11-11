---
title: WeiCode：把本地工作区安全地交给远程 AI Agent（WSL / Windows 双平台）
published: 2026-11-11
description: 一个同时适配 WSL 与原生 Windows 的 VS Code 扩展，把本机工作区包装成 MCP 服务，经 Cloudflare 隧道交给远程 Agent 使用。聊聊它的核心功能、几处关键实现，以及一条可以照着复现的技术路线。
image: https://img.2298321.xyz/images/e6a644be00ac834a4b023e6be81b2f9d23b2d0967af1c0b335b8a38c7411fc33.webp
tags: [MCP, VS Code, WSL, Windows, PowerShell, AI Agent, Cloudflare Tunnel, TypeScript]
category: 工具开发
draft: false
slug: weicode-mcp-bridge
---

网页里的 AI Agent 越来越能干，但它碰不到我电脑上的代码；本地的 Agent 又绑死在某个客户端里。**WeiCode** 想解决的就是中间这一段：在 VS Code 里点一下 Start Bridge，就得到一个公网 MCP 地址，任何支持远程 MCP 的 Agent 拿到它，就能在我批准的范围内读代码、改文件、跑命令。

一句话概括：**同一个 VSIX、同时适配 WSL 与原生 Windows 的 VS Code 扩展 = MCP Streamable HTTP 服务 + 工作区工具集 + Cloudflare 隧道 + 本地审批与工作流闸门。** 在 Remote-WSL 窗口里它跑在 Ubuntu 端、驱动 bash；在 Windows 本地窗口里它跑在 Windows 端、驱动 PowerShell。远程 Agent 看到的是同一套 19 个工具，基本无感。无账号、无授权、无遥测，MIT。

![WeiCode 技术路线](https://img.2298321.xyz/images/e6a644be00ac834a4b023e6be81b2f9d23b2d0967af1c0b335b8a38c7411fc33.webp)

## 1. 核心功能

| 能力 | 工具 / 入口 | 说明 |
|---|---|---|
| 文件 | `list_directory` `read_files` `find_files` `search_files` | 读文件带行号和 `sha256` 版本；搜索走 ripgrep，缺失时回退 Node 实现 |
| 编辑 | `apply_patch` `write_file` | Codex 风格补丁，`expected_versions` 乐观并发，防止覆盖别人刚改过的文件 |
| 终端 | `run_command` `get_command_output` `send_command_input` `cancel_command` | WSL：常驻登录 bash（conda 可用）；Windows：常驻 PowerShell 5.1 / pwsh 7。长任务分页续读，可交互、可中断 |
| IDE | `get_diagnostics` `lsp` `view_image` | 直接复用 VS Code 已激活的语言服务，不另起 LSP 进程 |
| 工作流 | `set_todos` `report_progress` `list_tasks` | 任务卡：计划要用户批准，完成要有验证证据 |
| 技能 | `list_skills` `load_skill` | 读取本地 `SKILL.md` 技能目录，支持预设与 GitHub 导入 |
| 安全 | 审批面板、只读模式、限流、可选 Bearer | 危险命令必须本地点 Allow，bash / PowerShell / cmd 各有一套规则 |

同一个 VSIX 在 WSL 和 Windows 各装一次即可；两边可以同时开，各用各的 `~/.weicode` 和隧道。

## 2. 关键实现

### 2.0 双平台：一个扩展，运行时切换宿主适配器

关键在 `extensionKind: ["workspace"]`：VS Code 会把扩展放到“工作区所在的那一端”运行——Remote-WSL 窗口里是 Ubuntu 上的扩展宿主，Windows 本地窗口里就是 Windows 本机。WeiCode 再在运行时按 `process.platform` 选适配器：

- **`HostProfile`（`platform.ts`）**：识别 `linux / wsl / windows / darwin`，给出面向 Agent 的一句话描述（如 `Linux (WSL: Ubuntu, bash)`、`Windows 10 (PowerShell, WSL available via wsl.exe)`），写进 `workspace_info`、`instructions` 和工具描述。平台判断集中在这里，不在代码里四处散落。
- **`ShellAdapter`**：终端层抽成接口，`shell-bash.ts` 与 `shell-powershell.ts` 两个实现，负责启动参数、脚本文件、执行行、换行符、中断和杀进程树。标记解析、输出分页、取消逻辑全部共用。
- **其余约 85% 代码平台无关**：MCP 服务、路径沙箱、文件 / 搜索 / 编辑工具、任务卡、Skills、隧道、限流。Windows 只额外补了几处 shim：拒绝 `CON`/`NUL` 等保留设备名、`rename` 遇到杀毒软件占用（`EPERM/EBUSY`）时短重试、定位或下载 `cloudflared.exe`、从 VS Code 安装目录取 `rg.exe` 和 node-pty。

### 2.1 传输层：只暴露一个带秘钥的路径

- 用官方 `@modelcontextprotocol/sdk` 的 `StreamableHTTPServerTransport`，`node:http` 只监听 `127.0.0.1`。
- 只有 `/mcp/<token>` 和 `/healthz/<token>` 两个路径，其余一律裸 404，没法探测。token 是 128 bit 随机数，存在 VS Code SecretStorage，可一键轮换；比较用 `timingSafeEqual`。
- 默认返回普通 JSON 而不是 SSE——trycloudflare 的快速隧道对长连接 SSE 不太友好。
- 每个 MCP session 一个独立 `Server` 实例，上限 32 个；请求体上限 8 MB。
- `initialize` 的 `instructions` 字段会下发使用规则和工作区根目录下的 `AGENTS.md` / `CLAUDE.md`，远程模型一连上就“知道这个项目的规矩”。

### 2.2 隧道：自愈的 cloudflared 监督器

- 快速模式：`cloudflared tunnel --url http://127.0.0.1:<port>`，从日志里正则抓 `https://*.trycloudflare.com`；也支持绑定自有域名的 Named Tunnel，地址固定。
- 找不到 cloudflared 时，可一键下载官方单文件版（Linux 的 `cloudflared-linux-*`，Windows 的 `cloudflared-windows-*.exe`），无需 sudo / 管理员权限。
- 先在本地打 `/healthz/<token>`，再经公网地址确认通，才报告“在线”。
- 进程异常退出按 2 s → 60 s 指数退避重启；稳定运行一段时间后清零退避。
- **QUIC → http2 自动降级**：连续两次出现 `failed to dial to edge with quic`、`no recent network activity` 一类症状且始终没注册成功，就对这个监督器强制加 `--protocol http2`。很多校园网 / 公司网会丢 UDP，这一条非常实用。
- 日志里的 token 一律脱敏成 `/mcp/<token>`。

### 2.3 终端：用私有标记拿到退出码和 cwd

远程 Agent 要的不是一个“屏幕”，而是“这条命令什么时候结束、退出码多少、现在在哪个目录”。WSL / Linux 上的 bash 适配器这样做：

1. 用 node-pty（直接复用 VS Code Server 自带的那份，省得编译原生模块）起一个 `bash --login -i`，`stty -echo`、关历史、清空 `PS1`。
2. 每条命令先写进 `cmd-<seq>.sh`（权限 600），再由一个 shell 函数 `source` 执行，所以多行脚本、heredoc 都没问题，输入行也不会回显。
3. 命令前后打印私有转义序列：

```bash
printf '\033]633;WC;<随机token>;S;<seq>\007'          # 开始
. cmd-<seq>.sh 2>&1; ec=$?
printf '\033]633;WC;<token>;E;<seq>;%s;%s\007' "$ec" "$(printf %s "$PWD" | base64 -w0)"   # 结束：退出码 + cwd
```

4. 解析器只认 token 匹配且 `seq` 对得上的结束标记，防止旧提示符误判；cwd 用 base64 避免奇怪字符。
5. 超过单次调用时限（公网隧道约 90 s）就返回 `status=running` 和 `next_offset`，**不杀进程**，Agent 用 `get_command_output` 续读。取消先发 Ctrl-C，`force` 时遍历 `/proc` 杀整棵进程树。

没有 PTY 时退化为管道模式，同一套标记协议照样工作。

**Windows 上的 PowerShell 适配器**沿用同一套协议，但踩了不少坑：

- 用 VS Code 自带的 node-pty（ConPTY）起 `powershell.exe -NoLogo -ExecutionPolicy Bypass -NoExit -File init.ps1`；`auto` 时优先 pwsh 7，没有就回退 Windows PowerShell 5.1，并加载 `$PROFILE`（对应 bash 的 `--login`）。
- **编码**：中文系统默认代码页 936，不处理必乱码。初始化时把控制台输入输出切到无 BOM 的 UTF-8；而命令脚本 `cmd-<seq>.ps1` 反而要**带 BOM** 写入，因为 5.1 会按系统代码页读取无 BOM 的脚本。
- **执行方式**：`& { . $script } *>&1 | Out-String -Stream -Width 500`。实测对比了三种写法，只有在子作用域执行并合并所有流，错误信息才能和输出按原顺序交错，退出码也才正确（`$LASTEXITCODE` 优先，否则有新错误记 1）。5.1 会把原生程序的每行 stderr 包成 6 行的 `NativeCommandError`，这里还原成纯文本。
- **标记改成文本行**：ConPTY 会把 OSC 序列直通，屏幕文字却按帧渲染，结束标记可能跑到最后几行输出之前。PTY 模式因此把标记打印成文本行 `[[WC;<token>;<body>]]`，让它和输出一起走屏幕缓冲区，顺序天然正确；管道模式仍用 OSC。
- 其他细节：ConPTY 用 CR 提交输入行；PSReadLine 要在 `prompt` 函数里移除，才能去掉重绘和历史；杀进程树用 `taskkill /T /F`。

### 2.4 文件沙箱：连符号链接逃逸也拦

`resolveInWorkspace()` 先把路径对根目录 `resolve`，再对“已存在的最长前缀”做 `realpath`、拼回缺失的尾巴，最后用 `path.relative` 判断是否仍在根内。这样 `../`、外部绝对路径、指向外面的软链接都会被拒绝，并且能区分是哪一种。同一段代码在 Windows 上同样成立：`path.relative` 不区分大小写，junction 会被 realpath 展开，`/etc/x` 会解析成 `C:\etc\x` 而被拒；另外还拒绝 `CON`、`NUL` 等保留设备名，并对 8.3 短路径做规范化。

### 2.5 命令审批：按 shell 分别做静态分析

`run_command` 跑的是真 shell，不是沙箱，所以要靠审批兜底。`assess/` 下按 shell 各写一个分类器：

- bash：`sudo`、`rm -rf`、`git push --force`、`curl | sh`、写工作区外的路径……
- PowerShell / cmd：`-Verb RunAs`、`Remove-Item -Recurse -Force`、注册表 / 服务 / 防火墙修改、`Invoke-Expression`；
- 嵌套解释器：`cmd /c`、`wsl -e`、`powershell -EncodedCommand` 会被拆开再判一次（Base64 先解码）。这也顺带补上了 WSL 侧的盲区：在 bash 里调 `powershell.exe -c "…"`，内层同样按 PowerShell 规则审。

规则用 `path.win32` 显式实现工作区内外判断，所以 Windows 规则也能在 Linux 上跑单元测试。

命中就弹出本地审批面板（带像素小吉祥物和提示音），300 s 不点自动拒绝。约 45 s 时先给 Agent 返回 `awaiting_approval`，它继续轮询，晚点的 Allow 也能生效。另外同一 IP 10 分钟内错 10 次 token 就封 15 分钟。

### 2.6 工作流闸门：把“先计划、后验证”写进服务端

这是我最喜欢的一块。`weicode.workflow.mode = enforced` 时：

- Agent 先只能做只读调查（`ls` `cat` `rg` `git log` 这类白名单命令，带重定向、命令替换的一律算写）。
- 要改东西，必须用 `set_todos` 提交任务卡：`goal` + `plan` + 最后一步是 `kind: "verify"`。卡片处于 *proposed*，用户在 VS Code 里点 APPROVE 之前，所有编辑和非只读命令都被拒。
- 关卡时，每个 verify 项都要有证据：一个**在最后一次编辑之后**跑的、退出码为 0 的 `command_id`，或者用户亲自确认。改了 goal 或删了 verify 项，要重新审批。
- 每次编辑 / 命令结果末尾附一行 `[task …]`，把目标钉在 Agent 最新的上下文里，长任务也不跑偏。

规则在服务端而不是提示词里，所以 Agent 的上下文再长、再被压缩，规矩都还在。

## 3. 可复现的技术路线

如果想自己做一个类似的东西，我建议按这个顺序：

1. **选形态**：独立 VS Code 扩展，`extensionKind: ["workspace"]`。用 Remote-WSL 打开 Linux 文件夹，扩展宿主就跑在 Ubuntu 里，文件、bash、git、LSP 全是原生的，不用做 Windows↔Linux 路径转换，也不用 fork Code-OSS；同一个 VSIX 装到 Windows 本地窗口，就跑在 Windows 端。**从第一天起就把平台判断收进 `HostProfile`、把终端写成 `ShellAdapter` 接口**，后面加 Windows 会轻松很多。
2. **M1 传输**：`node:http` + MCP SDK 的 Streamable HTTP，只监听 127.0.0.1，`/mcp/<token>` 路由；先实现 `list_directory` / `read_files`，本地 `curl` 能拿到 `tools/list` 就算过。
3. **M2 读改查**：路径沙箱、ripgrep 搜索、带版本号的 `apply_patch`、`vscode.languages.getDiagnostics` 和 `vscode.execute*Provider` 包一层。验收：远程 Agent 能完成一次“读 → 改 → 查错”。
4. **M3 终端**：node-pty 常驻 shell + OSC 标记协议 + 输出分页 / 取消 / 输入。验收：能跑 `npm test`，长任务能续读。
5. **M4 上公网**：cloudflared 监督器（退避重启、健康检查、QUIC→http2 降级），状态栏显示在线状态，token 轮换。
6. **M5 安全与体验**：命令审批、只读模式、限流、可选 Bearer；任务卡面板、活动日志；`vsce package` 打包 VSIX。
7. **M6 原生 Windows**：PowerShell 适配器（ConPTY、UTF-8、文本标记）→ PowerShell / cmd / 嵌套解释器审批规则 → `cloudflared.exe` 下载与双平台 CI。开发时在 NTFS 上放一个 git worktree，用 Windows 的 node 跑测试，从 WSL 里通过 `cmd.exe /c` 就能驱动。
8. **可选**：无头 `cli.js`，彻底摆脱 VS Code。

测试方面，用官方 MCP 客户端写端到端脚本最省心：WeiCode 现在 Linux / WSL 下 `npm test` 有 287 项检查，Windows 下 `npm run test:win` 有 279 项，覆盖文件工具、终端（PTY 和管道两种后端、bash 和 PowerShell）、任务卡、审批规则、隧道降级等，并跑在 GitHub Actions CI 上。

## 4. 接入方式

给 Agent 的提示里附一个标准库写成的 `wc.py` 小助手（扩展里一键复制），它负责 MCP 握手和会话保存：

```bash
python3 wc.py --guide            # 读使用规则和项目 AGENTS.md
python3 wc.py --list             # 列出工具
python3 wc.py workspace_info '{}'
```

这样即使 Agent 只有一个 shell，没有原生 MCP 客户端，也能用。连的是 WSL 还是 Windows，`workspace_info` 会告诉它。

## 5. 几点体会

- **规则放服务端，不放提示词。** 提示词会被遗忘，服务端的拒绝不会。
- **公网暴露要按“会被扫”来设计**：秘钥路径、裸 404、限流、日志脱敏，一个都别省。
- **跨平台的难点在终端，不在文件。** 路径沙箱几乎原样可用，PowerShell 的编码、ConPTY 的渲染顺序、5.1 的错误包装却各花了不少时间，真机实测比读文档靠谱。
- **网络问题比代码问题多。** QUIC 被丢、DNS 负缓存、隧道地址每次重启都变……自动降级和清楚的诊断信息，比多加一个工具更有价值。
