# Main Agent P1.8 Session Lifecycle UI Handoff

日期：2026-06-07  
Agent：Main Agent  
阶段：P1.8 Session Lifecycle UI  
工作目录：`/Users/zhaiyongtao/vibeCoding/notch-ai-monitor`

## 1. 本次目标

- 把 P1.7 的 `notch.session.ended` lifecycle 暴露到 Notch UI。
- 让 completed/failed/running session 在 Session Hub、Action panel 和事件 facts 中有清晰状态表达。
- 不改 adapter/API 协议，只消费已有 `ManagerSnapshot.sessions[].state` 和 `counts.activeSessions`。

## 2. 已完成内容

- Desktop UI 新增 session state label/badge：
  - `运行中`
  - `等待中`
  - `已阻塞`
  - `已完成`
  - `失败`
  - `空闲`
- Session Hub meta 支持 ended session 计数：例如 `0 活跃 · 1 已结束 · 1 事件`。
- Action panel meta 增加 session state：例如 `Codex CLI · Terminal · 真实 · 已完成 · 1 分钟前`。
- Event facts 增加 `State` 项，展示 session state badge。
- Session row 现在同时展示 lifecycle state 和 active event count；解决了 QA notes 中提到的 “有 active event 时 row 只显示 N 待处理、看不到 completed state” 的 caveat。
- 新增 API-client Playwright lifecycle smoke：通过 envelope 构造 live completed session + active result event，验证 UI 文案。
- 纳入 QA Agent 旁路 handoff：`docs/handoffs/qa-agent-session-lifecycle-ui-check-p1.md`。

## 3. 修改/新增文件

| 文件 | 类型 | 说明 |
| --- | --- | --- |
| `apps/desktop/src/app/app-shell.ts` | 修改 | 新增 session state helpers；Session Hub、Action panel、event facts 渲染 lifecycle state |
| `apps/desktop/src/ui/styles/notch.css` | 修改 | 新增 `.session-state.*` 和 `.session-event-status` 样式 |
| `apps/desktop/tests/e2e/api-client-smoke.spec.mjs` | 修改 | 新增 completed lifecycle UI smoke |
| `docs/handoffs/qa-agent-session-lifecycle-ui-check-p1.md` | 新增 | QA Agent 旁路验收建议 |
| `docs/handoffs/main-agent-session-lifecycle-ui-p1.md` | 新增 | 本 handoff |

## 4. 关键决策

- UI 不新增协议字段，只读取 `Session.state`。
- Ended session 数由 UI 从 `snapshot.sessions` 计算，不要求 ManagerSnapshot 新增 count 字段。
- Session row 中 active event count 和 lifecycle state 同时显示，避免 “已完成但仍有待处理 result event” 的语义冲突。
- Playwright lifecycle smoke 使用 Local Manager API envelope 构造数据，不启动真实 CLI，保持 UI 测试稳定。

## 5. 暴露的接口或数据结构

- UI helper：
  - `SESSION_STATE_LABELS`
  - `sessionStateLabel(session)`
  - `sessionStateBadge(session)`
- CSS classes：
  - `.session-state.running`
  - `.session-state.waiting`
  - `.session-state.completed`
  - `.session-state.failed`
  - `.session-state.blocked`
  - `.session-event-status`
- Test fixture helper：
  - `session(id?)` in `api-client-smoke.spec.mjs`

## 6. 测试结果

- `npm run build:app -w @notch-ai-monitor/desktop`：通过。
- `npx playwright test -c apps/desktop/tests/playwright.config.mjs apps/desktop/tests/e2e/api-client-smoke.spec.mjs`：通过，3/3。
- `npm test`：通过。
- `npm run build`：通过。
- `npm run test:qa`：通过，7/7。
- Browser 验收：通过。
  - 折叠态显示 `Codex CLI 完成，1 项待处理`。
  - Action panel 显示 `Codex CLI · Terminal · 真实 · 已完成`。
  - Event facts 显示 `State` 和 `已完成`。
  - Session Hub row 显示 `Terminal · 真实 · cli-adapter-real`、`已完成`、`1 待处理`。

## 7. 未解决问题

- Failed lifecycle UI 还没有独立 E2E；QA handoff 已列出建议场景。
- Running/no-event session 的左侧 Session Hub 仍在 quiet state 下隐藏；如果产品希望随时查看全部 sessions，需要单独做交互设计。
- UI 暂不显示 session exit code、signal 或 ended reason。

## 8. 下一位 agent 需要知道的上下文

- 当前页面保留了 `npm run smoke:notch-run` 产生的 active result event，session state 是 `completed`。
- 下一步最自然可以是补 `failed` lifecycle UI smoke，或进入 Session Hub UX 改进：无 active event 时也允许查看 historical/completed sessions。
- 不要把 UI lifecycle 展示和真实 CLI stdin/PTY attach 混在一个任务里。
