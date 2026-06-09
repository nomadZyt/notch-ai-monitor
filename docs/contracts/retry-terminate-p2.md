# Notch AI Monitor P2 Retry / Terminate Contract

日期：2026-06-08
阶段：P2.2

## 1. 目标

P2.2 先定义 `retry` / `terminate` 真实 process side effect 合同，不在本小节接真实进程控制。

核心目标：

- Desktop UI 只发送 action request、展示 Manager 返回结果，不直接操作 CLI 进程。
- `retry` 只能基于 Manager/adapter 记录的安全 launch profile 重启，不接受 Desktop 任意命令输入。
- `terminate` 必须先确认、再校验权限边界和进程归属，不能直接按 PID kill 进程。
- 真实 side effect 必须由 Manager 或 adapter/supervisor 执行，并留下可审计记录。

## 2. 非目标

P2.2 不做：

- 不实现真实 `retry` / `terminate` runtime。
- 不修改 shared model、API endpoint、protocol envelope、EventQueue/StateMachine 或 real CLI adapter。
- 不让 Desktop 读取 PID、attach PTY、调用 `kill`、调用系统 Terminal、直接启动 CLI。
- 不引入 `SIGKILL`、`kill -9` 或无确认的强制终止。
- 不把用户在 UI 中输入的任意字符串当作 retry command。

## 3. 现有协议复用

P2.2 设计阶段复用现有字段，不要求立即扩协议：

```ts
interface ActionRequestPayload {
  requestId: string;
  eventId: string;
  actionId: string;
  confirmed?: boolean;
  input?: Record<string, unknown>;
  uiContext?: {
    selectedEventId?: string;
    panel?: PanelState;
  };
}
```

```ts
type ActionResultStatus =
  | "accepted"
  | "completed"
  | "failed"
  | "rejected"
  | "noop"
  | "needs_confirmation";
```

真实 process side effect 的 `effects[].mocked` 规则：

- `mocked: true`：仍是 mock、dry-run、拒绝、失败前反馈，或没有触达真实进程。
- `mocked: false`：Manager 已经通过 adapter/supervisor 执行了受控 process side effect。

## 4. 通用安全模型

### 4.1 执行归属

真实 `retry` / `terminate` 只能作用在 Manager 认识的会话和进程上。不能接受来自 Desktop、event evidence 或 URL/query 的 PID 作为唯一依据。

Manager 内部需要有进程归属记录。P2.2 只定义合同，不要求现在落 shared model：

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

归属校验至少包含：

- `sessionId` 与 action event 的 `sessionId` 一致。
- `sourceMode` 是 live/real manager 托管来源，不是纯 mock fixture。
- 进程由 Notch Manager/adapter/supervisor 启动或注册。
- PID 存在时必须同时校验启动时间、runId 或 supervisor token，避免 PID 复用误伤。
- `cwd`、adapter、launch profile 与会话记录一致。

### 4.2 权限边界

Manager 必须在执行前判断 capability：

- `process.retry`：是否允许从当前 launch profile 重新启动。
- `process.terminate`：是否允许对当前归属进程发起 graceful stop。

任一 capability 缺失时：

- 返回 `status: "rejected"`。
- `effects[].mocked` 不得为 `false`。
- event 保持 active。

### 4.3 幂等

`requestId` 必须用于幂等：

- 同一 `requestId` 重放时返回同一 action result 或明确 `rejected` 为 duplicate。
- `retry` 不得因重复点击启动多个 attempt。
- `terminate` 不得因重复确认发送多次 stop 请求。

### 4.4 审计记录

每次 process action 都必须生成审计记录。P2.3 持久化之前可以先是 Manager 内存审计日志，但字段要稳定：

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
  process?: {
    runId: string;
    pid?: number;
    processStartedAt?: string;
    cwd: string;
    launchProfileHash: string;
    supervisorTokenHash: string;
  };
  resultMessage: string;
  errorCode?: string;
}
```

### 4.5 Failure 语义

真实 process action 失败不能静默吞掉：

- 前置条件不满足：`status: "rejected"`。
- Manager 尝试执行但 adapter/supervisor 报错：`status: "failed"`。
- 操作被排队或 graceful stop 已发出但尚未完成：`status: "accepted"`。
- 操作完成且 Manager 已收到可靠确认：`status: "completed"`。
- 缺少确认：`status: "needs_confirmation"`。

## 5. Retry 合同

### 5.1 前置条件

`retry` 只能在满足以下条件时变成真实 side effect：

- action 来自 active error event。
- event 所属 session 存在。
- Manager 有该 session 的 launch profile，且 profile 来源于之前的真实 run。
- launch profile 包含 adapter、cwd、命令/参数、必要 env allowlist 或等价的安全重启描述。
- retry 必须重新经过 risk policy 或使用已记录的安全批准状态；不能跳过风险判断。
- 当前 session 没有已经在运行的 retry attempt。

缺任一条件时返回 `rejected` 或 `failed`，不得启动进程。

### 5.2 请求输入

P2.2 不要求扩 `ActionRequestPayload`。未来实现可复用现有 `input` 做目标回显：

```json
{
  "input": {
    "expectedSessionId": "sess_123",
    "expectedLaunchProfileHash": "launch_abc",
    "retryMode": "same-profile"
  }
}
```

Manager 必须以内部记录为准，`input` 只能用于防止用户确认错目标，不能成为权限来源。

### 5.3 执行流程

1. Desktop 发送 `actionId: "retry"`。
2. Manager 校验 event、session、launch profile、risk policy、幂等。
3. Manager 通过 adapter/supervisor 创建新 attempt，而不是由 Desktop 启动 CLI。
4. 新 attempt 成功启动后，Manager 可将原 error event 标记为 `resolved`，resolution 建议为 `retry_started`。
5. 新 attempt 后续失败时，应产生新的 error event，而不是复用旧错误事件。

### 5.4 Action Result

同步启动成功时：

```json
{
  "status": "completed",
  "resolution": "retry_started",
  "resolvedEventStatus": "resolved",
  "effects": [
    {
      "type": "process",
      "target": "session:<newSessionId>",
      "mocked": false
    }
  ]
}
```

如果 retry start request 已提交给 adapter/supervisor，但新进程尚未确认 running：

```json
{
  "status": "accepted",
  "effects": [
    {
      "type": "process",
      "target": "session:<oldSessionId>#retry-start-requested",
      "mocked": false
    }
  ]
}
```

`accepted` 时 event 应保持 active，直到 Manager 发出后续 snapshot/event 更新。如果只是 Manager 本地排队、尚未触达 adapter/supervisor，则不得返回 `mocked: false`。

## 6. Terminate 合同

### 6.1 前置条件

`terminate` 必须满足：

- 第一次点击只返回 `needs_confirmation`。
- 确认请求必须带 `confirmed: true`。
- event 所属 session 存在，且 Manager 有对应 `ProcessOwnershipRecord`。
- 进程仍然存活，且 runId、sessionId、processStartedAt 或 supervisor token 校验通过。
- 当前 adapter/supervisor 明确支持 graceful stop。
- action 目标不是任意 PID，而是 Manager 归属的 session/run。

缺任一条件时返回 `rejected` 或 `failed`，event 保持 active。

### 6.2 不能直接 kill

P2.2 的 `terminate` 只允许 graceful stop：

- 优先调用 adapter-native stop。
- 其次调用 supervisor 的受控 terminate。
- 平台需要信号时，只能由 Manager/supervisor 对自己归属的 child process 发出温和终止信号。

禁止：

- Desktop 调用任何进程 API。
- 只凭 PID 终止。
- `SIGKILL` / `kill -9`。
- 终止不属于 Notch Manager/adapter 的进程。

强制终止如果未来需要，必须作为新的 action 和新的合同进入后续阶段，不能复用 P2.2 `terminate`。

### 6.3 请求输入

未来实现可通过现有 `input` 做确认目标回显：

```json
{
  "confirmed": true,
  "input": {
    "confirmationIntent": "terminate_graceful",
    "expectedSessionId": "sess_123",
    "expectedRunId": "run_456",
    "expectedLaunchProfileHash": "launch_abc"
  }
}
```

Manager 必须校验这些值与内部归属记录一致。不一致时返回 `rejected`。

### 6.4 执行流程

1. Desktop 第一次发送 `terminate`，Manager 返回 `needs_confirmation`。
2. Desktop 展示确认状态，确认文案必须包含 session/tool/cwd 等可识别目标。
3. Desktop 第二次发送 `confirmed: true` 和目标回显。
4. Manager 校验 event、session、process ownership、capability、幂等。
5. Manager 通过 adapter/supervisor 发起 graceful stop。
6. 只有 supervisor 确认进程退出或 session ended 后，Manager 才能把事件 resolution 标记为 `terminated` 或 `terminate_graceful_completed`。

确认后的 `accepted` / `completed` / `failed` / `rejected` projection 必须 supersede 同一 `eventId + actionId` 的旧 `waiting_confirmation` pending visibility；审计和 timeline 仍可保留第一次确认请求事实。

### 6.5 Action Result

确认缺失：

```json
{
  "status": "needs_confirmation",
  "effects": [
    {
      "type": "process",
      "target": "session:<sessionId>",
      "mocked": true
    }
  ]
}
```

graceful stop 已发出但退出尚未确认：

```json
{
  "status": "accepted",
  "effects": [
    {
      "type": "process",
      "target": "session:<sessionId>#terminate",
      "mocked": false
    }
  ]
}
```

graceful stop 已确认完成：

```json
{
  "status": "completed",
  "resolution": "terminate_graceful_completed",
  "resolvedEventStatus": "resolved",
  "effects": [
    {
      "type": "process",
      "target": "session:<sessionId>#terminated",
      "mocked": false
    }
  ]
}
```

### 6.6 P2.4d 异步完成与失败反馈

`accepted` 不是完成态。Manager/API 内部必须保留 pending action 记录，后续只接受可信 completion 来源：

- supervisor 自己持有 child handle，并收到 child close/session ended。
- wrapper/notch-run adapter 通过 protocol 上报同一 session 的 `notch.session.ended`。
- adapter control HTTP 明确返回 4xx/5xx、`ok:false`、`status:"failed"` / `status:"rejected"`，或请求网络错误。

成功 completion：

- 将同一 `requestId` 的 replay result 从 `accepted` 更新为 `completed`。
- 对原 active event 调用 `resolution: "terminate_graceful_completed"`。
- 追加 `ProcessActionAuditRecord`，`decision: "completed"`，并保留原 request 的 source/process 审计链。

失败 completion：

- 将同一 `requestId` 的 replay result 从 `accepted` 更新为 `failed`。
- 追加 `ProcessActionAuditRecord`，`decision: "failed"`、`errorCode` 和失败原因。
- 原 event 保持 active，允许用户看到失败反馈后再次选择安全动作。

Timeout completion：

- Manager 可以通过显式 pending action sweep 把超时的 `accepted` action 投影为 `expired`。
- 同一 `requestId` replay result 必须变成 `failed`，`errorCode: "pending_action_timeout"`。
- 原 event 保持 active；late completion 不覆盖已 terminal 的 timeout replay result。
- P2 internal scheduler 已实现，见 `docs/contracts/internal-scheduler-sse-p2.md`；scheduler 只能调用 Manager sweep，不能调用 supervisor、retry、terminate 或 PID 操作。
- Local Manager API dev/test 可通过 `pendingActionTimeoutMs` / `NOTCH_PENDING_ACTION_TIMEOUT_MS` / `--pending-action-timeout-ms` 缩短 deadline；该配置只影响 timeout projection 的时间，不新增进程控制能力。

adapter control endpoint 只表示 graceful stop request 是否被 adapter 接受；不能仅凭 202/200 response 自动 resolve event。event auto-resolution 必须等到 session ended 或同等可靠的 supervisor completion。

## 7. Desktop UI 要求

- Desktop 不展示或使用 raw PID 作为主要操作目标。
- Desktop 可以展示 Manager 提供的 session/tool/cwd 摘要，帮助用户确认目标。
- Desktop 只调用 Manager action API，不直接操作进程。
- `needs_confirmation`、`accepted`、`failed`、`rejected` 都必须有用户可见反馈。
- 如果 Manager 返回 `accepted`，UI 不应假设进程已经退出或 retry 已经完成。

## 8. 测试门槛

进入真实实现前至少需要覆盖：

- `retry` 缺 launch profile 时被拒绝。
- `retry` 重复 requestId 不会启动多次。
- `retry` 有已运行 retry attempt 时被拒绝或 no-op。
- `terminate` 未确认返回 `needs_confirmation`。
- `terminate` 已确认但无 process ownership 时被拒绝。
- `terminate` ownership token/session/run 不匹配时被拒绝。
- `terminate` 只调用 graceful stop fake supervisor，不调用 force kill。
- adapter/supervisor 抛错时返回 `failed`，event 保持 active。
- P2.4d 中 accepted terminate 在 session ended 后自动 resolve 原 event。
- P2.4d 中 adapter control HTTP 失败会记录 failed audit，event 保持 active，同一 requestId replay 返回 failed。
- Desktop E2E 只验证 action request 和 UI feedback，不验证真实进程被 kill。

## 9. 当前运行时姿态

在上述合同实现前：

- 默认 `retry` 保持 mocked process effect。
- 默认 `terminate` 保持 mocked process effect 和二次确认。
- `effects[].mocked` 不得因为 P2.2 文档存在而改为 `false`。

## 10. P2.2a 内部实现切片

P2.2a 已开始在 `local-manager-mock` 中提供显式 opt-in 的内部缝合点：

- `processSideEffectMode: "mock"` 是默认值，保持 P1/P2.1 行为。
- `processSideEffectMode: "supervised"` 只用于测试或未来 adapter 接入前的受控路径。
- `ProcessOwnershipInput` / `ProcessOwnershipRecord` 记录 Manager 内部进程归属，不进入 shared model。
- `ProcessSupervisor.terminateGracefully()` 是 fake supervisor tests 使用的唯一终止接口，不提供 force kill API。
- `getProcessActionAuditRecords()` 暴露内存审计记录，供 P2.3 持久化设计承接。

P2.2a 仍不接真实 CLI 进程：

- 没有 `retry` supervisor runtime。
- 没有 real CLI adapter process registry。
- 没有 OS-level process signal。
- 没有 Desktop 直接进程操作。

## 11. P2.2b Retry 内部实现切片

P2.2b 在 `local-manager-mock` 中继续使用显式 opt-in 的 `processSideEffectMode: "supervised"`：

- 默认 `retry` 仍保持 mocked process effect。
- `RetryLaunchProfileInput` / `RetryLaunchProfileRecord` 保存 Manager 内部可审计重试启动配置，不进入 shared model。
- `registerRetryLaunchProfile()` / `getRetryLaunchProfile()` 暴露测试和未来 adapter 缝合点。
- `ProcessSupervisor.startRetry()` 是 fake supervisor tests 使用的唯一 retry 启动接口，Desktop 不启动 CLI。
- retry 前必须执行 risk policy replay，除非 launch profile 明确记录 `riskReplayMode: "approved"`。
- risk replay 命中危险命令时，Manager enqueue active risk event，返回 `status: "rejected"` 和 navigation effect，不调用 `startRetry()`。
- safe replay 通过后才调用 `startRetry()`；成功时原 error event 可 resolution 为 `retry_started`。
- 同一 retry `requestId` replay 返回首次 result，不重复调用 supervisor。

P2.2b 仍不做：

- 不接 real CLI adapter。
- 不持久化 launch profile 或审计记录。
- 不让 Desktop 输入任意 retry command。
- 不允许 retry 绕过 risk policy。

## 12. P2.3 Process Persistence

P2.3 为 P2.2 的 process action 合同增加最小持久化边界：

- `local-manager-mock` 定义 `ProcessPersistenceStore` port，不直接依赖 Node `fs`。
- `local-manager-api` 提供可选 `JsonFileProcessPersistenceStore`，用于 Manager/API 进程落盘。
- Desktop 不读取、不写入持久化文件。
- 默认 `createMockLocalAgentManager()` 和默认 `createLocalManagerApi()` 不写文件。

持久化 snapshot 包含：

```ts
interface ProcessPersistenceSnapshot {
  processActionAudit: readonly ProcessActionAuditRecord[];
  processOwnership: readonly ProcessOwnershipRecord[];
  retryLaunchProfiles: readonly RetryLaunchProfileRecord[];
  retryRiskReplays: readonly RetryRiskReplayRecord[];
}
```

retry risk replay result：

```ts
type RetryRiskReplayDecision = "passed" | "blocked" | "approved_skip";

interface RetryRiskReplayRecord {
  requestId: string;
  eventId: string;
  sessionId: string;
  launchProfileHash: string;
  commandHash: string;
  decision: RetryRiskReplayDecision;
  replayedAt: string;
  riskEventId?: string;
  riskLevel?: string;
  message: string;
}
```

JSON file store 启用方式：

- `createLocalManagerApi({ processPersistenceFile: "/path/to/process-state.json" })`
- CLI env：`NOTCH_PROCESS_PERSISTENCE_FILE=/path/to/process-state.json`
- CLI arg：`--process-persistence-file /path/to/process-state.json`

P2.3 仍不做：

- 不把持久化 schema 提升到 shared protocol。
- 不提供 Desktop 文件读写入口。
- 不保证 process action `requestId` idempotency 跨重启 replay；当前持久化的是审计和恢复上下文，不是 action result cache。
- 不接 real CLI adapter。

## 13. P2.4 Real CLI Adapter Registration

P2.4 让 `cli-adapter-real` 的 `wrapper` / `notch-run` 在启动 child process 后向 Local Manager API 登记：

- retry launch profile
- process ownership

登记入口是 Local Manager API 内部 endpoint：

```http
POST /v1/process/registrations
```

该 endpoint 不属于 shared protocol envelope，不由 Desktop 调用。

登记 payload 至少包含：

```ts
interface ProcessRegistrationPayload {
  sessionId: string;
  runId: string;
  adapterId: string;
  cwd: string;
  command: string;
  executable?: string;
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

Manager 行为：

- 校验 `sessionId` 已存在，且 session `sourceMode` 是 `live` 或 `wrapper`。
- 调用 `registerRetryLaunchProfile(...)` 保存 retry 所需的 cwd/command/hash/capability/risk replay mode。
- 调用 `registerProcessOwnership(...)` 保存 terminate 所需的 runId/pid/processStartedAt/supervisorTokenHash/capability。
- 复用 P2.3 `ProcessPersistenceStore` 持久化 ownership 和 launch profile。

安全边界：

- 登记只建立可审计上下文，不启动 retry、不 terminate、不读取日志文件。
- `wrapper` sourceMode 可以登记，但真实 `retry` / `terminate` 仍按 P2.2/P2.2b runtime 校验；默认 runtime 仍是 mocked。
- `terminate` 未来接 real adapter 时仍只能走 graceful supervisor，不允许直接 kill、`SIGKILL` 或只凭 PID 终止。
- Desktop 仍只发送 action request，不调用 registration endpoint，不读取 process persistence 文件。

## 14. P2.4b Local Process Supervisor

P2.4b 在 Local Manager API 中增加 opt-in 的真实 process supervisor：

```sh
NOTCH_PROCESS_SIDE_EFFECT_MODE=supervised npm run serve -w @notch-ai-monitor/local-manager-api
npx notch-local-manager-api --process-side-effects supervised
```

默认仍是 `processSideEffectMode: "mock"`。

真实 retry 行为：

- 只使用 Manager 已登记的 launch profile。
- 必须有 `executable`，并使用 `spawn(executable, args, { shell: false })`。
- 不解析 `command` shell string；`command` 只用于展示、审计和 risk replay。
- 启动成功后返回 `status: "completed"`、`resolution: "retry_started"`、`effects[].mocked: false`。
- supervisor 会为新 child session 回写新的 retry launch profile 和 process ownership。

graceful terminate 行为：

- 仍必须先经过 P2.2 的 confirmation、ownership、capability、目标回显校验。
- 只对当前 Local Process Supervisor 自己启动并持有 child handle 的进程发起 graceful stop。
- 如果只有 registration 里的 PID，但当前 supervisor 没有 child handle，则返回 `failed`，错误码 `graceful_process_not_owned_by_supervisor`。
- 不使用 Desktop 进程控制，不按 PID 直接终止外部进程，不使用 `SIGKILL` / `kill -9`。

当前限制：

- wrapper/notch-run 自己启动的外部 child 已能登记 ownership/profile，但 Local Manager API 尚无 adapter 控制通道，因此不能仅凭该 PID graceful terminate。
- retry child 的 stdout/stderr 尚未接回事件解析；P2.4b 只负责 process lifecycle 的最小 supervisor。
- child 退出后的 session end 由 Local Manager API supervisor 回写；完整 event history persistence 仍待后续阶段。

## 15. P2.4c Adapter Control Channel

P2.4c 为 wrapper/notch-run 外部 child 增加本机 adapter control channel：

- adapter 绑定 `http://127.0.0.1:<random>/v1/control/terminate-gracefully`。
- adapter 生成一次性 bearer token，并把 raw token 只通过 registration 发送给 Local Manager API。
- Local Manager API 只在内存 supervisor registry 保存 raw token；持久化只保留 `supervisorTokenHash`。
- Desktop 不调用 control endpoint，不读取 token。

registration payload 可包含：

```ts
interface ProcessRegistrationPayload {
  sessionId: string;
  runId: string;
  launchProfileHash: string;
  supervisorTokenHash: string;
  controlEndpoint?: string;
  controlToken?: string;
}
```

Local Manager API 约束：

- `controlEndpoint` 必须是 `http://127.0.0.1/...`。
- `controlEndpoint` 和 `controlToken` 必须成对出现。
- terminate 前仍执行 P2.2 confirmation、ownership、capability 和目标回显校验。
- control record 必须匹配 session id、run id、launch profile hash、supervisor token hash。
- 成功发送 adapter graceful stop request 后返回 `status: "accepted"`、`effects[].mocked: false`。

adapter 约束：

- control request 必须带 `Authorization: Bearer <controlToken>`。
- body 必须匹配 session id、run id 和 launch profile hash。
- 只对 wrapper/notch-run 自己持有的 child handle 发出 graceful stop request。
- 不接受任意 PID，不使用 `SIGKILL` / `kill -9`，不让 Desktop 操作进程。

当前限制：

- adapter control request 本身是 async fire-and-forget；action result 返回 `accepted` 后，event 尚不会自动异步 resolve。
- child 退出仍通过 adapter 原有 `notch.session.ended` envelope 回写 session lifecycle。
- 如果 adapter 进程已退出，Manager 无法使用旧持久化记录恢复 raw control token；这符合“不持久化 raw control capability”的安全边界。

## 16. Event History / Pending Action Visibility

完整合同见 `docs/contracts/event-history-pending-actions-p2.md`。

P2.4d 之后，`accepted` process action 已经可以通过 Manager/API 内部 completion 变成 `completed` 或 `failed`。下一步实现 pending action visibility 时，必须把这一过程投影为用户可见但只读的 `PendingActionRecord`：

- `needs_confirmation` -> `waiting_confirmation`
- `accepted` -> `in_progress`
- successful completion -> `completed`
- failed completion -> `failed`
- validation failure -> `rejected`
- timeout sweep -> `expired`，同 `requestId` replay result 变为 `failed`
- confirmed action projection supersedes older `waiting_confirmation` for the same `eventId + actionId`

边界保持不变：

- Desktop 只看 Manager projection，不读取 `ProcessActionAuditRecord` 原始私有结构。
- pending action visibility 不增加新的 retry/terminate 控制能力。
- `terminate` 仍只能通过 P2.2/P2.4c/P2.4d 定义的 graceful stop 与可信 completion 闭环，不能因为 UI 能看到 pending 状态就新增 force kill。
- debug-only `POST /v1/debug/expire-pending-actions` 只用于 QA 显式触发 timeout sweep，不改变 graceful-only 进程控制边界。
- internal scheduler 只自动推进 pending visibility 到 `expired`，不代表 action 被取消、重试或终止。
- dev/test timeout override 只改变 pending deadline，不能绕过 confirmation、ownership、capability 或 graceful-only 约束。
- history item 上如需再次触发 action，仍必须走现有 `notch.action.requested` 合同和所有 confirmation/ownership/capability 校验。
