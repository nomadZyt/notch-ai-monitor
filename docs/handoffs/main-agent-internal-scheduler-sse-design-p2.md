# Main Agent Handoff: Internal Scheduler / SSE Update Design P2

日期：2026-06-08
Agent：Main Agent
工作目录：`/Users/zhaiyongtao/vibeCoding/notch-ai-monitor`

## 本次目标

为 pending action timeout 的无人值守过期和 UI 自动更新写清楚设计合同。范围只包含 internal scheduler / SSE update 设计，不实现后台 timer，不修改 runtime，不新增真实 retry/terminate side effect。

## 已完成内容

- 新增 `docs/contracts/internal-scheduler-sse-p2.md`。
- 明确第一阶段 scheduler 是 Local Manager API opt-in timer，默认关闭。
- 明确 scheduler 只调用 `manager.expirePendingActions({ at: clock() })`。
- 明确 scheduler 不调用 retry、terminate、ProcessSupervisor、PID 操作或 raw control token。
- 明确 startup sweep、persistence hydrate、close cleanup、completion vs timeout race 的规则。
- 明确 SSE 第一阶段继续复用 `notch.snapshot.updated`。
- 定义未来可选 `notch.history.updated` refresh hint 的 payload 和边界。
- 更新已有 contracts，把 scheduler/SSE 设计从 open question 推进到已设计、待实现。
- 更新 P2 checkpoint。

## 修改/新增文件

- `docs/contracts/internal-scheduler-sse-p2.md`
- `docs/contracts/event-history-pending-actions-p2.md`
- `docs/contracts/local-manager-api.md`
- `docs/contracts/retry-terminate-p2.md`
- `docs/handoffs/main-agent-context-checkpoint-p2.md`
- `docs/handoffs/main-agent-internal-scheduler-sse-design-p2.md`

## 关键决策

- scheduler 默认关闭，避免开发/测试中隐藏后台 timer 改变状态。
- scheduler 作为 Local Manager API 内部能力，不放进 Desktop，不放进 CLI adapter，不扩 shared protocol。
- scheduler 和 debug endpoint 必须共用同一个 Manager sweep method，避免两套 timeout 语义。
- 第一阶段不新增 `notch.history.updated`；`notch.snapshot.updated` 已能广播最新 `pendingActions/historySummary`。
- 如未来新增 `notch.history.updated`，它只能是 refresh hint，Desktop 仍要以 snapshot/read-only endpoints 为事实源。

## 暴露的接口或数据结构

本轮只设计，未实现 runtime。建议下一步实现时新增：

```ts
interface LocalManagerApiOptions {
  pendingActionSweepIntervalMs?: number | null;
}
```

建议启动入口：

```sh
NOTCH_PENDING_ACTION_SWEEP_INTERVAL_MS=30000 \
  npm run serve -w @notch-ai-monitor/local-manager-api

npx notch-local-manager-api \
  --pending-action-sweep-interval-ms 30000
```

未来可选 refresh hint：

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

## 测试结果

- 本轮为 doc-only design，未修改 TypeScript runtime，因此未运行 build/test/Browser QA。
- 已运行 `git diff --check`：通过。
- 已运行 touched-file 行尾空白检查：通过。

## 未解决问题

- scheduler runtime 尚未实现。
- packaging/beta 是否默认启用 scheduler 仍未定。
- beta 默认 interval 是 15s、30s 还是 60s 仍未定；合同推荐实现支持 opt-in，并建议 beta 使用 30s。
- per-action timeout 是否需要按 retry/terminate/adapter 差异化仍未定。
- `notch.history.updated` 是否必要仍待高频场景验证。

## 下一位 agent 需要知道的上下文

- 当前最稳下一步是实现 opt-in Local Manager API internal scheduler，不要先扩 shared protocol。
- 实现顺序建议：API server option/timer lifecycle -> bin env/CLI args -> API tests covering scheduler/SSE/close cleanup/persistence recovery -> build/QA -> Browser API mode auto-expire smoke。
- 当前 debug endpoint `POST /v1/debug/expire-pending-actions` 仍是 deterministic QA 工具，可和 scheduler 并存。
- Desktop 仍不得读取 persistence file、process audit、control token 或直接操作 CLI 进程。
- `terminate` 仍只能走 graceful stop；scheduler 只让 pending visibility 过期，不表示真实进程被取消、重试或终止。
