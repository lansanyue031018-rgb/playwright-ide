# Playwright Flow Studio

Playwright Flow Studio（PFS）是一个本地优先的浏览器后台自动化低代码编排器。它把定位元素、点击、输入、上传、等待、条件、循环和可复用任务编排成结构化步骤，并实时生成可读、可继续手写维护的 Playwright `.mjs` 脚本。

仓库名保留为 `playwright-ide`，产品名使用 **Playwright Flow Studio**。

## 主要特点

- 多账号隔离：支持 CDP 独立 Profile、持久化 Context、临时 Context + `storageState`。
- 独立代理：每个浏览器节点可配置 HTTP(S)/SOCKS 代理；认证信息优先从环境变量读取。
- 可选 stealth：按节点引入 `playwright-extra` 和 `puppeteer-extra-plugin-stealth`。
- 专注 Playwright：节点参数直接对应 locator、`nth()`、等待、键盘、文件上传等浏览器操作。
- 变量复用：常用变量统一在脚本开头使用 `let` 声明，重复结果变量改为赋值，空结果名自动生成 `result2` 等名称。
- 双向复用：支持导入/导出结构化 JSON 和带元数据的 `.mjs`。
- 条件与循环：具有缩进子步骤和明确的结束标志。
- 任务与自定义模块：可以打包连续步骤、导入 MJS，也可以把自定义代码保存为带可配置参数的复用壳。
- 磁盘历史：撤回/前进快照写入 `.flow-cache/`，上限可在设置中调整。
- 本地执行：运行日志实时显示，可在页面中终止当前任务。
- 轻量依赖：前端使用原生 HTML/CSS/JS，后端使用 Node.js 内置 HTTP 服务。

## 与 n8n 的定位差异

| 场景 | Playwright Flow Studio | n8n |
| --- | --- | --- |
| 核心目标 | 浏览器页面自动化与 Playwright 脚本生成 | 通用 API、数据和 SaaS 集成工作流 |
| 页面定位器 | 原生建模 locator、角色、文本、placeholder、test id、`nth()` | 通常需要代码节点或外部浏览器组件 |
| 脚本资产 | 直接生成、导入和运行 `.mjs` | 工作流主要保存在平台节点模型中 |
| 使用方式 | 本地优先，复用浏览器 CDP 会话 | 服务化工作流平台 |

PFS 不是 n8n 的通用替代品。它针对需要反复调试网页元素和保留 Playwright 源码的任务提供更短路径。

## 快速启动

Windows 推荐双击：

```text
start-flow-studio.cmd
```

启动器会调用 PowerShell，检测 Node.js/npm、安装 Playwright 与可选 stealth 依赖、启动本地服务，并打开：

```text
http://127.0.0.1:8765
```

Git Bash、WSL 或 macOS/Linux 可运行：

```bash
./start-flow-studio.sh
```

手动启动：

```powershell
npm install
npm run serve
```

## 常用操作

- `Ctrl+Z`：撤回一个流程快照。
- `Ctrl+Shift+Z`：前进一个流程快照。
- `设置`：调整磁盘快照上限或清空历史。
- `运行当前脚本`：生成 `runtime/scripts/current-workflow.mjs` 并执行。
- `终止运行`：向当前子进程发送中断信号，必要时终止其进程树。
- `操作手册`：打开内置的完整 HTML 使用说明。

## 多账号与代理

- `CDP 独立 Profile`：一个账号使用一个端口、一个 `userDataDir` 和一个代理服务器，适合长期保留 Edge 登录态。
- `持久化 Context`：使用 `launchPersistentContext()`，账号登录态保存在独立目录；支持带账号密码的代理。
- `临时隔离 Context`：使用 `browser.newContext()`，可加载和保存独立的 `storageState`。
- CDP 端口已经存在时，PFS 不会重新修改该浏览器的 Profile 或代理。需要新配置时应换一个未占用端口。
- 代理用户名和密码默认从环境变量读取。直接填写会进入浏览器本地存储和导出的流程元数据，不适合敏感凭据。
- stealth 是社区兼容层，只减少部分自动化特征，不保证绕过站点风控或验证码。

## 目录

```text
.
├─ index.html                 # 编排器主页面
├─ app.js                     # 前端状态与交互
├─ generator.js               # MJS 生成器
├─ parser.js                  # MJS 导入解析器
├─ workflow.js                # 嵌套步骤编排
├─ server.mjs                 # 本地 HTTP/API 服务
├─ runtime-service.mjs        # 脚本、任务、浏览器和进程服务
├─ history-service.mjs        # 磁盘快照与撤回/前进
├─ script-runner.mjs          # 确保模块执行完成后退出
├─ manual.html                # 完整操作手册
├─ runtime/                   # 运行产物，Git 忽略
└─ .flow-cache/               # 历史快照，Git 忽略
```

## 测试

```powershell
npm test
```

## 安全边界

- 默认只允许连接 `127.0.0.1` 或 `localhost` 的 CDP 地址。
- `states/` 和 `.auth/` 默认被 Git 忽略，避免误提交登录态。
- 导入 MJS 时只解析文本，不执行脚本。
- 执行脚本等同于以当前用户权限运行本地 Node.js 代码，只运行可信脚本。
- Vidu 示例默认不点击最终创作/提交按钮。
- 当前服务面向单机使用，不应直接暴露到公网。

## 许可证

本项目使用 **MIT License + Commons Clause License Condition v1.0**。

这是一种 source-available（源码可用）许可，不是 OSI 认可的开源许可证。MIT 的权限继续适用，但不得出售本软件本身，或提供其价值完全或主要来自本软件功能的付费产品/托管服务。具体边界以 [LICENSE](./LICENSE) 原文为准。
