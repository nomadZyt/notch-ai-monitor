# Main Agent Handoff: Internal Scheduler Runtime P2

日期：2026-06-08
Agent：Main Agent
工作目录：`/Users/zhaiyongtao/vibeCoding/notch-ai-monitor`

## 本次目标

实现 opt-in Local Manager API internal scheduler，让 pending action timeout 可以无人值守自动 sweep，并通过现有 snapshot SSE 更新 Desktop。边界保持：默认关闭；scheduler 只调用 `manager.expirePendingActions({ at: clock() })`；不调用 retry / terminate / ProcessSupervisor；不按 PID 操作进程；不读取 raw control token、process persistence、control registry 私有结构。

## 已完成内容

- `LocalManagerApiOptions` 新增 `pendingActionSweepIntervalMs?: number | null`。
- `LocalManagerApiServer.listen()` 成功后启动 scheduler lifecycle：先 startup sweep，再按 interval tick。
- `LocalManagerApiServer.close()` 最前面清理 scheduler timer，避免测试或运行时留下 active handle。
- server bin 新增 `NOTCH_PENDING_ACTION_SWEEP_INTERVAL_MS` 和 `--pending-action-sweep-interval-ms` 解析。
- scheduler 继续复用 Manager emission 和现有 SSE `notch.snapshot.updated`，未新增 `notch.history.updated`。
- 合同文档已从 planned/design wording 更新为首轮 runtime 已实现。
- in-app Browser 验证 Session Hub 从“正在处理”自动更新为“已过期”。

## 修改/新增文件

- `packages/local-manager-api/src/local-manager-api.ts`
- `packages/local-manager-api/src/bin/server.ts`
- `packages/local-manager-api/tests/local-manager-api.test.mjs`
- `docs/contracts/local-manager-api.md`
- `docs/contracts/internal-scheduler-sse-p2.md`
- `docs/contracts/event-history-pending-actions-p2.md`
- `docs/contracts/retry-terminate-p2.md`
- `docs/handoffs/main-agent-context-checkpoint-p2.md`
- `docs/handoffs/main-agent-internal-scheduler-runtime-p2.md`

## 关键决策

- scheduler 默认关闭，只有 option/env/CLI 显式配置后才运行。
- `undefined` / `null` / `0` 关闭；正数 interval 开启。env/CLI 参数要求非负整数毫秒值；API option 要求非负有限 number。
- startup sweep 放在 `listen()` 成功后，确保 Manager hydrate 已完成，并能恢复离线期间 stale `in_progress` pending action。
- tick 不直接 broadcast；只依赖 `expirePendingActions()` 在有实际 expired action 时 emit snapshot，因此 no-op tick 不广播。
- 不修改 shared protocol、EventQueue/StateMachine、Desktop UI 或 real CLI adapter。
- Desktop 仍只消费 Manager snapshot/read-only endpoints；不直接操作 CLI 进程或 persistence file。

## 暴露的接口或数据结构

```ts
interface LocalManagerApiOptions {
  pendingActionSweepIntervalMs?: number | null;
}
```

启动入口：

```sh
NOTCH_PENDING_ACTION_SWEEP_INTERVAL_MS=30000 \
  npm run serve -w @notch-ai-monitor/local-manager-api

npx notch-local-manager-api \
  --host 127.0.0.1 \
  --port 4317 \
  --pending-action-sweep-interval-ms 30000
```

SSE 仍是：

```text
event: notch.snapshot.updated
data: {"event":"notch.snapshot.updated","payload":{"snapshot":{...}}}
```

## 测试结果

- `npm run test -w @notch-ai-monitor/local-manager-api`：28/28 通过。
- `npm run test -w @notch-ai-monitor/local-manager-mock`：29/29 通过。
- `npm run build`：通过。
- `npm run test:qa`：首轮 1 条 Session Hub pagination click flake；单条重跑通过；完整重跑 12/12 通过。
- `git diff --check`：通过。
- safety scan：未发现 scheduler 新增 `process.kill`、PID kill、retry、terminate 或 supervisor 调用。
- in-app Browser：UI 通过 Desktop 自己的 terminate 二次确认流程创建 accepted pending action，Session Hub 先显示“正在处理”，随后 scheduler 自动 sweep 显示“已过期”，console error 0。

## 未解决问题

- packaging/beta 是否默认启用 scheduler 仍未定；当前实现保持默认关闭。
- beta 推荐 interval 仍建议 `30000` ms，但还未做 packaging preset。
- `notch.history.updated` 仍未实现；当前继续用 `notch.snapshot.updated`，只有未来 snapshot 成本证明过高时再设计实现。
- Browser QA 用临时 API `127.0.0.1:4318` 做了短 interval/mutable clock 验证；该临时 API 已停止。

## 下一位 agent 需要知道的上下文

- 现有长期服务未被本轮重启：Local Manager API `http://127.0.0.1:4317` 仍可能是之前的 PID `23610`；Desktop Vite `http://127.0.0.1:5174` 仍可能是之前的 PID `94874`。
- 本轮没有改 Desktop UI；如果要在现有 4317 服务上使用 scheduler，需要用最新 build 重启并传 `--pending-action-sweep-interval-ms <ms>`。
- Debug endpoint `POST /v1/debug/expire-pending-actions` 仍保留为 deterministic QA 工具，可与 scheduler 并存。
- `terminate` 仍只能 graceful stop；scheduler timeout 只表示 pending visibility expired，不代表真实进程被取消、重试或终止。
