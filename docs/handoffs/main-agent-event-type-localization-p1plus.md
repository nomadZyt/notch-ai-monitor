# Main Agent Handoff: P1+.3 Event Type Localization

日期：2026-06-08  
Agent：Main Agent  
阶段：P1+.3

## 本次目标

将 UI 中展示给用户的 event type/value 从 protocol raw values 本地化为中文，例如：

- `risk` -> `风险`
- `confirm` -> `确认`
- `result` -> `结果`
- `error` -> `错误`

本轮只改 Desktop 展示层，不修改 shared model、API、protocol、EventQueue/StateMachine 或 real CLI adapter。

## 已完成内容

- 将 Desktop event type meta 的展示文案改为中文：
  - action panel eyebrow `Risk` / `Confirm` / `Done` / `Error` 改为 `风险` / `确认` / `结果` / `错误`
  - capsule alert title 中 `result` 类事件从 `完成` 调整为 `结果`
  - capsule alert title 中 `error` 类事件从 `失败` 调整为 `错误`
- 将 action panel `severityChip` 从 raw `event.type` 改为中文 event type label。
- 将 Event facts 中 `类型` 的值从 raw `event.type` 改为中文 event type label。
- 将 `severityChip` 中可能出现的 risk level raw value 本地化：
  - `low` -> `低`
  - `medium` -> `中`
  - `high` -> `高`
  - `critical` -> `严重`
- 更新 Desktop QA，覆盖 mock active event 和 API mode active event：
  - event kind 显示中文。
  - severity chip 不再显示 raw event type。
  - Event facts `类型` 值显示 `结果` / `错误`。

## 修改/新增文件

- 修改 `apps/desktop/src/state/selectors.ts`
- 修改 `apps/desktop/src/app/app-shell.ts`
- 修改 `apps/desktop/tests/e2e/p0-smoke.spec.mjs`
- 修改 `apps/desktop/tests/e2e/api-client-smoke.spec.mjs`
- 修改 `docs/handoffs/main-agent-context-checkpoint-p1.md`
- 新增 `docs/handoffs/main-agent-event-type-localization-p1plus.md`

## 关键决策

- 保留 raw event type 作为协议和分支判断值，只在 UI 渲染时映射中文。
- `EVENT_TYPE_META` 仍位于 Desktop state selector 层，因为它本来就是 UI view metadata，不属于 shared protocol。
- `severityChip` 使用中文 type label；risk level 也只做展示层映射，不改变 `Evidence.riskLevel`。
- 没有接入真实 `view-log` / `retry` / `terminate` side effect。

## 暴露的接口或数据结构

没有新增 API、protocol 或持久化字段。

展示层新增 helper：

- `formatRiskLevel(riskLevel: RiskLevel): string`

展示层 meta 语义更新：

- `EVENT_TYPE_META[event.type].label` 和 `.short` 现在都是中文用户可读文案。

## 测试结果

通过：

- `npm run build:app -w @notch-ai-monitor/desktop`
- `npm run test:qa`（9/9）
- `curl http://127.0.0.1:4317/health`
- `curl http://127.0.0.1:4317/v1/snapshot`
- in-app browser API mode 验证：
  - 当前 snapshot 仍是 quiet：`data-state=dormant`，`data-mood=none`，`eventCount=0`，`alertTitle=全部安静`
  - Session Hub row：`Terminal · 真实接入 · cli-adapter-real · 运行失败`
  - Session Detail：`退出码 进程退出码 7`，`结束原因 进程以退出码 7 结束`
  - browser console error：0

补充说明：

- in-app browser 首次打开 `127.0.0.1` tab 时页面崩溃；随后用新的 `localhost` tab 成功完成 API mode 验证。
- 当前真实 API snapshot 没有 active event，所以 event type 中文展示由 Playwright QA 的 active-event 场景覆盖。

当前服务仍在：

- Local Manager API：`http://127.0.0.1:4317`
- Desktop Vite：`http://127.0.0.1:5174`

## 未解决问题

- 当前真实 API snapshot 是 quiet，没有 active event 可在真实页面中直接查看 event type chip。
- Evidence grid 的 `Reason` / `Impact` / `Origin` / `Rollback` / `Log` 标签仍是英文，未纳入本轮范围。
- `view-log` / `retry` / `terminate` 的真实 side effect 仍未实现。
- `AGENTS.md` 文件在工作目录下未找到；本轮按用户消息中提供的 AGENTS 指令执行。

## 下一位 agent 需要知道的上下文

- P1+.3 是纯展示层改动，所有协议 raw values 仍保留在 model/API/snapshot 中。
- 如果继续 P1+，下一个自然任务可以是 Evidence grid 标签本地化，或偏好/持久化、可访问性回归。
- 如果进入 P2.1，仍应先设计真实 `view-log` 的安全文件打开合同，再考虑 `retry` / `terminate` 的真实进程 side effects。
