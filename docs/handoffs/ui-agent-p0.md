# UI Agent P0 Handoff

日期：2026-06-06  
Agent：UI Agent  
阶段：P0 技术 Spike  
工作目录：`/Users/zhaiyongtao/vibeCoding/notch-ai-monitor`

## 1. 本次目标

- 创建 `apps/desktop` 最小 Vite + TypeScript Web shell。
- 将 `prototype/interactive-v2` 的 Notch UI 核心结构迁到工程 app。
- 接入 `@notch-ai-monitor/local-manager-mock` 的 `ManagerSnapshot` / `requestAction` 闭环。
- 保留 P0 所需状态 attribute、debug scenario、面板、toast、live region 和交互。
- 不修改 `packages/shared`、`packages/local-manager-mock`、`prototype/*`、`design/*` 源码。

## 2. 已完成内容

- 新增 `@notch-ai-monitor/desktop` workspace，使用 Vite + TypeScript + 原生 DOM/CSS。
- 迁移 menu bar、wallpaper、notch zone、left/right capsule、sessions panel、action panel、demo tray、toast、live region。
- 保留 `data-state="dormant|glance|peek|expanded"`、`data-mood="none|waiting|happy|sad|angry"`、`data-panel="none|sessions|action"`。
- UI 通过 `MockLocalAgentManager.getSnapshot()` / `subscribe()` 消费 manager snapshot。
- DebugHarness 只调用 `manager.injectScenario("idle" | "waiting" | "result" | "error" | "risk" | "all")`。
- 用户 action 只调用 `manager.requestAction(...)`，toast/live region 使用 `ActionResultPayload.message`。
- resolving action 后由 manager snapshot 驱动 next event；最后一条 resolve 后回 `dormant`。
- 支持二次确认 action：第一次返回 `needs_confirmation` 后按钮显示 `确认 ...`，第二次携带 `confirmed: true`。
- 支持右胶囊打开 action panel、左胶囊打开 sessions panel、无事件右胶囊 toast、hover/focus peek、Esc collapse、ArrowLeft/ArrowRight 分页、action click。

## 3. 修改/新增文件

| 文件 | 类型 | 说明 |
| --- | --- | --- |
| `package.json` | 修改 | 增加 `apps/*` workspace；root `build` 串联 desktop build，不改变 root `test` 的 shared + manager 测试链路 |
| `package-lock.json` | 修改 | 新增 desktop workspace 和 Vite 依赖 lock |
| `apps/desktop/package.json` | 新增 | desktop package metadata、scripts、workspace dependencies |
| `apps/desktop/tsconfig.json` | 新增 | strict TS 配置 |
| `apps/desktop/index.html` | 新增 | Vite app entry |
| `apps/desktop/src/main.ts` | 新增 | app bootstrap entry |
| `apps/desktop/src/app/bootstrap.ts` | 新增 | 创建 mock manager，注入初始 all scenario，启动 UI app |
| `apps/desktop/src/app/app-shell.ts` | 新增 | Notch UI DOM shell、render、interaction、manager action bridge |
| `apps/desktop/src/state/selectors.ts` | 新增 | 从 `ManagerSnapshot` 选择 active events、selected event、session counts、format helpers |
| `apps/desktop/src/state/ui-store.ts` | 新增 | UI-only state：selected event/session、panel、shell state、demo open、pending confirmation |
| `apps/desktop/src/debug/debug-harness.ts` | 新增 | Debug scenario 到 manager 的薄封装 |
| `apps/desktop/src/ui/styles/notch.css` | 新增 | Quiet Glass / interactive-v2 风格样式和响应式规则 |
| `docs/handoffs/ui-agent-p0.md` | 新增 | 本 handoff |

## 4. 关键决策

- desktop `build` 和 `dev` 都先构建 shared 和 local-manager-mock，再执行 `tsc` + `vite build` 或启动 Vite，保证清理 dist 后仍能解析 workspace dist exports。
- UI store 不保存事件真值，只保存 `selectedEventId`、`selectedSessionId`、`panel`、`shellState` 等视图状态；事件列表、计数、current/next 都来自 manager snapshot。
- action panel 展示所有 manager action，不再只取原型前两个按钮；移动端将 action buttons 做成 sticky，减少滚动后才能操作的问题。
- demo tray 在打开主面板或切换 scenario 后自动收起，避免挡住 action panel。
- dormant 时右胶囊保持极淡可点，满足“无事件右胶囊 toast”验收，同时尽量保留低打扰气质。

## 5. 暴露的接口或数据结构

- `bootstrapDesktopApp()`：desktop app entry。
- `NotchDesktopApp`：接收 DOM root 和 `MockLocalAgentManager`，渲染并订阅 snapshot。
- `UIStore`：UI-only state，不对 event queue 做任何写操作。
- `DebugHarness.injectScenario(scenario)`：薄调用 `MockLocalAgentManager.injectScenario(...)`。
- selector helpers：`activeEventsFromSnapshot`、`selectedEventFromSnapshot`、`activeCountBySession`、`scenarioFromSnapshot`。

## 6. 测试结果

- 执行命令：`npm install`
- 结果：安装成功；npm audit 报 2 个 moderate vulnerability，未做强制修复。
- 执行命令：`npm run build -w @notch-ai-monitor/desktop`
- 结果：通过；shared、local-manager-mock、desktop app 均完成构建。
- 执行命令：`npm run build`
- 结果：通过；root build 可构建 shared + manager + desktop。
- 执行命令：`npm test`
- 结果：通过；shared 9 个测试通过，local-manager-mock 7 个测试通过。
- 浏览器 smoke：初始 all scenario risk peek、右胶囊 action panel、ArrowLeft/ArrowRight 分页、risk reject 后自动切 next confirm、error terminate 二次确认、idle 右胶囊 toast 均验证通过。

## 7. 未解决问题

- 当前仍是 Web shell，没有 Tauri IPC、真实 CLI adapter、真实副作用或真实 window/session discovery。
- Browser 插件 viewport 控制在最后一次窄屏复查时超时并重置，代码侧已补 sticky actions 且 build 通过；建议 QA 后续用稳定 Playwright/浏览器再做一次 390px 和 760px 以下视觉截图。
- `npm install` 报 2 个 moderate audit 项；本次未跑 `npm audit fix --force`，避免超出 P0 ownership 并改动依赖大版本。

## 8. 下一位 agent 需要知道的上下文

- desktop 初始启动调用 `manager.injectScenario("all")`，所以打开 app 默认进入 risk peek，可直接测试完整队列。
- `MockLocalAgentManager.requestAction` 是同步 API；resolving action 会先 emit snapshot，UI 再展示 action result toast。
- `allow-once` / `terminate` 第一次点击会收到 `needs_confirmation`，第二次点击才带 `confirmed: true`。
- 如果后续接真实 IPC，替换 `bootstrap.ts` 里的 manager 实例即可；UI 期望的外部面仍是 `getSnapshot()`、`subscribe()`、`requestAction()`、`injectScenario()`。
- 为了交付可直接打开的本地预览，当前已重新执行 `npm install` 并启动 Vite dev server；`node_modules` 和 build/dev 生成的 `dist` 可能存在，QA 完成后可按需清理。

## 9. 注意事项

- 不要回滚其他 agent 或用户已有改动。
- 如果需要修改非自己 ownership 文件，先在 handoff 中写明原因。
- P0 只做技术 Spike，不扩展到完整产品实现。
- 本轮未修改 `packages/shared`、`packages/local-manager-mock`、`prototype/*`、`design/*` 源码。
