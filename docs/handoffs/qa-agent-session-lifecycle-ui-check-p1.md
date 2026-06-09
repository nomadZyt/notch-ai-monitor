# QA Agent P1 Session Lifecycle UI Check Handoff

日期：2026-06-07  
Agent：UI QA Agent  
阶段：P1 Session Lifecycle UI 旁路 QA  
工作目录：`/Users/zhaiyongtao/vibeCoding/notch-ai-monitor`

## 1. 本次目标

- 在不改实现代码的前提下，梳理 `running` / `completed` / `failed` session lifecycle 的 UI 验收边界。
- 基于现有 desktop app、notch 样式、API-client Playwright smoke 和 Main Agent P1.7 handoff，给下一位 agent 留下最小必要检查清单。
- 本次只允许新增/修改 `docs/handoffs/qa-agent-session-lifecycle-ui-check-p1.md`。

## 2. 已完成内容

- 已阅读 `apps/desktop/src/app/app-shell.ts`：
  - `SESSION_STATE_LABELS` 映射为 `运行中`、`已完成`、`失败` 等中文标签。
  - `renderCapsules()` 使用 `snapshot.counts.activeSessions` 和本地计算的 ended session 数生成 `#sessionHubMeta`。
  - `renderSessionRow()` 对 row 状态有优先级：如果该 session 有 active event，row 显示 `N 待处理`；否则才显示 session state label。
  - `renderActionPanel()` / `renderEventBody()` 会在事件 meta 和 facts 中展示 `sourceModeLabel(session)` 与 `sessionStateBadge(session)`。
- 已阅读 `apps/desktop/src/ui/styles/notch.css`：
  - `.session-state.running` / `.waiting` 使用 teal 系提示活跃。
  - `.session-state.completed` 使用 green 系提示完成。
  - `.session-state.failed` / `.blocked` 使用 red 系提示失败或阻塞。
  - `data-mood="none"` 时左侧 Session Hub capsule 被隐藏且不可点击，因此无 active event 的 running-only snapshot 不适合验“用户可打开 Hub”。
- 已阅读 `apps/desktop/tests/e2e/api-client-smoke.spec.mjs`：
  - 现有测试已覆盖 API client 初始加载、action resolve、API 不可用不白屏。
  - 现有 completed lifecycle smoke 通过 `notch.session.upserted`、`notch.event.created`、`notch.session.ended` 构造 live completed session。
  - 还缺 failed lifecycle 和纯 running/no-event lifecycle 的明确 QA 断言。
- 已阅读 `docs/handoffs/main-agent-interactive-stdio-session-lifecycle-p1.md`：
  - P1.7 新增 `--stdio capture|inherit` 和 `notch.session.ended`。
  - `inherit` 是 session-only 生命周期验证，不产生解析事件；UI-to-stdin 和 PTY attach 仍不在 P1 范围。

## 3. 修改/新增文件

| 文件 | 类型 | 说明 |
| --- | --- | --- |
| `docs/handoffs/qa-agent-session-lifecycle-ui-check-p1.md` | 新增 | 本旁路 QA handoff，仅记录验收建议，不改实现 |

## 4. 关键决策

- UI QA 应优先扩展 `apps/desktop/tests/e2e/api-client-smoke.spec.mjs` 的短 Playwright 场景，而不是运行真实长期 CLI、PTY 或全量长测试。
- Playwright 断言以 DOM text、ARIA、`data-*` 状态和 badge class 为主；截图只作为失败 artifact，不做像素 baseline。
- completed/failed 如果要验 Action panel 中的 lifecycle state，需要同时创建一个 active `result` 或 `error` event；否则右侧 action panel 无事件可打开。
- Session Hub row 的生命周期标签不能和 active event 数混淆：有 active event 时 row status 预期是 `N 待处理`，状态标签应改在 `#alertMeta`、`#eventPanelMeta`、`#eventBody` 的 `State` fact 中验。
- running/no-event 是安静态验收：应验 `#sessionHubMeta`、`#eventCount`、`#rightCapsule` aria-label 和 `#desktop` state/mood；不要强行点击隐藏的 left capsule 作为用户路径。

## 5. 暴露的接口或数据结构

- Protocol events：
  - `notch.session.upserted`：创建或更新 session，P1 UI 从 snapshot 渲染。
  - `notch.event.created`：创建 active event，用于驱动 right capsule 和 Action panel。
  - `notch.session.ended`：payload 为 `{ sessionId, state: "completed" | "failed", exitCode?, reason? }`。
- Session state：
  - `idle`
  - `running`
  - `waiting`
  - `blocked`
  - `completed`
  - `failed`
- ManagerSnapshot counts：
  - `counts.sessions`
  - `counts.activeSessions`，当前只把 `running` / `waiting` 计为活跃。
  - `counts.activeEvents`
- UI selectors worth pinning in tests：
  - `#desktop[data-state][data-mood][data-panel]`
  - `#sessionHubTitle`
  - `#sessionHubMeta`
  - `#eventCount`
  - `#alertTitle`
  - `#alertMeta`
  - `[data-session="<sessionId>"]`
  - `#eventPanelTitle`
  - `#eventPanelMeta`
  - `#eventBody`
  - `.session-state.running`
  - `.session-state.completed`
  - `.session-state.failed`
  - `.source-mode.live`

## 6. UI 应如何验收 session lifecycle

### 6.1 running session

- 数据构造：发送 `notch.session.upserted`，session state 为 `running`，不创建 active event。
- 最小 UI 预期：
  - `#desktop` 为 `data-state="dormant"`，`data-mood="none"`。
  - `#sessionHubTitle` 为 `1 个会话`。
  - `#sessionHubMeta` 为 `1 活跃 · 0 事件`。
  - `#eventCount` 为 `0`。
  - `#alertTitle` 为 `全部安静`，`#alertMeta` 为 `没有待处理事件`。
  - `#rightCapsule` 的 aria-label 为 `没有待处理事件`。
- 注意：当前无 active event 时 left capsule 被样式隐藏，不应把“可点击打开 Session Hub”作为 running-only 用户验收条件。

### 6.2 completed session

- 数据构造：先发送 `notch.session.upserted` state `running`，再创建 `result` event，最后发送 `notch.session.ended` state `completed`、`exitCode: 0`。
- 最小 UI 预期：
  - `#sessionHubMeta` 包含 `0 活跃 · 1 已结束 · 1 事件`。
  - `#alertTitle` 为 `完成`，`#alertMeta` 包含 `真实 · 已完成`。
  - 点击 `#rightCapsule` 后 `#desktop[data-panel="action"]`。
  - `#eventPanelTitle` 展示 result event title。
  - `#eventPanelMeta` 包含 `真实 · 已完成`。
  - `#eventBody` 中 `State` fact 旁能看到 `.session-state.completed` / `已完成`。
- 注意：如果该 completed session 仍有 active result event，Session Hub row 右侧可能显示 `1 待处理`，不应在同一个 row 上硬断言 `已完成`。

### 6.3 failed session

- 数据构造：先发送 `notch.session.upserted` state `running`，再创建 `error` event，最后发送 `notch.session.ended` state `failed`、非 0 `exitCode` 或 `reason`。
- 最小 UI 预期：
  - `#sessionHubMeta` 包含 `0 活跃 · 1 已结束 · 1 事件`。
  - `#alertTitle` 为 `失败`，`#alertMeta` 包含 `真实 · 失败`。
  - `#desktop` 的 `data-mood` 为 `sad`。
  - 点击 `#rightCapsule` 后 `#eventPanelTitle` 展示 error event title。
  - `#eventPanelMeta` 包含 `真实 · 失败`。
  - `#eventBody` 中 `State` fact 旁能看到 `.session-state.failed` / `失败`，并可包含 log excerpt 或 failure summary。

## 7. Playwright 最小必要检查

- 建议只新增或调整 `apps/desktop/tests/e2e/api-client-smoke.spec.mjs` 中的短用例。
- 继续复用当前 helpers：`createTestApi()`、`postEnvelope()`、`openApiDesktopApp()`、固定 `fixedNow`、`page.emulateMedia({ reducedMotion: "reduce" })`。
- 每个 test 使用 `createLocalManagerApi()` 监听 port `0`，结束时 `api.close()`，不要依赖 `127.0.0.1:4317` 的长期服务状态。
- 最小 test 组合：
  - running/no-event：只验 quiet shell、counts 和 capsule meta。
  - completed/result：验 ended counts、right capsule、Action panel meta、State fact。
  - failed/error：验 ended counts、sad mood、right capsule、Action panel meta、State fact。
- 可选补充：
  - 混合 snapshot：一个 running/no-event session 加一个 completed/failed active event session，用于验 Session Hub row 中无 active event 的 running row 显示 `运行中`。
  - 手机 viewport smoke 只需在已有 responsive 覆盖不足时补，不是本 lifecycle P1 的最小必要项。
- 推荐命令：
  - `npm run test:qa -- apps/desktop/tests/e2e/api-client-smoke.spec.mjs`
- 本任务不建议运行：
  - `npm test`
  - `npm run build`
  - `npm run smoke:codex`
  - `npm run smoke:claude`
  - 任何长期 interactive CLI 或 PTY 相关测试

## 8. 测试结果

- 本次未运行 Playwright、npm test、build 或真实 CLI smoke；这是按任务要求避免长测试和实现改动。
- 本次验证方式为只读代码/文档检查，覆盖了：
  - `apps/desktop/src/app/app-shell.ts`
  - `apps/desktop/src/ui/styles/notch.css`
  - `apps/desktop/tests/e2e/api-client-smoke.spec.mjs`
  - `docs/handoffs/main-agent-interactive-stdio-session-lifecycle-p1.md`

## 9. 未解决问题

- 现有 completed lifecycle smoke 中，如果 session 仍有 active event，Session Hub row 可能显示 `1 待处理` 而不是 `已完成`；下一位 agent 应先确认当前实际测试结果，再决定是修测试预期还是改 UI 设计。
- running/no-event 的 Session Hub 入口当前在 UI 上不可点击，这是现有样式/交互边界；如果产品想让用户随时查看全部 sessions，需要 UI agent 另开实现任务。
- failed lifecycle 还没有对应短 Playwright smoke，需要下一位 agent 补充。
- `--stdio inherit` 不生成 parser event；不要把 session-only lifecycle probe 当作 event/action UI 闭环验收。

## 10. 下一位 agent 需要知道的上下文

- 不要并发修改这些文件，除非你就是负责对应实现或测试的 agent：
  - `apps/desktop/src/app/app-shell.ts`
  - `apps/desktop/src/ui/styles/notch.css`
  - `apps/desktop/tests/e2e/api-client-smoke.spec.mjs`
  - `apps/desktop/tests/playwright.config.mjs`
  - `packages/shared/src/models/primitives.ts`
  - `packages/shared/src/protocol/envelope.ts`
  - `packages/local-manager-api/src/local-manager-api.ts`
  - `packages/local-manager-mock/src/mock-local-agent-manager.ts`
  - `docs/handoffs/main-agent-interactive-stdio-session-lifecycle-p1.md`
- 如果只是接着做 UI QA，优先只碰 `apps/desktop/tests/e2e/api-client-smoke.spec.mjs`，并把测试限制在 API-client lifecycle smoke。
- 如果发现 row 文案和 event meta 的状态表达冲突，先记录产品/QA预期，再让 UI agent 改实现；不要在 QA handoff 中直接改 `app-shell.ts`。
- P1 的真实交互 CLI 边界仍是 session lifecycle，不包括 attach 已有终端、读取 shell history、UI 向真实 CLI 注入 stdin 或 PTY 管理。
