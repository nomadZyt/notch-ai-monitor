# Main Agent Handoff: Debug Pending Action Timeout Sweep P2

日期：2026-06-08
Agent：Main Agent
工作目录：`/Users/zhaiyongtao/vibeCoding/notch-ai-monitor`

## 本次目标

给 P2 pending action timeout/heartbeat runtime 增加一个 Local Manager API debug-only 显式 sweep 入口，便于 API mode 和 Browser QA 验证 `accepted -> expired` 可见性。不引入 internal scheduler，不接真实 retry/terminate 新 side effect，不让 Desktop 直接控制进程。

## 已完成内容

- Local Manager API 新增 `POST /v1/debug/expire-pending-actions`。
- endpoint 支持空 body 或 `{ "at": ISODateTimeString }`；`at` 非空且必须可解析。
- endpoint 调用 Manager `expirePendingActions()`，返回 `expiredActions` 和最新 `snapshot`。
- API 单测覆盖 adapter-control accepted terminate pending action 的过期、同 `requestId` replay failed、event 保持 active、expired projection 查询、非法 `at`。
- 合同文档补充 debug sweep 的边界：只用于开发/验收，不是产品 action endpoint。
- in-app Browser API mode 验证 Session Hub 能显示 expired pending action。

## 修改/新增文件

- `packages/local-manager-api/src/local-manager-api.ts`
- `packages/local-manager-api/tests/local-manager-api.test.mjs`
- `docs/contracts/local-manager-api.md`
- `docs/contracts/event-history-pending-actions-p2.md`
- `docs/contracts/retry-terminate-p2.md`
- `docs/handoffs/main-agent-context-checkpoint-p2.md`
- `docs/handoffs/main-agent-debug-pending-timeout-sweep-p2.md`

## 关键决策

- 选择 debug-only endpoint，而不是 internal scheduler。这样能验证 timeout 合同，同时避免隐藏后台 timer 行为影响产品语义。
- endpoint 与 `/v1/debug/reset` 同级，不走 shared protocol envelope，也不修改 shared model/API/protocol/EventQueue/StateMachine/real CLI adapter。
- Desktop 不调用该 endpoint；Desktop 仍只消费 `snapshot.pendingActions`、`GET /v1/action-requests`、`GET /v1/event-history` 等 Manager-owned projection。
- `terminate` 边界不变：真实控制仍只能走 graceful stop 和可信 completion，不允许 force kill 或按 PID 操作。

## 暴露的接口或数据结构

### `POST /v1/debug/expire-pending-actions`

请求体：

```json
{
  "at": "2026-06-06T12:05:01+08:00"
}
```

响应：

```json
{
  "ok": true,
  "event": "notch.debug.pending-actions.expired",
  "expiredActions": [],
  "snapshot": {}
}
```

错误：

- `400 invalid_payload`：`at` 不是非空 string 或无法解析为 date。
- `405 method_not_allowed`：非 `POST` 方法。

## 测试结果

- `npm run test -w @notch-ai-monitor/local-manager-api`：21/21 通过。
- `npm run test -w @notch-ai-monitor/local-manager-mock`：29/29 通过。
- `npm run build`：通过。
- `npm run test:qa`：12/12 通过。
- `git diff --check`：通过。
- touched files 行尾空白检查：通过。
- runtime direct API probe：`expiredCount=1`、`visibleExpiredCount=1`、replay `failed/pending_action_timeout`、event `active`。
- in-app Browser API mode：Session Hub 显示“动作状态”1 条“已过期”，事件仍在“待处理事件”和“事件历史”中，console error 0。

## 未解决问题

- 仍未引入 internal scheduler；如要无人值守自动过期，需要单独设计 scheduler tick、SSE 更新频率、测试时钟与持久化恢复语义。
- Debug endpoint 不是正式产品能力；未来 packaging/beta 时应明确 dev-only 暴露策略。
- 当前 Browser smoke 留下了一个 runtime probe snapshot，便于可视验收；如下一位 agent 要回到 fixture 场景，可调用 `/v1/debug/reset` 后重新注入 `all`。

## 下一位 agent 需要知道的上下文

- 当前 Local Manager API 已用最新 dist 重启：`http://127.0.0.1:4317`，PID `23610`，参数包含 `--process-side-effects supervised --event-history-persistence-file /tmp/notch-event-history-p2.json`。
- Desktop Vite 仍在：`http://127.0.0.1:5174`，PID `94874`。
- 当前 in-app Browser 在 API mode Session Hub，可直接看到 runtime probe 的 expired pending action。
- 下一步最稳可以进入 P2 history/pending 的 scheduler/notification 设计，或开始 P3 packaging/real-world beta 验收；无论哪条路，Desktop 仍不得读 persistence file、process audit、control token 或直接操作 CLI 进程。
