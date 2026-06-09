# Main Agent Handoff: Event History / Pending Action Visibility Contract P2

日期：2026-06-08
阶段：P2 post-Session-Hub contract
状态：合同设计完成，runtime 尚未实现

## 本次目标

为 P2.5 之后的产品化 Session Hub 补齐完整 `event history` 与 `pending action visibility` 合同。目标是让后续实现能安全展示历史事件、动作等待确认、处理中、完成和失败状态，同时保持 Desktop 与 Manager/adapter/process 业务逻辑解耦。

## 已完成内容

- 新增完整合同 `docs/contracts/event-history-pending-actions-p2.md`。
- 明确三层边界：
  - Active Queue：仍由 `ManagerSnapshot.activeEventIds` / `currentEventId` 驱动。
  - Event History：Manager-owned read-only 历史投影，不影响 active queue 排序。
  - Pending Action：Manager-owned action request/result/completion 可见投影，不提供新控制能力。
- 定义推荐数据结构：
  - `EventHistoryRecord`
  - `EventTimelineEntry`
  - `PendingActionRecord`
- 定义后续最小 API：
  - `GET /v1/event-history`
  - `GET /v1/action-requests`
  - `ManagerSnapshot.pendingActions?`
  - `ManagerSnapshot.historySummary?`
- 在 Local Manager API 合同中补充 planned read-only endpoint 和 snapshot projection 边界。
- 在 retry/terminate 合同中补充 P2.4d async completion 到 pending action visibility 的映射。
- 更新 P2 checkpoint，记录本小节开始、复核、设计和接线状态。

## 修改/新增文件

- 新增 `docs/contracts/event-history-pending-actions-p2.md`
- 修改 `docs/contracts/local-manager-api.md`
- 修改 `docs/contracts/retry-terminate-p2.md`
- 修改 `docs/handoffs/main-agent-context-checkpoint-p2.md`
- 新增 `docs/handoffs/main-agent-event-history-pending-actions-contract-p2.md`

## 关键决策

- 本轮只做合同，不实现 runtime。
- 不修改 shared model/API/protocol/EventQueue/StateMachine/real CLI adapter。
- Desktop 不读取 process persistence、action audit、control registry、raw adapter token 或 JSON store。
- CLI adapter 不发送 history record 或 pending action record；这些记录必须由 Manager 从 event lifecycle、action result/replay、P2.4d completion 和内部 audit 派生。
- Event history 与 pending action 可以复用同一个物理 JSON 文件实现，但合同上必须与 P2.3 process persistence 分成不同 logical sections。
- `accepted` action 对 UI 映射为 `in_progress`，只有可信 completion 才能变成 `completed` 或 `failed`。
- `terminate` 仍只能 graceful stop；pending action visibility 不等于新增 force kill、retry shortcut 或 process control 权限。

## 暴露的接口或数据结构

合同建议的 future shape：

```ts
interface ManagerSnapshot {
  pendingActions?: PendingActionRecord[];
  historySummary?: {
    totalEvents: number;
    resolvedEvents: number;
    ignoredEvents: number;
    expiredEvents: number;
    failedActions: number;
    inProgressActions: number;
  };
}
```

```http
GET /v1/event-history?sessionId=&status=&type=&cursor=&limit=
GET /v1/action-requests?sessionId=&eventId=&status=&cursor=&limit=
```

这些接口是 planned contract，当前 runtime 尚未实现。

## 测试结果

- `git diff --check`：通过。
- 触碰文档行尾空白检查：通过。
- 未运行 runtime build/test/Browser QA，因为本轮只修改合同与 handoff 文档，没有改 TypeScript runtime、Desktop UI 或 API handler。

## 未解决问题

- History retention 默认策略未定：无限、本地最近 N 条，还是按 project/cwd 归档。
- Pending action timeout/heartbeat 策略未定。
- 是否需要独立 SSE `notch.history.updated` 未定；当前建议第一阶段继续依赖 snapshot update。
- 历史清除应是 dev-only reset、用户可见 archive，还是两者都需要，未定。
- full implementation 需要决定 event history store 是否和 process persistence 共用同一个 JSON 文件。

## 下一位 agent 需要知道的上下文

- 最稳实现顺序：
  1. 在 `local-manager-mock` 增加 event history / pending action store port 与 fake tests。
  2. 将 action request/result/completion 写入 pending action projection。
  3. 将 event created/status changes/session ended 写入 timeline。
  4. 在 `local-manager-api` 增加可选 JSON store 与 read-only endpoints。
  5. 扩展 shared `ManagerSnapshot` 可选字段或新增 API response types。
  6. Desktop Session Hub 增加 History / Pending UI。
  7. QA 覆盖 mock mode、API mode、pagination/filter、accepted -> completed/failed。
- 不要让 Desktop 直接读取 `ProcessActionAuditRecord`、process persistence file 或 adapter control registry。
- 不要让 history item 绕过现有 action request contract 触发 retry/terminate。
- P2.4d 已经提供 async action completion 的 Manager/API 内部基础，pending action visibility 应复用它，而不是另建 Desktop-side 状态机。
