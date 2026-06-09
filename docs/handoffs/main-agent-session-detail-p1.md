# Main Agent P1.11 Session Detail Handoff

日期：2026-06-07  
Agent：Main Agent  
阶段：P1.11 Session Detail  
工作目录：`/Users/zhaiyongtao/vibeCoding/notch-ai-monitor`

## 1. 本次目标

- 在继续开发前审查 P1.10 是否存在不合理代码或破坏可扩展性的实现。
- 为 Session Hub 增加 selected session detail，让无 active event 的 session 不再只能触发 toast。
- 保持 UI 与 Manager/API/CLI 协议解耦，不扩展 `ManagerSnapshot` 或 protocol envelope。

## 2. 已完成内容

- 审查 P1.10：
  - `data-has-sessions` 只作为 DOM/CSS 状态，没有污染 shared protocol。
  - 左胶囊可访问策略限定在 `dormant + none + hasSessions`，没有改变 active-event flow。
  - 发现 `selectedSessionId` 可能在 snapshot 变化后保留陈旧 id，已修正。
- UIStore 改进：
  - `reconcileSnapshot()` 会确认 selected session 是否仍存在。
  - 如果旧 id 不存在，会回落到当前 snapshot 的第一个 session。
- Session Hub 新增 `#sessionDetail`：
  - 显示 selected session 的名称、tool mark、active event count。
  - 显示 State、Mode、Source、PID、Started、Last Active、Project、CWD。
  - `windowId` / `tabId` 存在时可自然扩展显示。
- 交互拆分：
  - Session Hub row 点击只更新 detail，保持在 sessions panel。
  - Action panel session tab 继续切换到该 session 的 active event。
- API-client E2E 扩展：
  - running/no-event 场景现在验证 row click 后仍在 Session Hub。
  - 验证 detail 显示 `Codex CLI`、`0 待处理事件`、`运行中`、`真实`、CWD。

## 3. 修改/新增文件

| 文件 | 类型 | 说明 |
| --- | --- | --- |
| `apps/desktop/src/state/ui-store.ts` | 修改 | 修正 stale `selectedSessionId` 回落逻辑 |
| `apps/desktop/src/app/app-shell.ts` | 修改 | 新增 `#sessionDetail`，拆分 Hub/Action session selection，渲染 session facts |
| `apps/desktop/src/ui/styles/notch.css` | 修改 | 新增 compact session detail 样式 |
| `apps/desktop/tests/e2e/api-client-smoke.spec.mjs` | 修改 | 扩展 running/no-event detail E2E |
| `docs/handoffs/main-agent-session-detail-p1.md` | 新增 | 本 handoff |

## 4. 关键决策

- 不新增 `PanelState`，Session detail 作为 `sessions` panel 的内部区域。
- 不新增 Manager/API 字段，detail 只消费已有 `Session` 数据。
- 不在 Session Hub row 点击时自动跳到 Action panel；事件处理入口仍由右侧 Action panel 承担。
- Detail UI 使用紧凑 facts，不做独立大卡片，避免面板层级继续膨胀。

## 5. 暴露的接口或数据结构

- 没有新增生产协议。
- 新增 UI DOM：
  - `#sessionDetail`
- 新增/调整 app 内部方法：
  - `selectHubSession(sessionId)`
  - `selectActionSession(sessionId)`
  - `renderSessionDetail(session, activeCount)`

## 6. 测试结果

- `npm run build:app -w @notch-ai-monitor/desktop`：通过。
- `npx playwright test -c apps/desktop/tests/playwright.config.mjs apps/desktop/tests/e2e/api-client-smoke.spec.mjs`：通过，5/5。
- `npm test`：通过。
- `npm run build`：通过。
- `npm run test:qa`：通过，9/9。
- Browser 手工验收：通过。
  - 使用临时 HTTP fixture server 提供 `GET /v1/snapshot` 与 `GET /v1/events`，未污染全局 `127.0.0.1:4317`。
  - 初始状态：`data-state="dormant"`、`data-mood="none"`、`data-has-sessions="true"`。
  - 点击左胶囊和 running row 后：`data-state="expanded"`、`data-panel="sessions"`。
  - `#sessionDetail` 显示 `Codex CLI`、`0 待处理事件`、`State 运行中`、`Mode 真实`、`PID`、`Project`、`CWD`。

## 7. 未解决问题

- Detail 目前只显示 Session 已有字段；`exitCode`、`ended reason` 尚未进入 Session model。
- Detail 暂无 “查看事件” 或 “Attach/打开终端” 操作，后续需要明确真实 CLI attach 策略。

## 8. 下一位 agent 需要知道的上下文

- P1.11 没有改协议，后续继续接真实 CLI 能复用现有 `Session` 字段。
- 如果要显示 exit code/reason，应先决定是否把 `SessionEndedEnvelope` 的 payload 持久化进 `Session` model。
- 如果要做 attach/PTY，建议另起 Local Manager capability，不要在 `renderSessionDetail()` 里直接绑定进程操作。
