---
title: 从调试端口到浏览器插件：逆向一个微课平台，把"学习时长"和"必做练习"自动化
published: 2026-11-12
description: 一次完整的 Web 逆向实录：用 CDP 接管指纹浏览器、把平台的几个接口摸清楚，再把结论固化成一个零权限的 MV3 浏览器插件。聊聊学习时长和自动答题是怎么回事、几个致命的坑，以及一条可以照着复现的技术路线。
image: https://img.2298321.xyz/images/1a205bc5d4ef8a1b3e15d53c66c7356602f0df928899a0ef0a5b65d57359959a.webp
tags: [逆向工程, Chrome DevTools Protocol, 浏览器插件, MV3, Shadow DOM, JavaScript, Node.js]
category: 工具开发
draft: false
slug: mse-microlesson-helper
---

学校的网课平台要求"挂满学习时长 + 做完必做练习"才算完成。真挂机太浪费时间，于是我花了一晚上把它的前后端摸了一遍，得到两个结论：**学习时长是前端按秒上报、服务端不校验增量的**；**必做练习的标准答案，服务端会在你有一条提交记录之后主动下发**。

把这两件事自动化，就有了这个工具。它分两层：先用 **CDP（Chrome DevTools Protocol）** 在真实浏览器里把接口逆清楚、跑通流程，再把结论固化成一个 **零权限、单文件的 MV3 浏览器插件**，给非技术的同学也能一键用。这篇就把整条链路讲清楚。

![技术路线图](https://img.2298321.xyz/images/1a205bc5d4ef8a1b3e15d53c66c7356602f0df928899a0ef0a5b65d57359959a.webp)

## 1. 为什么从 CDP 开始，而不是直接读接口

最朴素的做法是打开 F12、看 Network、抄接口。但这个平台跑在一个**指纹浏览器**（HubStudio，Chrome 152 内核）里，开发者工具被限制，而且我想要的不只是"看"，是"在页面上下文里用它自己的 jQuery 和登录态去调接口、还能预演"。CDP 正好给这个能力。

第一个坑就在找到真正的调试端口：**指纹浏览器会改写调试端口，启动参数里写的那个并不是实际生效的。** 找真实入口的办法是绕过启动参数、从进程侧反查：挑一个 renderer 子进程，读它命令行里继承下来的调试端口值，再确认这个端口的监听方正是浏览器主进程，就拿到了真正的 CDP 入口。

另一条弯路也值一提：试过另起一个 Edge + 克隆配置目录，结果 `Cookies` 被原进程独占锁定、热拷贝不了，放弃。**直接复用现成的调试端口，比自己造一个浏览器环境省事得多。**

连上之后，写了个零依赖的 CDP 小驱动（Node 22 原生 `WebSocket`，不装任何包），支持 `targets / info / eval / html / text / click / type / key / nav / shot / wait`。核心就是一个 WebSocket，发 `Runtime.evaluate`，`awaitPromise: true` 等 Promise、`returnByValue: true` 把结果带回来：

```js
const res = await cdp.send('Runtime.evaluate', {
  expression: `(${inpageFn})(${JSON.stringify(opts)})`,
  returnByValue: true, awaitPromise: true, userGesture: true,
});
```

`inpageFn` 是一段在**页面里**跑的 async 函数。因为它运行在页面上下文，可以直接用站点自己的 `$.ajax` 发请求——登录态、CSRF、baseURL 全都现成，我一行都不用管。端口用环境变量覆盖、多标签页按 url/title 过滤，剩下的就是把接口一个个试出来。

## 2. 核心原理一：学习时长，服务端不校验增量

把上报接口摸清楚后，逻辑意外地简单：

- **上报**：前端 `setInterval` 每 30 秒执行 `Seconds += 30`，然后 `POST /Adm/UserLearingLog/Create`。服务端按 **`Seconds` 的增量**累加进 `CurTotalSeconds`，**不校验这个增量的上限**——实测一次提交 +1080 秒直接被接受。
- **读取**：`POST /Adm/CourseStruct/StudentDetail {courseStructId, classId}` 返回 `lastLearingLog`（含 `CurTotalSeconds`）和 `courseStruct`（含 `StudyMinutes`，即要求分钟数）。
- **进度**：`StudyProcess = CurTotalSeconds / (StudyMinutes × 60)`。

所以补满一个小节，不用挂机，只要算出差额、一次性提交：

```js
const target = req * 60;              // 要求秒数
const cur = log ? +log.CurTotalSeconds : 0;
const delta = target - cur;          // 只补差额，不超发
payload.Seconds = (log ? +log.Seconds : 0) + delta;
await post('/Adm/UserLearingLog/Create', payload);
```

几个要留神的点，都是从返回值里试出来的：

- `StudyMinutes = 100000` 是"无要求"的**哨兵值**，要跳过，否则会去追一个永远填不满的目标。
- 父节点的 `StudyProcess` = 已完成的直接子节点数 / 子节点总数，所以**只补叶子节点**，父节点自动变绿。
- 含 `IsMustAnswerSubject = 1` 的节点，纯时长**最多只能到 50%**，另一半必须靠做练习。光挂机推不满，这就引出了第二块。
- `isOpenAfk` 是平台的挂机检测开关，直接调接口上报可以完全绕过它。
- 只补**差额**、精确到目标值，不会把时长记成夸张的数字。

## 3. 核心原理二：必做练习，先交空卷才拿得到答案

这块更绕，关键发现是：**标准答案由服务端在"核对答案"时下发，但前提是该小节已经存在一条提交记录（`CourseStructHand.Status = Examed`）。** 没有提交记录时，`Answer` 字段是 `null`。

于是完整链路是这样一个"先提交、再取答案、再重做"的闭环：

1. `POST /Adm/CourseStruct/SubjectReply` —— 取题目结构和当前的 hand（提交记录）。
2. 没有 hand 时，`POST /Adm/CourseStructReply/SubmitAll {status:'Examed'}` **交一份空卷**，建立提交记录。
3. `POST /Adm/Subject/CheckAnswers {courseStructHandId}` —— 用这条 hand 换标准答案。
4. `POST /Adm/CourseStructHand/Delete {ids:[handId]}` —— 删掉这次作答，准备重做。
5. `POST /Adm/CourseStructReply/SubmitAll` —— 按标准答案重新提交。

```js
if (!sr.courseStructHand && !repeatable) {
  return { skip: 'no-redo-cannot-prefetch' };   // 关键防线，见下
}
if (!sr.courseStructHand) {
  await submitAll(csid, emptyModels, 'Examed');  // 交空卷建记录
  sr = await getState(csid);
}
const answers = await fetchAnswers(csid, sr, items);
await post('/Adm/CourseStructHand/Delete', { ids: [sr.courseStructHand.Id] });
await submitAll(csid, modelsWithAnswers, 'Examed');
```

### 一个需要谨慎试探的陷阱(奶娃狂笑)

`IsAllowedRepeatAnswer = 0` 的小节**不允许删除作答**（删除时返回"章节未开启重做"）。如果对这种小节也走了"先交空卷"的流程，那份空卷就**永久锁死为错误作答**，再也改不回来——我在改造前就误伤过一个非必做小节的 Passage，3 题错分无法通过接口修正。

所以第 1 步之后必须先判 `IsAllowedRepeatAnswer == '1'`，不满足就直接跳过，**绝不交空卷**。这是整个工具里最重要的一条防线。

题型和判定字段，也是对着返回值一点点认出来的：

- `single`：选项是 JSON 字符串，`Answer` 是字母 A/B/C/D；`fill` / `fillObj`：文本；`shortAnswer`：主观题（翻译、写作），`IsRight = null`，由教师批阅、平台不自动判分；`bit` 等。
- `CourseStructReplys[].IsRight`：`1` 对、`0` 错、`null` 待批；提交后回读这个字段就能自己统计正确率。

实测这套流程：必做节点全部到 100%，客观题接近全对，主观题进入待批阅状态。到此，逆向阶段的产物是两个带 `--dry` 预演的命令行工具（补时长、自动答题），能稳定复现。

## 4. 从命令行到浏览器插件：MV3 的几个选择

命令行只有我自己能用。要给同学用，得做成插件。这里的设计目标是"**尽量少要权限、尽量不显眼**"，于是：

### 4.1 `world: "MAIN"` + 零权限，复用页面的 jQuery

`manifest.json` 里只声明了一个 `content_scripts`，`world: "MAIN"`、`run_at: document_idle`，`matches` 只匹配这一个平台域名，**不申请任何 `permissions`**：

```json
{
  "manifest_version": 3,
  "content_scripts": [{
    "matches": ["https://<平台域名>/*"],
    "js": ["content.js"],
    "run_at": "document_idle",
    "world": "MAIN"
  }]
}
```

跑在 `MAIN` world 意味着脚本和页面共享同一个 JS 环境，可以直接用站点的 `window.$`：

```js
function ajax(url, data) {
  return new Promise((res, rej) => {
    if (typeof window.$ !== 'function' || !window.$.ajax) {
      return rej(new Error('页面 jQuery 未就绪，请刷新页面'));
    }
    window.$.ajax({ url, type: 'POST', data, dataType: 'json', success: res,
      error: (x) => rej(new Error('HTTP ' + x.status)) });
  });
}
```

不申请权限、不开 background、不联网第三方，整个插件对浏览器来说就是"页面里多了一段脚本"。代价是 `MAIN` world 里**没有 `chrome.*` API**，取不到扩展资源路径——这就带出下一个细节。

### 4.2 Shadow DOM + 构造式样式表，绕开页面 CSP

面板不能直接插进页面 DOM，否则会被站点的 CSS 和 CSP 干扰。做法是挂一个宿主元素、`attachShadow`，再用**构造式样式表**（`adoptedStyleSheets`）注入样式，而不是 `<style>` 标签——后者常被 CSP 拦掉：

```js
const shadow = host.attachShadow({ mode: 'open' });
const sheet = new CSSStyleSheet();
sheet.replaceSync(CSS);
shadow.adoptedStyleSheets = [sheet];
```

面板是右下角浮窗，按钮有：补时长 / 自动答题 / 一键全自动 / 扫描 / 校验 / 停止 / 清空日志。事件用一个 `data-act` 做委托，日志区逐条打印"从多少秒 → 多少秒"。

背景的吉祥物图（就是路线图里那个）因为取不到扩展资源路径，干脆**压成 JPEG、以 `data:` URI 内嵌**进 `content.js`。压缩时本机没有 PIL / ImageMagick，就用无头浏览器 + `canvas.toDataURL('image/jpeg', 0.82)` 现压——顺带一个坑：PowerShell 的 `Start-Process` 启的子进程会随会话被杀，得用后台方式拉起无头浏览器。

### 4.3 版本探测与优雅降级

逆向最怕的是平台改版后，工具还在按老接口瞎写。插件启动时会做一次 `probe()`：

- 比对平台脚本的版本特征（`base.js` 是否含某个 `study-duration` / `course-progress` 特征串，`subject.js` 是否含 `answer-review` 特征串）；
- 校验当前 `courseId` 是否为支持的课程；
- 试调章节接口和题目接口，确认返回结构没变（比如 `subjectPager.SubjectStructs` 还在）。

任何一项不过，就 `out.ok = false`、`issues.push(...)` 记原因，面板顶部弹红色横幅"检测到平台更新，部分功能不可用"，并**禁用所有写操作，只保留扫描和校验这两个只读功能**。这样平台一改版，工具会自己变灰、而不是悄悄写错数据。

## 5. 可复现的技术路线

想自己做一个类似的 Web 逆向 + 工具化，我建议按这个顺序：

1. **M1 搭台**：选一个能在页面上下文执行代码的入口。优先复用现成的调试端口（指纹浏览器 / `--remote-debugging-port`），别去跟被独占锁定的用户配置目录较劲。写一个零依赖的 CDP 小驱动，能 `eval` 一段 async 函数并把结果带回来就算过。
2. **M2 摸接口**：在页面上下文里用站点自己的 `$.ajax` 把读接口先跑通（读进度、读题目结构），所有写操作先加 `--dry` 只预演。**目标是先把数据模型认清楚**：哪个字段是进度、哪个是哨兵值、哪个控制能不能重做。
3. **M3 跑通写入**：实现最小闭环（补时长的差额提交；答题的"交空卷→取答案→重做"）。**在这一步就把致命防线写进去**：不可重做的小节绝不交空卷。每一步都回读服务端判定字段来自我验证。
4. **M4 工具化**：把结论固化成 MV3 插件。`world: "MAIN"` 复用页面登录态、零权限；Shadow DOM + 构造式样式表做 UI 绕 CSP；资源用 `data:` URI 内嵌。
5. **M5 健壮性**：版本 / 课程 / 接口结构三重探测，失配即降级为只读。给每个只写操作配一个只读的"扫描"和"校验"，让用户先看清楚、事后能复核。

## 6. 几点体会

- **先读后写，写前预演。** 逆向最贵的不是写代码，是认数据模型。`--dry` 和"扫描/校验"这类只读视图，能在真正动手前把 90% 的误判挡掉。
- **最危险的操作要有不可逆检测。** "不可重做的小节交了空卷就锁死"这种坑，一旦踩中无法补救，必须在流程最前面就拦住。
- **`world: "MAIN"` 是把双刃剑。** 能白嫖页面的 jQuery 和登录态，省掉一大堆权限和跨域处理；代价是没有 `chrome.*`，资源内嵌、样式注入都得另想办法。
- **平台基本每个月都会更新。** 所以插件启动时一定要先做版本/课程/接口结构探测，一旦发现适配点失效就自动降级为只读、禁用所有写操作，并把失配的版本号提示出来，等人工更新适配后再分发——这样改版时它不会默默写坏你的数据。

## 7. 开源

插件代码已经开源，欢迎参考、提 issue 或自己改适配：

<https://github.com/NIUzGG-FMei/MSE-autoFinish-your-Homework>

需要说明的是，它只适配我自己那一门课的平台版本，直接拿去未必能跑；更多是作为一份"CDP 逆向 → MV3 工具化"的完整样例。平台改版后适配点大概率会失效，照着第 5 节的路线重新摸一遍接口即可。
