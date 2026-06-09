# P2 Internal Scheduler / SSE Update Contract

日期：2026-06-08
阶段：P2 history / pending action visibility
适用包：`@notch-ai-monitor/local-manager-api`、`@notch-ai-monitor/local-manager-mock`、`@notch-ai-monitor/desktop`

## 1. 目标

为 pending action timeout 提供无人值守的内部 sweep 设计，并明确 SSE 更新策略。该合同承接已完成的 Manager `expirePendingActions()` 和 debug-only `POST /v1/debug/expire-pending-actions`。

当前首轮 runtime 已在 Local Manager API 中实现：默认关闭，显式配置后启用 scheduler timer；SSE 仍复用 `notch.snapshot.updated`。

## 2. 非目标

- 不新增 retry / terminate 真实 side effect。
- 不让 Desktop 直接操作 process、PID、PTY、control endpoint、raw token 或 persistence file。
- 不让 scheduler 读取 process persistence、control registry 或 action audit 私有结构。
- 不修改 CLI adapter protocol；adapter 仍不发送 history/pending projection。
- 不把 timeout 当作 event resolution；timeout 后 event 仍保持 active。

## 3. 设计决策

第一阶段采用 opt-in Local Manager API internal scheduler：

- scheduler 默认关闭，避免开发和测试启动时出现隐藏后台状态变化。
- 启用后只调用 `manager.expirePendingActions({ at: clock() })`。
- `expirePendingActions()` 返回空数组时不广播、不持久化、不写 audit。
- `expirePendingActions()` 返回 expired actions 时由 Manager 自己写 pending projection、timeline、replay result、process audit，并触发 snapshot emission。
- SSE 第一阶段继续复用 `notch.snapshot.updated`，因为 snapshot 已包含 `pendingActions` 和 `historySummary`。
- 只有当 history/pending 更新频率或分页刷新成本证明 snapshot 不够时，再新增 `notch.history.updated`。

## 4. Scheduler Contract

### 4.1 配置

已实现最小 API option：

```ts
interface LocalManagerApiOptions {
  pendingActionSweepIntervalMs?: number | null;
  pendingActionTimeoutMs?: number | null;
}
```

已实现启动入口：

```sh
NOTCH_PENDING_ACTION_SWEEP_INTERVAL_MS=30000 \
  npm run serve -w @notch-ai-monitor/local-manager-api

npx notch-local-manager-api \
  --pending-action-sweep-interval-ms 30000
```

Dev/test timeout override 可与 scheduler 一起使用，让 timeout smoke 不必等待默认 5 分钟：

```sh
NOTCH_PENDING_ACTION_TIMEOUT_MS=1200 \
NOTCH_PENDING_ACTION_SWEEP_INTERVAL_MS=200 \
  npm run serve -w @notch-ai-monitor/local-manager-api

npx notch-local-manager-api \
  --pending-action-timeout-ms 1200 \
  --pending-action-sweep-interval-ms 200
```

语义：

- `undefined` / `null` / `0`：关闭 scheduler。
- `> 0`：开启 scheduler。
- env/CLI 参数必须是非负整数毫秒值；API option 必须是非负有限 number。
- beta 推荐值为 `30000` ms；本地 QA 和 tests 可用更短 interval，例如 `20..250` ms。
- `pendingActionTimeoutMs` 只改变 Manager 写入 `expiresAt` 的 deadline，默认仍是 5 分钟；它不让 scheduler 调用 supervisor 或任何 process side effect。

### 4.2 Tick 行为

每次 tick：

```ts
const expiredActions = manager.expirePendingActions({ at: clock() });
```

规则：

- tick 不调用 `retry`。
- tick 不调用 `terminate`。
- tick 不调用 `ProcessSupervisor`。
- tick 不按 PID 操作进程。
- tick 不读取或发送 raw control token。
- tick 不 resolve event。
- tick 不生成新的 action request。
- tick 不改变已 terminal 的 pending action。

`expirePendingActions()` 已经负责：

- `in_progress -> expired`
- replay result `accepted -> failed`
- `error.code = "pending_action_timeout"`
- timeline `pending_action_timeout`
- event 保持 `active`
- late completion 不覆盖 terminal timeout result

### 4.3 启动与恢复

启用 scheduler 后，Local Manager API 应在 Manager hydrate 后启动 timer。

当前实现：

- server listen 完成后运行一次 startup sweep。
- startup sweep 使用当前 `clock()`，用于恢复 API 离线期间已超过 `expiresAt` 的 pending action。
- startup sweep 如无 expired actions，不广播 snapshot。
- 后续按 interval 运行。

如果启用了 `eventHistoryPersistenceFile`：

- stale `in_progress` pending action 会先从 `EventHistoryPersistenceStore` hydrate。
- startup sweep 可以把它们转成 `expired` 并重新持久化。
- process persistence 只在 `expirePendingActions()` 需要追加 process failed audit 时由 Manager 写入；scheduler 不直接接触 process persistence。

### 4.4 关闭

`LocalManagerApiServer.close()` 必须清理 scheduler timer：

- 先停止 interval/timeout。
- 再关闭 SSE clients 和 HTTP server。
- API tests 不应因为 scheduler 留下 active handle。

### 4.5 并发与竞态

Node runtime 是单线程事件循环，但 completion 和 sweep 仍可能相邻发生：

- completion 先到：pending action 已变 `completed/failed`，sweep 不应再过期。
- sweep 先到：pending action 已变 `expired`，late completion 不应覆盖 replay result 或 resolve event。
- 同一 `requestId` 不能产生重复 pending action。
- 同一 expired action 不能重复追加 timeout timeline/audit。

## 5. SSE Update Contract

### 5.1 第一阶段：继续使用 snapshot SSE

当前 SSE：

```text
event: notch.snapshot.updated
data: {"event":"notch.snapshot.updated","payload":{"snapshot":{...}}}
```

第一阶段保持不变：

- scheduler 通过 Manager `emitSnapshot()` 间接触发 `notch.snapshot.updated`。
- `payload.snapshot.pendingActions` 是最新 pending projection。
- `payload.snapshot.historySummary` 是最新 summary。
- Desktop 收到 snapshot 后，仍以 snapshot 为事实源。
- Desktop 如当前打开 Session Hub detail，可按现有逻辑重新读取 `GET /v1/action-requests` / `GET /v1/event-history` 的 selected-session page。

### 5.2 可选第二阶段：`notch.history.updated`

只有满足以下条件之一才新增：

- snapshot payload 过大，频繁 timeout/completion 让 SSE 成本明显上升。
- Desktop 需要只刷新 selected session 的 history/pending page。
- 后续产品需要 background notification，但不希望替换完整 snapshot。

推荐 future envelope：

```ts
type HistoryUpdatedEnvelope = ProtocolEnvelope<
  "notch.history.updated",
  {
    reason:
      | "pending_action_expired"
      | "pending_action_completed"
      | "pending_action_failed"
      | "event_history_changed";
    affectedEventIds: string[];
    affectedSessionIds: string[];
    affectedRequestIds: string[];
    cursorVersion: number;
    historySummary: ManagerSnapshot["historySummary"];
  }
>;
```

约束：

- 该 envelope 只能是 refresh hint，不能替代 snapshot 或 read-only endpoints。
- 不携带 action audit 原文。
- 不携带 process ownership。
- 不携带 PID 作为操作目标。
- 不携带 control endpoint、bearer token、supervisor token hash。
- Desktop 收到后应 refetch read-only projection，而不是直接拼接本地 history。

## 6. Debug Endpoint Relationship

`POST /v1/debug/expire-pending-actions` 保持 dev/QA 工具：

- scheduler enabled 时仍可手动调用，用于 deterministic QA。
- debug endpoint 和 scheduler 都调用同一个 Manager method。
- debug endpoint 不应绕过 scheduler 的安全边界。
- 产品环境可隐藏或禁用 debug endpoint；这不影响 scheduler contract。

## 7. Testing Contract

已新增 API tests：

- API option 默认关闭：创建 accepted pending action 后不因时间流逝自动过期。
- scheduler opt-in：mutable clock 推过 `expiresAt` 后自动过期 pending action。
- dev/test timeout override：短 `pendingActionTimeoutMs` 会写入对应 `expiresAt`，scheduler 使用该 deadline 过期 pending action。
- scheduler no-op tick：没有 expired actions 时不广播 snapshot。
- scheduler SSE：expired action 后 SSE 收到 `notch.snapshot.updated`，snapshot 里 pending status 为 `expired`。
- persistence recovery：hydrate stale `in_progress` pending action 后 startup sweep 过期并重新持久化。
- close cleanup：`LocalManagerApiServer.close()` 后 timer 不再运行，测试进程不挂。
- side-effect boundary：scheduler 不调用 `ProcessSupervisor`，不启动 retry，不终止进程。

建议 Browser QA：

- API mode 打开 Session Hub。
- 创建 accepted pending action。
- scheduler 自动 sweep 后，Hub 的“动作状态”从“正在处理”更新为“已过期”。
- console error 为 0。

## 8. Implementation Status

首轮 runtime 已完成：

1. `LocalManagerApiServer` 增加 opt-in scheduler option 与 timer lifecycle。
2. server bin 增加 env/CLI 参数解析。
3. API scheduler unit tests 覆盖 SSE、close cleanup、persistence recovery 和 no-supervisor 边界。

剩余验证工作：

1. 运行完整相关 tests/build/QA。
2. 用 in-app Browser 做 API mode auto-expire smoke。

## 9. Open Questions

- packaging/beta 是否默认启用 scheduler，还是继续由启动参数开启。
- beta 默认 interval 是 15s、30s 还是 60s。
- 是否需要 per-action timeout，例如 retry 比 terminate 更短。
- 如果未来新增 `notch.history.updated`，Desktop 是否仍需要全量 snapshot SSE 作为兜底。
