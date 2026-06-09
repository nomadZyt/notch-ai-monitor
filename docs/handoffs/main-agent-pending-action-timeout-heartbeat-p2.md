# Main Agent Handoff: Pending Action Timeout / Heartbeat P2

日期：2026-06-08
阶段：P2 pending action lifecycle hardening
状态：完成最小 runtime

## 本次目标

为 pending action visibility 补齐 timeout/heartbeat 策略和最小 runtime tests。重点是让 `accepted -> in_progress` action 不会无限挂起，同时保持 Desktop 只读、Manager 作为唯一事实源，不新增真实 process side effect。

## 已完成内容

- `local-manager-mock` 新增 `pendingActionTimeoutMs` option。
- 默认 timeout：`DEFAULT_PENDING_ACTION_TIMEOUT_MS = 5 * 60 * 1000`。
- `accepted` / `in_progress` pending action 会写入 `expiresAt`。
- 新增 `heartbeatPendingAction()`：
  - 只作用于同 requestId 的 `in_progress` pending action。
  - 只延长 `expiresAt` / 更新 message。
  - 不 resolve event，不触发 action side effect。
- 新增 `expirePendingActions()`：
  - 显式 sweep 过期的 `in_progress` pending action。
  - pending visibility status 变为 `expired`。
  - 同 requestId replay result 变为 `failed`，`errorCode: "pending_action_timeout"`。
  - event 保持 active。
  - late completion 不覆盖 timeout 后的 terminal replay result。
  - 如果原 action 有 accepted process audit，会追加一条 failed audit。
- 更新 contracts，明确 expired 是只读 visibility，不给 Desktop 新增进程控制权限。

## 修改/新增文件

- 修改 `packages/local-manager-mock/src/mock-local-agent-manager.ts`
- 修改 `packages/local-manager-mock/tests/mock-local-agent-manager.test.mjs`
- 修改 `docs/contracts/event-history-pending-actions-p2.md`
- 修改 `docs/contracts/local-manager-api.md`
- 修改 `docs/contracts/retry-terminate-p2.md`
- 修改 `docs/handoffs/main-agent-context-checkpoint-p2.md`
- 新增 `docs/handoffs/main-agent-pending-action-timeout-heartbeat-p2.md`

## 关键决策

- Timeout 不使用自动后台定时器；当前是显式 Manager sweep，方便测试和后续 API/scheduler 选择。
- Timeout 不 resolve event；用户仍能看到 active event 并选择下一步安全动作。
- Timeout 后同 requestId replay 返回 failed，避免 UI 或 adapter 拿到过时 accepted。
- Heartbeat 只延长 deadline，不写高频 timeline，避免 timeline 噪声。
- 本切片不新增 Desktop UI、不新增 Local Manager API write endpoint、不修改 shared protocol。

## 暴露的接口或数据结构

Manager option：

```ts
interface MockLocalAgentManagerOptions {
  pendingActionTimeoutMs?: number | null;
}
```

Manager methods：

```ts
heartbeatPendingAction(input: {
  requestId: string;
  at?: ISODateTimeString;
  timeoutMs?: number;
  message?: string;
}): PendingActionRecord | null;

expirePendingActions(input?: {
  at?: ISODateTimeString;
}): PendingActionRecord[];
```

Pending projection：

```ts
PendingActionRecord.status === "expired"
PendingActionRecord.resultStatus === "failed"
PendingActionRecord.errorCode === "pending_action_timeout"
```

## 测试结果

- `npm run test -w @notch-ai-monitor/local-manager-mock`：29/29 通过。
- `npm run test -w @notch-ai-monitor/local-manager-api`：20/20 通过。
- `npm run build`：通过。
- `npm run test:qa`：12/12 通过。
- in-app browser API mode：通过。
  - Session Hub 可见“动作状态”“事件历史”和 history filters。
  - `historyRows=2`、`pendingRows=0`。
  - console error 0。

## 未解决问题

- Local Manager API 尚未接 internal scheduler 或 debug-only timeout sweep endpoint。
- Timeout 默认 5 分钟是否按 action kind/adapter 调整仍未产品化。
- Desktop 目前只会展示 expired 状态；没有单独的 timeout action guidance UI。
- `notch.history.updated` SSE envelope 仍未设计。

## 下一位 agent 需要知道的上下文

- 当前最稳下一步：决定 Local Manager API 是否需要 internal scheduler，还是先加 debug-only `/v1/debug/expire-pending-actions` 方便 QA。
- 不要让 Desktop 直接调用 process audit、persistence file、adapter control endpoint 或 raw token。
- 如果做 scheduler，必须保证它只调用 Manager `expirePendingActions()`，不直接操作 process。
- `terminate` 仍只能 graceful stop；timeout 不是 force kill 的授权理由。
- 当前验证服务：Local Manager API `http://127.0.0.1:4317` 以 `--process-side-effects supervised --event-history-persistence-file /tmp/notch-event-history-p2.json` 运行；Desktop Vite `http://127.0.0.1:5174` 运行中。
