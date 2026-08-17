---
title: "桌面养了一只“奶包”：naibao 桌面宠物"
published: 2026-08-18
description: "介绍我的 Windows 桌面宠物 naibao：置顶悬浮、网页跳转、截图、北京时间整点报时，附安装包与源码下载。"
image: ./images/naibao/naibao.png
tags: [WPF, C#, .NET, Windows, 桌面宠物]
category: 开发工具
draft: false
slug: naibao-desktop-pet
---

给 Windows 桌面做了只奶包/豆奶，用 C# + WPF（.NET 8）写成，已经开源。

它平时就悬浮在桌面最上层，按住可以拖着走，位置会自动记住；嫌碍事就右键托盘图标藏起来，也可以在设置里勾选"开机自启"。

单击它，会弹出一个菜单：网页跳转（一键打开常用网址）、截图（先把自己藏起来再调系统截图工具，保证不入镜）、设置、隐藏、退出。

整点报时：每个北京时间整点，它就在旁边弹气泡："叮咚～ 现在是北京时间 15:00"，还能配 mp3/wav 自定义音效；怕吵就调成仅提示或完全静音。

怎么用？二选一：下载 naibao-setup-1.0.0.exe 双击安装，或下载 naibao-portable-1.0.0.zip 解压直接运行。不用管理员权限，也不用装 .NET 运行时；程序不联网、不上传数据、无毒绿色健康。

下载：[GitHub Releases](https://github.com/NIUzGG-FMei/NaiBao/releases) · 源码：[github.com/NIUzGG-FMei/NaiBao](https://github.com/NIUzGG-FMei/NaiBao)。MIT 协议，随便玩。
