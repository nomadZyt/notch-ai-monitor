# Main Agent Handoff: P2.4b Real Process Supervisor

日期：2026-06-08  
Agent：Main Agent  
阶段：P2.4b

## 本次目标

接入 opt-in 的 real retry supervisor / graceful terminate supervisor。`terminate` 仍只能走 graceful stop，不能直接 kill，也不能只凭 PID 操作外部进程。

边界：

- 默认 Local Manager API 仍是 `processSideEffectMode: "mock"`。
- 真实 process side effect 需要显式 `supervised`。
- Desktop 不直接启动、重试、终止 CLI。
- 不修改 shared model、shared protocol、EventQueue/StateMachine。

## 已完成内容

- `RetryLaunchProfileInput` 新增可选 `executable`。
- real adapter registration payload 新增 `executable`，用于安全 spawn。
- Local Manager API registration endpoint 保存 `executable`。
- 新增 `LocalProcessSupervisor`：
  - retry 使用 `spawn(executable, args, { shell: false })`
  - 不解析 `command` shell string
  - 启动成功后返回新 live session
  - 回写新 retry session 的 launch profile 和 process ownership
  - child 退出后回写 session end，并把 ownership 标记 inactive
- Local Manager API 新增 opt-in 开关：
  - `createLocalManagerApi({ processSideEffectMode: "supervised" })`
  - `NOTCH_PROCESS_SIDE_EFFECT_MODE=supervised`
  - `--process-side-effects supervised`
- graceful terminate 只对 `LocalProcessSupervisor` 自己启动并持有 handle 的 child 发出 `SIGTERM` request。
- 如果只有 registration PID、但当前 supervisor 没有 child handle，返回 `failed`，错误码 `graceful_process_not_owned_by_supervisor`。

## 修改/新增文件

- 修改 `packages/local-manager-mock/src/mock-local-agent-manager.ts`
- 修改 `packages/local-manager-api/src/local-manager-api.ts`
- 新增 `packages/local-manager-api/src/local-process-supervisor.ts`
- 修改 `packages/local-manager-api/src/bin/server.ts`
- 修改 `packages/local-manager-api/src/index.ts`
- 修改 `packages/local-manager-api/tests/local-manager-api.test.mjs`
- 修改 `packages/cli-adapter-real/src/index.ts`
- 修改 `packages/cli-adapter-real/tests/cli-adapter-real.test.mjs`
- 修改 `docs/contracts/local-manager-api.md`
- 修改 `docs/contracts/real-cli-adapter.md`
- 修改 `docs/contracts/retry-terminate-p2.md`
- 修改 `docs/handoffs/main-agent-context-checkpoint-p2.md`
- 新增 `docs/handoffs/main-agent-real-process-supervisor-p2.md`

## 关键决策

- `command` 继续只做展示、审计和 risk replay；真实 retry 必须使用 `executable + args`。
- real supervisor 默认不启用，避免普通开发/QA 中真实启动或停止进程。
- graceful terminate 不按 PID 操作系统进程；必须命中当前 supervisor 的 child handle 和 runId。
- terminate action 当前返回 `accepted`，表示 graceful stop request 已提交；child close 后 session end 由 API supervisor 回写。
- wrapper/notch-run 登记的外部 child 仍不能被 API 仅凭 PID terminate；需要后续 adapter 控制通道或同进程 supervisor。

## 暴露的接口或数据结构

```ts
interface RetryLaunchProfileInput {
  sessionId: string;
  adapterId: string;
  cwd: string;
  command: string;
  launchProfileHash: string;
  source?: string;
  executable?: string;
  commandHash?: string;
  args?: readonly string[];
  envAllowlist?: readonly string[];
  capabilities?: readonly ProcessCapability[];
  riskReplayMode?: RiskReplayMode;
  active?: boolean;
  retryAttemptActive?: boolean;
}
```

```ts
createLocalManagerApi({
  processSideEffectMode: "supervised",
});
```

```sh
NOTCH_PROCESS_SIDE_EFFECT_MODE=supervised npm run serve -w @notch-ai-monitor/local-manager-api
npm run serve -w @notch-ai-monitor/local-manager-api -- --process-side-effects supervised
```

## 测试结果

通过：

- `npm run test -w @notch-ai-monitor/local-manager-mock`（22/22）
- `npm run test -w @notch-ai-monitor/local-manager-api`（13/13）
- `npm run test -w @notch-ai-monitor/cli-adapter-real`（20/20）
- `npm run build:app -w @notch-ai-monitor/desktop`
- `npm run test:qa`（10/10）
- `git diff --check`
- 实际 API supervised smoke：
  - retry `completed`
  - retry effect `mocked=false`
  - terminate `accepted`
  - terminate effect `mocked=false`
  - child session 最终 `signal:SIGTERM`
- in-app Browser API mode：
  - `0 个会话`
  - `0` event
  - console error 0

补充检查：

- 没有 `process.kill`。
- 没有 `SIGKILL`。
- 没有 `kill -9`。
- `child.kill("SIGTERM")` 只在 `LocalProcessSupervisor` 内用于 supervisor-owned child handle 的 graceful stop request 和 server shutdown cleanup。

## 未解决问题

- wrapper/notch-run 外部 child 只有 registration，没有 API supervisor handle，仍不能被 API 直接 graceful terminate。
- terminate action 返回 `accepted` 后，event completion 还不是异步自动 resolve；目前只回写 session end。
- retry child stdout/stderr 尚未接入 event parser。
- 没有跨重启 action result idempotency cache。
- 没有完整 event history persistence。

## 下一位 agent 需要知道的上下文

- 当前服务：
  - Local Manager API：`http://127.0.0.1:4317`，当前以 `process side effects: supervised` 运行。
  - Desktop Vite：`http://127.0.0.1:5174`。
- Desktop 仍然解耦，只消费 Manager API snapshot/action result。
- 下一步最稳可以进入 P2.5 产品化 Session Hub。
- 如果继续 P2.4，应做 P2.4c：adapter 控制通道或异步 action completion，让 wrapper/notch-run 外部 child 也能走安全 graceful supervisor，而不是按 PID。
