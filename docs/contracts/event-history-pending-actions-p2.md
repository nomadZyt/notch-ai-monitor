# Notch AI Monitor P2 Event History / Pending Action Visibility Contract

日期：2026-06-08
阶段：P2 post-Session-Hub implementation slice
状态：Manager projection / API read-only endpoints / Desktop visibility 已完成首个实现切片

## 1. 目标

P2.5 已把 Session Hub 做成可扫描、可筛选、可进入 active event 处理的产品面。下一步需要完整定义：

- event 从 active 退出后如何进入历史。
- history 如何查询、分页、过滤、持久化和展示。
- action 从 `needs_confirmation` / `accepted` 到异步 `completed` / `failed` 的过程如何对 Desktop 可见。
- pending action visibility 如何复用 P2.4d 的 completion，但不泄漏 process supervisor / audit 私有结构。

核心原则：

- Manager 是唯一事实源。
- Desktop 只读 Manager 提供的 projection，不读 JSON persistence、不读 process audit、不直接操作 CLI 进程。
- EventQueue/StateMachine 仍只负责 active queue 和 view hints；history 是另一个 projection，不反向影响 active queue 排序。
- `terminate` 仍只能 graceful stop；pending action visibility 不等于新增控制能力。

## 2. 非目标

本合同不做：

- 不在本轮实现 runtime。
- 不修改 shared model/API/protocol/EventQueue/StateMachine/real CLI adapter。
- 不让 Desktop 调用 `/v1/process/registrations`。
- 不让 Desktop 读取 process persistence store 或 process action audit。
- 不新增 force kill、retry arbitrary command、terminal attach、PTY control。
- 不把 adapter/supervisor 内部 token、raw control endpoint、raw persistence path 暴露给 UI。

## 3. 当前事实

现有稳定事实：

- `NotchEvent.status` 当前为 `active | resolved | ignored | expired`。
- `ManagerSnapshot.events` 当前包含事件数组，里面可以有非 active 事件，但没有分页/查询/历史 timeline 合同。
- `ManagerSnapshot.activeEventIds` 与 `currentEventId` 仍是 active queue 的真值。
- `ActionResultPayload.status` 当前为 `accepted | completed | failed | rejected | noop | needs_confirmation`。
- P2.4d 已有 Manager 内部 `completeAcceptedProcessAction(...)`，可以把 accepted process action 更新为 completed/failed，并写入 process audit/replay。
- P2.5 Session Hub 当前只展示 active events，不展示完整 history 或 pending action 状态。

## 4. 概念边界

### 4.1 Active Queue

Active queue 是用户当前需要处理的事件队列：

- 来源：`ManagerSnapshot.activeEventIds`。
- 排序：继续使用 EventQueue priority/time 规则。
- 用途：notch mood、alert capsule、action panel 当前事件。
- 只包含 `status: "active"` 的事件。

### 4.2 Event History

Event history 是所有事件的可审计历史投影：

- 包含 active、resolved、ignored、expired。
- 支持按 session/type/status/time/action outcome 查询。
- 用于 Session Hub 历史、复盘、失败排查、产品化审计。
- 不影响 active queue 的排序和 mood。

### 4.3 Pending Action

Pending action 是 action request 的可见状态投影：

- `needs_confirmation`：等待用户二次确认。
- `accepted`：Manager/adapter/supervisor 已接受，正在等待后续完成信号。
- `completed`：动作完成，可能已 resolve event。
- `failed`：动作执行或控制通道失败，event 通常保持 active。
- `rejected`：前置校验未通过，没有执行真实 side effect。
- `noop`：只读或展示类动作已完成展示，不改变 event。

Pending action visibility 只说明状态，不给 Desktop 新控制面。

## 5. 推荐数据结构

以下数据结构已作为 shared projection shape 的首个实现落地；字段仍保持展示投影，不代表 Desktop 可以读取内部 audit/store。

### 5.1 EventHistoryRecord

```ts
interface EventHistoryRecord {
  historyId: string;
  eventId: string;
  sessionId: string;
  type: "risk" | "confirm" | "result" | "error";
  status: "active" | "resolved" | "ignored" | "expired";
  title: string;
  summary: string;
  priority: number;
  source: string;
  createdAt: ISODateTimeString;
  updatedAt?: ISODateTimeString;
  resolvedAt?: ISODateTimeString;
  resolution?: string;
  commandHash?: string;
  errorKey?: string;
  occurrenceCount?: number;
  eventSnapshot: NotchEvent;
  latestAction?: {
    requestId: string;
    actionId: string;
    status: ActionResultStatus;
    message: string;
    updatedAt: ISODateTimeString;
  };
}
```

规则：

- `historyId` 必须稳定，可用 `eventId` 或 `eventId:version`。
- `eventSnapshot` 是展示用事件快照；敏感字段如未来需要脱敏，应由 Manager 生成脱敏 projection。
- `latestAction` 是展示摘要，不替代完整 action timeline。

### 5.2 EventTimelineEntry

```ts
type EventTimelineKind =
  | "event_created"
  | "event_updated"
  | "event_deduped"
  | "event_status_changed"
  | "action_requested"
  | "action_result"
  | "action_completed_async"
  | "session_state_changed";

interface EventTimelineEntry {
  id: string;
  eventId: string;
  sessionId: string;
  kind: EventTimelineKind;
  at: ISODateTimeString;
  source: "cli" | "manager" | "ui" | "debug";
  title: string;
  message: string;
  requestId?: string;
  actionId?: string;
  fromStatus?: EventStatus | ActionResultStatus | Session["state"];
  toStatus?: EventStatus | ActionResultStatus | Session["state"];
  errorCode?: string;
  target?: string;
}
```

规则：

- Timeline 是 append-only。
- `event_status_changed` 用于 active -> resolved/ignored/expired。
- `action_completed_async` 用于 P2.4d 后续 completion。
- `target` 必须是安全展示 target，不得包含 raw control token。

### 5.3 PendingActionRecord

```ts
type PendingActionVisibilityStatus =
  | "waiting_confirmation"
  | "queued"
  | "in_progress"
  | "completed"
  | "failed"
  | "rejected"
  | "noop"
  | "expired";

interface PendingActionRecord {
  requestId: string;
  eventId: string;
  sessionId: string;
  actionId: string;
  label: string;
  status: PendingActionVisibilityStatus;
  resultStatus: ActionResultStatus;
  message: string;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
  completedAt?: ISODateTimeString;
  expiresAt?: ISODateTimeString;
  source: "desktop-ui" | "api" | "smoke";
  mocked: boolean;
  resolution?: string;
  errorCode?: string;
  errorMessage?: string;
  targetSummary?: string;
  requiresConfirmation?: boolean;
}
```

Mapping:

| Action result | Visibility status | Event behavior |
| --- | --- | --- |
| `needs_confirmation` | `waiting_confirmation` | event stays active |
| `accepted` | `in_progress` | event stays active until completion |
| `completed` | `completed` | may resolve event |
| `failed` | `failed` | event usually stays active |
| `rejected` | `rejected` | event stays active |
| `noop` | `noop` | event stays active unless action explicitly resolves |

规则：

- Same `requestId` replay must return latest visible action record.
- A failed async completion replaces the prior `accepted` visibility for that `requestId`.
- A later non-`waiting_confirmation` result for the same `eventId + actionId` supersedes older `waiting_confirmation` projection rows with different requestIds. Timeline/audit can keep both facts, but Desktop pending visibility should show only the latest actionable state.
- Multiple requestIds for the same event/action should be grouped in UI; implementation should later decide whether to block concurrent duplicates.

## 6. API / Protocol Boundary

### 6.1 Contract-stage posture

首个实现切片已接入 API read-only endpoints 和 snapshot optional projection。

### 6.2 Future minimal boundary

后续扩展仍优先选择 Manager-owned read-only projection，而不是让 Desktop 读私有 store。

已落地的最小扩展：

```ts
interface ManagerSnapshot {
  // existing fields...
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

已新增 read-only API：

```http
GET /v1/event-history?sessionId=&status=&type=&cursor=&limit=
GET /v1/action-requests?sessionId=&eventId=&status=&cursor=&limit=
```

响应必须是 Manager projection：

```ts
interface PaginatedEventHistoryResponse {
  ok: true;
  history: EventHistoryRecord[];
  timeline?: EventTimelineEntry[];
  nextCursor: string | null;
  snapshot: ManagerSnapshot;
}
```

```ts
interface ActionRequestsResponse {
  ok: true;
  actions: PendingActionRecord[];
  nextCursor: string | null;
  snapshot: ManagerSnapshot;
}
```

SSE：

- 第一阶段可继续只推 `notch.snapshot.updated`。
- Internal scheduler / SSE update 设计见 `docs/contracts/internal-scheduler-sse-p2.md`。
- 当前 scheduler runtime 继续复用 `notch.snapshot.updated`；如果后续 history 更新频率太高，再新增 `notch.history.updated`，但必须先写协议扩展并把它作为 refresh hint，而不是事实源。

### 6.3 CLI adapter boundary

CLI adapter 仍只发送：

- `notch.session.upserted`
- `notch.session.ended`
- `notch.event.created`

CLI adapter 不发送 history record，不发送 pending action record。它们由 Manager 派生。

## 7. Persistence Contract

Event history persistence 应该与 process side-effect persistence 分层：

- `ProcessPersistenceStore` 继续保存 process ownership、launch profile、risk replay、process action audit。
- `EventHistoryPersistenceStore` 保存 event history/timeline/pending action projection。
- Local Manager API 已提供可选 `JsonFileEventHistoryPersistenceStore`。
- 当前启动入口为 `NOTCH_EVENT_HISTORY_PERSISTENCE_FILE` 或 `--event-history-persistence-file`。
- 可以共用同一个 JSON 文件实现，但 contract 上应是不同 logical sections；当前实现使用独立 `eventHistory` section。

推荐 snapshot：

```ts
interface EventHistoryPersistenceSnapshot {
  events: EventHistoryRecord[];
  timeline: EventTimelineEntry[];
  pendingActions: PendingActionRecord[];
  cursorVersion: number;
}
```

规则：

- 写入 append-only timeline，再更新 projection。
- reset debug endpoint 可以清空 history，但正式产品后应提供 dev-only reset 与 user-visible archive/clear 区分。
- 大文件需要分页和 compaction，不能让 Desktop 一次加载无限历史。

## 8. UI Contract

Session Hub 后续应增加：

- Active / History segmented view。
- Session detail 中显示 active events + recent history。
- Pending action strip，显示 `处理中`、`等待确认`、`失败`、`已完成`。
- History filter：session、type、status、action outcome。
- Failed action 可见，但不自动重试；仍需用户重新触发 action。

文案建议：

| Visibility | 中文显示 |
| --- | --- |
| `waiting_confirmation` | 等待确认 |
| `in_progress` | 正在处理 |
| `completed` | 已完成 |
| `failed` | 处理失败 |
| `rejected` | 已拒绝 |
| `noop` | 已查看 |
| `expired` | 已过期 |

UI 禁止：

- 不显示 raw supervisor token。
- 不显示 raw adapter control endpoint。
- 不把 PID 作为主要操作目标。
- 不在 history item 上添加真实 terminate/retry shortcut，除非走现有 action request contract。

## 9. State Transitions

### 9.1 Event lifecycle

```text
event_created -> active
active -> resolved
active -> ignored
active -> expired
resolved/ignored/expired -> history-only
```

历史记录保留所有状态变化。只有 active 事件进入 EventQueue priority。

### 9.2 Pending action lifecycle

```text
action_requested
  -> needs_confirmation -> waiting_confirmation
  -> accepted -> in_progress -> completed
  -> accepted -> in_progress -> failed
  -> accepted -> in_progress -> expired
  -> rejected
  -> noop
```

Timeout：

- `accepted` action 当前由 Manager 写入 `expiresAt`，默认 timeout 为 5 分钟。
- Local Manager API 已支持 dev/test-only timeout override：`pendingActionTimeoutMs`、`NOTCH_PENDING_ACTION_TIMEOUT_MS`、`--pending-action-timeout-ms`。该 override 只改变 deadline，不新增 Desktop 控制能力，也不触发 retry/terminate side effect。
- `heartbeatPendingAction(requestId)` 只延长同一 in-progress action 的 deadline，不 resolve event，不触发新的 side effect。
- `expirePendingActions()` 是显式 sweep；过期后 visibility status 变为 `expired`，同 `requestId` replay result 变为 `failed`，并记录 `pending_action_timeout`。
- timeout 不自动 resolve event；event 保持 active，除非 Manager 之后收到未过期且可信的 completion。
- expired 后的 late completion 不覆盖 terminal replay result，不因为迟到 completion 反向 resolve event。
- Local Manager API 已提供 debug-only `POST /v1/debug/expire-pending-actions` 触发显式 sweep，便于 API mode QA；它不是产品 action endpoint，不允许 Desktop 用它控制进程。
- Internal scheduler runtime 已完成：作为 Local Manager API opt-in timer，只调用同一个 Manager `expirePendingActions()`，不新增 process side effect。

## 10. Security / Privacy

- History projection 可以包含 commands 和 evidence，但 Manager 应保留未来脱敏点。
- Pending action projection 只暴露安全 target summary。
- Audit record 是内部证据；Desktop 只能看 projection。
- Persistence file path 不暴露给 Desktop。
- Control token、raw bearer、supervisor token hash 不在 UI projection 中出现。

## 11. Implementation Order

当前已完成：

- `local-manager-mock` event history / pending action projection store port。
- Local Manager API 可选 JSON event history persistence store。
- action request/result/completion 写入 pending action projection。
- event created/status changes/session ended 写入 timeline。
- Local Manager API read-only `GET /v1/event-history` 与 `GET /v1/action-requests`。
- Desktop Session Hub 显示 Pending / History 只读区块。
- Desktop Session Hub History 已支持按 status/type 筛选和 cursor pagination。
- `local-manager-mock` 已支持 pending action timeout/heartbeat 最小 runtime：`expiresAt`、`heartbeatPendingAction()`、`expirePendingActions()`。
- Local Manager API 已支持 debug-only timeout sweep endpoint：`POST /v1/debug/expire-pending-actions`。
- Local Manager API 已支持 opt-in internal scheduler：`pendingActionSweepIntervalMs`、`NOTCH_PENDING_ACTION_SWEEP_INTERVAL_MS`、`--pending-action-sweep-interval-ms`。
- Local Manager API 已支持 dev/test pending action timeout override：`pendingActionTimeoutMs`、`NOTCH_PENDING_ACTION_TIMEOUT_MS`、`--pending-action-timeout-ms`。
- Manager pending projection 已支持 confirmation supersede：confirmed action 后不再同时展示旧 `waiting_confirmation`。
- Internal scheduler / SSE update 合同与首轮 runtime 已完成：`docs/contracts/internal-scheduler-sse-p2.md`。

后续建议实现顺序：

1. 完成 API mode Browser auto-expire smoke，确认 Session Hub 从“正在处理”自动更新为“已过期”。
2. 先复用 `notch.snapshot.updated`；如 snapshot 频率不足，再实现 `notch.history.updated` refresh hint。
3. QA 继续覆盖 accepted -> completed/failed/expired、history filter edge cases 和 mobile overflow。

## 12. Acceptance Criteria

合同进入实现前，至少需要测试：

- resolved event 出现在 history，不再出现在 active queue。
- ignored/expired event 出现在 history。
- history 可按 session/status/type 查询。
- pending terminate accepted 后 UI 能看到 `正在处理`。
- P2.4d successful completion 后 pending action 变成 `已完成`，event resolved。
- P2.4d failed completion 后 pending action 变成 `处理失败`，event 保持 active。
- accepted action timeout 后 pending action 变成 `已过期`，event 保持 active，同 requestId replay 返回 failed。
- heartbeat 延长 deadline，原 deadline sweep 不应误过期 action。
- 同 requestId replay 不生成重复 pending action。
- confirmed action 不应和同 event/action 的旧 waiting confirmation 同时出现在 pending visibility。
- Desktop 不读取 process persistence 或 audit 私有字段。
- Browser QA 中 pending/history UI 在 390px 和 760px 不溢出。

## 13. Open Questions

- History retention 默认保留多久：无限、本地最近 N 条，还是按项目归档。
- 是否需要按 project/cwd 聚合 history。
- Pending action timeout 当前默认由 Manager 定为 5 分钟；Local Manager API dev/test 可显式覆盖 timeout 以便 QA。产品化时是否按 action kind/adapter 调整仍未定。
- async action-result 第一阶段继续依赖 snapshot projection；是否需要独立 `notch.history.updated` refresh hint 仍待高频场景验证。
- 历史清除是 dev-only reset，还是需要用户可见 archive/delete。
