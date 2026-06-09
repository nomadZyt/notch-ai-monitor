# Main Agent Handoff: Event History / Pending Action Visibility Implementation P2

日期：2026-06-08
阶段：P2 event history / pending action visibility implementation
状态：首个实现切片完成

## 本次目标

按用户指定顺序进入实现切片：

1. 先做 `local-manager-mock` 的 event history / pending action projection store port 和 fake tests。
2. 再接 Local Manager API read-only endpoints。
3. 最后接 Desktop Session Hub History/Pending UI。

## 已完成内容

- shared 增加 event history / pending action projection 类型。
- `ManagerSnapshot` 增加可选 `pendingActions` / `historySummary`，旧 snapshot consumer 兼容。
- `local-manager-mock` 新增：
  - `EventHistoryPersistenceStore`
  - `EventHistoryPersistenceSnapshot`
  - `getEventHistory()`
  - `getPendingActions()`
  - event timeline / history projection
  - pending action projection
- action request/result/completion 已写入 pending action projection。
- event created/status changed/session ended 已写入 timeline。
- P2.4d async completion 会更新 pending action；failed completion 保持 event active 并广播 snapshot。
- Local Manager API 新增只读 endpoints：
  - `GET /v1/event-history`
  - `GET /v1/action-requests`
- Desktop manager client 新增只读 projection 方法：
  - API mode 调 read-only endpoints。
  - mock mode 直接读 Manager projection。
- Session Hub selected session detail 新增：
  - “动作状态”
  - “事件历史”
- 更新合同文档，从 planned contract 改为首个实现切片已落地。

## 修改/新增文件

- 修改 `packages/shared/src/protocol/envelope.ts`
- 修改 `packages/shared/src/protocol/index.ts`
- 修改 `packages/local-manager-mock/src/mock-local-agent-manager.ts`
- 修改 `packages/local-manager-mock/src/index.ts`
- 修改 `packages/local-manager-mock/tests/mock-local-agent-manager.test.mjs`
- 修改 `packages/local-manager-api/src/local-manager-api.ts`
- 修改 `packages/local-manager-api/tests/local-manager-api.test.mjs`
- 修改 `apps/desktop/src/manager-client/types.ts`
- 修改 `apps/desktop/src/manager-client/mock-manager-client.ts`
- 修改 `apps/desktop/src/manager-client/local-manager-api-client.ts`
- 修改 `apps/desktop/src/app/app-shell.ts`
- 修改 `apps/desktop/src/ui/styles/notch.css`
- 修改 `apps/desktop/tests/e2e/p0-smoke.spec.mjs`
- 修改 `apps/desktop/tests/e2e/api-client-smoke.spec.mjs`
- 修改 `docs/contracts/event-history-pending-actions-p2.md`
- 修改 `docs/contracts/local-manager-api.md`
- 修改 `docs/handoffs/main-agent-context-checkpoint-p2.md`
- 新增 `docs/handoffs/main-agent-event-history-pending-actions-implementation-p2.md`

## 关键决策

- History / pending action 是 Manager-owned projection，不是 Desktop-side 状态机。
- Desktop 只通过 `DesktopManagerClient` 读取 projection，不读取 process persistence、action audit、control registry 或 JSON store。
- API endpoints 是 read-only GET，不触发 action side effect。
- CLI adapter 仍不发送 history/pending record；Manager 从现有事件生命周期、action result/replay 和 P2.4d completion 派生 projection。
- `ManagerSnapshot.pendingActions` / `historySummary` 是可选字段，避免破坏旧 snapshot shape。
- History UI 只展示，不给 history item 增加 retry/terminate shortcut。
- 当前 event history persistence 已在 `local-manager-mock` 暴露 store port；Local Manager API JSON persistence 已由后续 `main-agent-event-history-json-persistence-p2.md` 补上。

## 暴露的接口或数据结构

shared projection types：

```ts
interface EventHistoryRecord { ... }
interface EventTimelineEntry { ... }
interface PendingActionRecord { ... }
interface EventHistorySummary { ... }
```

Manager snapshot optional projection：

```ts
interface ManagerSnapshot {
  pendingActions?: PendingActionRecord[];
  historySummary?: EventHistorySummary;
}
```

Local Manager API：

```http
GET /v1/event-history?sessionId=&status=&type=&cursor=&limit=
GET /v1/action-requests?sessionId=&eventId=&status=&cursor=&limit=
```

Desktop manager client：

```ts
getEventHistory?(query): Promise<PaginatedEventHistoryResponse>
getActionRequests?(query): Promise<ActionRequestsResponse>
```

## 测试结果

- `npm run test -w @notch-ai-monitor/local-manager-mock`：27/27 通过。
- `npm run test -w @notch-ai-monitor/local-manager-api`：18/18 通过。
- `npm run build:app -w @notch-ai-monitor/desktop`：通过。
- `npm run test:qa`：11/11 通过。
- `npm run build`：通过。
- `git diff --check`：通过。
- in-app browser API mode：通过。
  - Session Hub 显示“动作状态 / 事件历史”。
  - reject risk 后 pending 显示“已完成 / 拒绝执行”。
  - history 显示“已忽略”。
  - console error 0。

## 未解决问题

- Local Manager API event history JSON persistence file 已由后续切片补上；本 handoff 保留为实现当时的阶段记录。
- Desktop History/Pending 还没有分页 UI；当前取前 40 条 projection，session detail 展示前几条。
- Pending action timeout/heartbeat 策略未定。
- 如 history 更新频率变高，是否新增 `notch.history.updated` SSE 仍未定。
- History retention/archive/clear 产品策略未定。

## 下一位 agent 需要知道的上下文

- 当前最稳下一步：给 Local Manager API 增加 event history JSON persistence store，并保持和 process persistence logical section 分离。
- 另一个稳妥方向：做 Desktop History filters/pagination UI，但仍只读 API projection。
- 不要让 Desktop 直接读取 `ProcessActionAuditRecord`、process persistence file、adapter control endpoint 或 raw token。
- 不要在 history item 上绕过现有 `notch.action.requested` 合同触发 retry/terminate。
- `terminate` 真实实现仍只能 graceful stop，不能因为 pending action 可见而增加 force kill。
