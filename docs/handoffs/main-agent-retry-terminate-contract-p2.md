# Main Agent Handoff: P2.2 Retry / Terminate Contract

日期：2026-06-08  
Agent：Main Agent  
阶段：P2.2

## 本次目标

先设计 `retry` / `terminate` 真实 process side effect 合同，不接真实进程控制，尤其确保 `terminate` 不能直接 kill 进程。

边界：

- Desktop UI 不直接操作 CLI 进程。
- 不修改 shared model、API endpoint、protocol envelope、EventQueue/StateMachine 或 real CLI adapter。
- 不实现真实 `retry` / `terminate` runtime。
- 不改变当前 mocked process action 行为。

## 已完成内容

- 复核 P2.1：`view-log` 已保持 read-only，Desktop 只展示 Manager action result。
- 复核现有 action runtime：`retry` / `terminate` 仍是 mocked `process` effect，`terminate` 已有二次确认入口。
- 新增 P2.2 合同文档：
  - 定义 Manager/adapter/supervisor 作为唯一真实 process side effect 执行边界。
  - 定义 process ownership 校验，不允许只凭 PID 操作。
  - 定义 capability、幂等、审计、失败反馈语义。
  - 定义 `retry` 只能基于 Manager/adapter 记录的 launch profile 重新启动。
  - 定义 `terminate` 只能 graceful stop，必须确认和校验归属，禁止 `SIGKILL` / `kill -9`。
- 更新 P2 checkpoint，记录 P2.2 开始、复核、设计结束与下一步入口。

## 修改/新增文件

- 新增 `docs/contracts/retry-terminate-p2.md`
- 新增 `docs/handoffs/main-agent-retry-terminate-contract-p2.md`
- 修改 `docs/handoffs/main-agent-context-checkpoint-p2.md`

## 关键决策

- P2.2 是合同设计小节，不接真实 runtime，避免在没有进程归属模型时误伤用户机器上的进程。
- 现有 `ActionRequestPayload.input?: Record<string, unknown>` 足够承载未来确认目标回显，因此本轮不扩 shared protocol。
- `effects[].mocked=false` 只能在 Manager 已经把 retry start 或 terminate stop request 交给 adapter/supervisor 后出现；纯本地排队不得标记为真实 side effect。
- `terminate` 的真实实现必须是 graceful stop；force kill 必须另开合同和 action，不能复用 P2.2 `terminate`。
- PID 不能作为单独授权依据。未来实现必须结合 `sessionId`、`runId`、启动时间或 supervisor token 做归属校验。

## 暴露的接口或数据结构

没有新增 runtime API 或 shared model 字段。

合同草案中定义了未来 Manager 内部数据结构：

```ts
interface ProcessOwnershipRecord {
  sessionId: string;
  runId: string;
  sourceMode: "live";
  adapterId: string;
  owner: "notch-manager";
  pid?: number;
  processStartedAt?: string;
  cwd: string;
  launchProfileHash: string;
  commandHash?: string;
  supervisorTokenHash: string;
}
```

```ts
interface ProcessActionAuditRecord {
  requestId: string;
  eventId: string;
  actionId: "retry" | "terminate";
  sessionId: string;
  source: "desktop-ui" | "api" | "smoke";
  requestedAt: string;
  confirmedAt?: string;
  decision: "accepted" | "completed" | "failed" | "rejected" | "needs_confirmation";
  reason?: string;
  resultMessage: string;
  errorCode?: string;
}
```

未来可复用现有 `ActionRequestPayload.input` 做确认目标回显，例如 `expectedSessionId`、`expectedRunId`、`expectedLaunchProfileHash`。

## 测试结果

通过：

- `git diff --check`
- `npm run test -w @notch-ai-monitor/local-manager-mock`（13/13）
- `curl -fsS http://127.0.0.1:4317/health`

补充检查：

- `rg` 检查没有新增 `process.kill` 实现；`kill` / `SIGKILL` 只出现在合同禁止说明里。
- 本轮未运行 Desktop build、QA 或 browser 点击验证，因为 P2.2 只改文档和 checkpoint，没有 UI/runtime 行为变化。

## 未解决问题

- 还没有 Manager 内部 process ownership registry。
- 还没有 fake supervisor 测试夹具。
- 还没有真实 `retry` launch profile 存储和 risk policy 重放路径。
- 还没有真实 `terminate` graceful stop 实现。
- 审计记录尚未持久化，建议与 P2.3 事件历史与持久化衔接。
- Desktop 确认 UI 还没有展示 session/tool/cwd 的完整目标回显。

## 下一位 agent 需要知道的上下文

- P2.2 合同在 `docs/contracts/retry-terminate-p2.md`。
- 如果继续实现 P2.2，不要先碰真实进程；先做 Manager 内部 process ownership registry 和 fake supervisor tests。
- `terminate` 的第一条真实路径只能是 graceful stop，不能直接 kill，也不能只凭 PID 操作。
- Desktop 仍只调用 Manager action API；所有真实 side effect 都必须由 Manager/adapter/supervisor 执行。
- 当前服务仍可用：Local Manager API `http://127.0.0.1:4317`，Desktop Vite 可能仍在 `http://127.0.0.1:5174`。
