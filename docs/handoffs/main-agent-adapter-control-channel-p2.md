# Main Agent Handoff: P2.4c Adapter Control Channel

日期：2026-06-08  
Agent：Main Agent  
阶段：P2.4c

## 本次目标

给 wrapper/notch-run 外部 child 增加安全 adapter 控制通道，让真实 graceful terminate 不再依赖 Local Manager API 按 PID 操作。

边界：

- Desktop 不调用 control endpoint。
- Local Manager API 不按 PID terminate 外部进程。
- Adapter 只对自己持有的 child handle 发 graceful stop request。
- 不修改 shared protocol、EventQueue/StateMachine。

## 已完成内容

- `cli-adapter-real` wrapper/notch-run 新增本机 control server：
  - 绑定 `http://127.0.0.1:<random>/v1/control/terminate-gracefully`
  - 使用一次性 bearer token
  - 校验 session id、run id、launch profile hash
  - 校验通过后对 wrapper 自己持有的 child handle 发 graceful stop request
- registration payload 新增：
  - `controlEndpoint`
  - `controlToken`
- `supervisorTokenHash` 在有 control token 时使用 token hash。
- wrapper summary 只显示 control 是否启用，不打印 raw token。
- Local Manager API registration endpoint 新增 control 字段校验：
  - `controlEndpoint` 必须是 `http://127.0.0.1/...`
  - `controlEndpoint` / `controlToken` 必须成对出现
  - raw `controlToken` 只进入 `LocalProcessSupervisor` 内存 registry
  - raw token 不进 `ProcessPersistenceStore`
- `LocalProcessSupervisor.terminateGracefully(...)` 新增 adapter control fallback：
  - 先尝试本地 supervisor-owned child handle
  - 再尝试匹配 session/run/hash 的 adapter control record
  - 成功发送 control request 后返回 `accepted` / `mocked=false`

## 修改/新增文件

- 修改 `packages/cli-adapter-real/src/index.ts`
- 修改 `packages/cli-adapter-real/tests/cli-adapter-real.test.mjs`
- 修改 `packages/local-manager-api/src/local-process-supervisor.ts`
- 修改 `packages/local-manager-api/src/local-manager-api.ts`
- 修改 `packages/local-manager-api/tests/local-manager-api.test.mjs`
- 修改 `docs/contracts/local-manager-api.md`
- 修改 `docs/contracts/real-cli-adapter.md`
- 修改 `docs/contracts/retry-terminate-p2.md`
- 修改 `docs/handoffs/main-agent-context-checkpoint-p2.md`
- 新增 `docs/handoffs/main-agent-adapter-control-channel-p2.md`

## 关键决策

- control endpoint 只允许 `127.0.0.1`，避免把 Manager 变成任意 HTTP caller。
- raw control token 不持久化；Manager 重启后不能复用旧 token，这是刻意的安全边界。
- adapter control request 是 async fire-and-forget；当前 action result 返回 `accepted`，child close 仍由 adapter 的 `notch.session.ended` envelope 反映。
- 不把 control channel 提升到 shared protocol；它是 Manager/adapter 内部能力。
- wrapper/notch-run 自己执行 graceful stop，因为只有 adapter 进程持有 child handle。

## 暴露的接口或数据结构

registration payload 新增可选字段：

```ts
interface ProcessRegistrationPayload {
  controlEndpoint?: string;
  controlToken?: string;
}
```

adapter control endpoint：

```http
POST http://127.0.0.1:<random>/v1/control/terminate-gracefully
Authorization: Bearer <controlToken>
```

control request body：

```json
{
  "requestId": "req_...",
  "sessionId": "sess_...",
  "runId": "run_...",
  "launchProfileHash": "launch_..."
}
```

## 测试结果

通过：

- `npm run test -w @notch-ai-monitor/local-manager-mock`（22/22）
- `npm run test -w @notch-ai-monitor/local-manager-api`（14/14）
- `npm run test -w @notch-ai-monitor/cli-adapter-real`（21/21）
- `npm run build:app -w @notch-ai-monitor/desktop`
- `npm run test:qa`（10/10）
- `git diff --check`
- 实际 P2.4c smoke：
  - terminate `accepted`
  - effect `mocked=false`
  - target `#adapter-graceful-stop-requested`
  - wrapper control enabled
- in-app Browser API mode：
  - `0 个会话`
  - `0` event
  - console error 0

补充检查：

- 没有 `process.kill`。
- 没有 `SIGKILL`。
- 没有 `kill -9`。
- `child.kill("SIGTERM")` 只在 supervisor-owned child 或 adapter-owned child handle 上用于 graceful stop request。

## 未解决问题

- action result 返回 `accepted` 后，event 还不会因为 child close 自动异步 resolve。
- adapter control request 失败后的异步错误没有回写 action result/event。
- raw control token 不持久化，所以 Manager/API 重启后旧 wrapper control channel 不能恢复。
- retry child stdout/stderr 仍未接入 real adapter parser。

## 下一位 agent 需要知道的上下文

- 当前服务：
  - Local Manager API：`http://127.0.0.1:4317`，当前以 `process side effects: supervised` 运行。
  - Desktop Vite：`http://127.0.0.1:5174`。
- P2.4b + P2.4c 已经覆盖两类 graceful stop：
  - API supervisor 自己启动的 retry child
  - wrapper/notch-run adapter 自己启动的 external child
- 下一步最稳可以进入 P2.5 产品化 Session Hub。
- 如果继续 P2.4，应做 P2.4d：async action completion / event auto-resolution / adapter control failure feedback。
