# Main Agent Handoff: P2.5 Productized Session Hub

日期：2026-06-08  
阶段：P2.5  
工作目录：`/Users/zhaiyongtao/vibeCoding/notch-ai-monitor`

## 本次目标

把 Desktop 里已有的基础 sessions panel 产品化成可扫描、可筛选、可进入事件处理的 Session Hub。

边界：

- 不修改 shared model、shared protocol、Local Manager API 或 real CLI adapter。
- Desktop 仍只消费 `ManagerSnapshot` 和 action result。
- 不让 Desktop 调用 `/v1/process/registrations`、读取 process persistence，或直接操作 CLI 进程。
- 不接新的真实 `view-log` / `retry` / `terminate` side effect。

## 已完成内容

- Session Hub 新增 summary rail：会话、活跃、待处理、失败、已结束。
- 新增 Hub filter：全部、待处理、活跃、已结束。
- 新增 Hub sort：优先级、最近、名称。
- Session row 保留原 lifecycle/source/status 信息，并默认按待处理数优先排序。
- Session detail 新增该 session 的 active event 列表。
- 点击 session event 会选择已有 event 并打开 action panel，继续复用原 action request 流程。
- 筛选为空时展示明确空态。
- 窄屏下 Hub summary 和 event row 有响应式约束。

## 修改/新增文件

- `apps/desktop/src/state/ui-store.ts`
- `apps/desktop/src/app/app-shell.ts`
- `apps/desktop/src/ui/styles/notch.css`
- `apps/desktop/tests/e2e/p0-smoke.spec.mjs`
- `apps/desktop/tests/e2e/api-client-smoke.spec.mjs`
- `docs/handoffs/main-agent-context-checkpoint-p2.md`
- `docs/handoffs/main-agent-session-hub-productization-p2.md`

## 关键决策

- P2.5 只做 Desktop 产品化，不扩大 API/协议边界。
- Hub filter/sort 是当前 UI state，不持久化到 Manager 或 localStorage。
- Session event entry 不新增 action；它只是导航到已有 action panel。
- Product Design saved context 为空，因此视觉源采用仓库内 `design/notch-ai-monitor-hifi.*` 和现有 Desktop 实现。
- P2.4d 的 pending action visibility 暂不并入 P2.5；后续如做，需要先定 shared/UI 合同。

## 暴露的接口或数据结构

Desktop UI state 新增：

```ts
type SessionHubFilter = "all" | "attention" | "active" | "ended";
type SessionHubSort = "attention" | "recent" | "name";
```

它们只存在于 `UIStore`，不进入 shared model/API/protocol。

新增 DOM/data hooks：

- `#hubSummary`
- `#sessionFilter [data-hub-filter]`
- `#sessionSort [data-hub-sort]`
- `[data-session-event]`

## 测试结果

- `npm run build:app -w @notch-ai-monitor/desktop`：通过。
- `npm run test:qa`：11/11 通过。
- `git diff --check`：通过。
- CSS 色彩扫描：仍保留 teal/green/blue/red/purple/amber 多状态语义，没有变成单一色系。
- in-app browser API mode：主 API 注入 `all` 场景后，Hub summary、filter/sort、session rows、session event -> action panel 均正常，console error 0。

## 未解决问题

- Session Hub 还没有完整 event history；当前只展示 active events。
- P2.4d 的 pending async action visibility 还没产品化。
- Hub filter/sort 暂不持久化；刷新后回到默认。
- 还没有键盘快捷键或更完整的 Hub command palette。

## 下一位 agent 需要知道的上下文

- 当前浏览器停在 `http://127.0.0.1:5174/` 的 Session Hub 打开状态。
- 主 API `http://127.0.0.1:4317` 当前 snapshot 是 P2.5 browser smoke 注入的 `all` 场景。
- 如果需要回到 quiet 状态，可调用 `POST /v1/debug/reset`。
- 下一步最稳可以做 event history/pending action visibility 合同，也可以进入 P3 packaging/real-world beta 验收。
