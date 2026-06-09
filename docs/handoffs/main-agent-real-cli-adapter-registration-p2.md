# Main Agent Handoff: P2.4 Real CLI Adapter Registration

日期：2026-06-08  
Agent：Main Agent  
阶段：P2.4

## 本次目标

让 `cli-adapter-real` 的 `wrapper` / `notch-run` 在启动 child process 后向 Manager 注册 retry launch profile 和 process ownership，并复用 P2.3 process persistence store。

边界：

- Desktop 继续只消费 Manager snapshot/action result，不直接操作 CLI 进程。
- 不修改 shared model、shared protocol envelope、EventQueue/StateMachine。
- 不接真实 `retry` / `terminate` side effect；本轮只登记可审计 metadata。
- `terminate` 后续仍只能走 graceful supervisor，不能直接 kill。

## 已完成内容

- Local Manager API 新增内部 endpoint：
  - `POST /v1/process/registrations`
  - 校验 session 已存在，且 `sourceMode` 为 `live` 或 `wrapper`
  - 写入 `registerRetryLaunchProfile(...)`
  - 写入 `registerProcessOwnership(...)`
  - 返回 `notch.process.registered`
- P2.3 persistence store 扩展：
  - `ProcessPersistenceSnapshot` 新增 `processOwnership`
  - `registerProcessOwnership()` 现在会持久化 process state
  - JSON file store 读取旧文件时默认 `processOwnership: []`
- `cli-adapter-real` wrapper/notch-run 新增 registration：
  - child spawn 后生成 `commandHash`、`launchProfileHash`、`runId`、`supervisorTokenHash`
  - 调用 `postProcessRegistration(...)`
  - registration 失败不终止 child process，只写入 wrapper summary
- 合同文档已更新：
  - Local Manager API contract
  - Real CLI Adapter contract
  - Retry/Terminate P2 contract
- Desktop 未改动。

## 修改/新增文件

- 修改 `packages/local-manager-mock/src/mock-local-agent-manager.ts`
- 修改 `packages/local-manager-mock/tests/mock-local-agent-manager.test.mjs`
- 修改 `packages/local-manager-api/src/process-persistence-store.ts`
- 修改 `packages/local-manager-api/src/local-manager-api.ts`
- 修改 `packages/local-manager-api/tests/local-manager-api.test.mjs`
- 修改 `packages/cli-adapter-real/src/index.ts`
- 修改 `packages/cli-adapter-real/tests/cli-adapter-real.test.mjs`
- 修改 `docs/contracts/local-manager-api.md`
- 修改 `docs/contracts/real-cli-adapter.md`
- 修改 `docs/contracts/retry-terminate-p2.md`
- 修改 `docs/handoffs/main-agent-context-checkpoint-p2.md`
- 新增 `docs/handoffs/main-agent-real-cli-adapter-registration-p2.md`

## 关键决策

- 选择 Local Manager API 内部 endpoint，而不是扩 shared protocol envelope；registration 是 Manager metadata，不是跨组件公共事件。
- endpoint 只接受已存在的 `live` / `wrapper` session，避免 Desktop 或任意外部 payload 凭空注册进程。
- `wrapper` sourceMode 可登记，便于 smoke 和 wrapper 观测；但真实 `retry` / `terminate` runtime 仍按 P2.2 校验 live session。
- `command` 只作为 launch profile 的展示/审计字符串；Manager 不把它当 shell string 直接执行。
- registration failure 对 child process 非致命，避免监控链路故障影响用户显式启动的 CLI。

## 暴露的接口或数据结构

```http
POST /v1/process/registrations
```

```ts
interface ProcessRegistrationPayload {
  sessionId: string;
  runId: string;
  adapterId: string;
  cwd: string;
  command: string;
  launchProfileHash: string;
  supervisorTokenHash: string;
  commandHash: string;
  capabilities: readonly ("process.retry" | "process.terminate")[];
  riskReplayMode: "required" | "approved";
  pid?: number;
  processStartedAt?: string;
  source?: string;
  args?: readonly string[];
}
```

```ts
interface ProcessPersistenceSnapshot {
  processActionAudit: readonly ProcessActionAuditRecord[];
  processOwnership: readonly ProcessOwnershipRecord[];
  retryLaunchProfiles: readonly RetryLaunchProfileRecord[];
  retryRiskReplays: readonly RetryRiskReplayRecord[];
}
```

`cli-adapter-real` 新增导出：

- `formatLaunchCommand(...)`
- `createProcessRegistrationPayload(...)`
- `postProcessRegistration(...)`

## 测试结果

通过：

- `npm run test -w @notch-ai-monitor/local-manager-mock`（22/22）
- `npm run test -w @notch-ai-monitor/local-manager-api`（10/10）
- `npm run test -w @notch-ai-monitor/cli-adapter-real`（20/20）
- `npm run build:app -w @notch-ai-monitor/desktop`
- `npm run test:qa`（10/10）
- `git diff --check`
- `curl` 验证 `/health` 和 `/v1/process/registrations`
- in-app Browser 验证 API mode：`1 个会话`、`0` active event、console error 0

补充检查：

- 未新增 `process.kill` / `SIGKILL` / `kill -9` 实现；相关字样只在禁止说明和历史 checkpoint 中出现。
- 验证后已调用 `/v1/debug/reset`，当前 API snapshot 为空。

## 未解决问题

- 还没有 real retry supervisor。
- 还没有 real graceful terminate supervisor。
- 没有跨重启 action result idempotency cache。
- `ProcessPersistenceSnapshot` 仍是 JSON schema v1 的最小形态，没有迁移系统。
- Desktop 没有展示 process registration 或 process action audit 历史。

## 下一位 agent 需要知道的上下文

- 当前本地服务已用最新 dist 重启：
  - Local Manager API：`http://127.0.0.1:4317`
  - Desktop Vite：`http://127.0.0.1:5174`
- `POST /v1/process/registrations` 是 Manager-only endpoint；Desktop 不应调用。
- 如果继续 process side effects，最稳是 P2.4b：real retry supervisor / graceful terminate supervisor。`terminate` 仍只能走 graceful stop，不能直接 kill。
- 如果暂缓真实 side effects，可以进入 P2.5 产品化 Session Hub。
- 工作树本身存在大量 untracked 项目文件和 tracked `prototype/interactive.*` 删除；本轮没有回滚这些状态。
