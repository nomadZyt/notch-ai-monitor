# Main Agent Handoff: P2.2b Retry Launch Profile

日期：2026-06-08  
Agent：Main Agent  
阶段：P2.2b

## 本次目标

在 P2.2a process ownership registry 之后，先实现 `retry` launch profile registry 和 risk policy replay，再接 opt-in retry supervisor。

边界：

- 默认 runtime 仍保持 mocked。
- 不接真实 CLI 进程。
- 不让 Desktop 输入任意 retry command。
- 不让 retry 绕过 risk policy。
- 不修改 shared model、API endpoint、protocol envelope、EventQueue/StateMachine 或 real CLI adapter。

## 已完成内容

- 新增 Manager 内部 retry launch profile registry：
  - `registerRetryLaunchProfile()`
  - `getRetryLaunchProfile()`
- 新增 retry launch profile 类型：
  - 记录 `sessionId`、`adapterId`、`cwd`、`command`、`launchProfileHash`、`commandHash`、capability、risk replay mode。
- 新增 fake retry supervisor 接口：
  - `ProcessSupervisor.startRetry()`
- 新增 supervised retry validation：
  - 必须是 active error event。
  - session 必须存在且是 `sourceMode: "live"`。
  - launch profile 必须存在、active、属于当前 session。
  - `cwd` 和 `commandHash` 必须与会话/事件一致。
  - profile 必须有 `process.retry` capability。
  - 已有 active retry attempt 时拒绝。
  - `expectedSessionId` / `expectedLaunchProfileHash` 不匹配时拒绝。
- 新增 risk policy replay：
  - safe command 继续进入 fake supervisor。
  - risky command enqueue active risk event，返回 `rejected`，不调用 supervisor。
- 新增 retry requestId replay：
  - 同一 requestId 返回首次 action result。
  - fake supervisor 不会被重复调用。

## 修改/新增文件

- 修改 `packages/local-manager-mock/src/mock-local-agent-manager.ts`
- 修改 `packages/local-manager-mock/src/index.ts`
- 修改 `packages/local-manager-mock/tests/mock-local-agent-manager.test.mjs`
- 修改 `docs/contracts/retry-terminate-p2.md`
- 修改 `docs/handoffs/main-agent-context-checkpoint-p2.md`
- 新增 `docs/handoffs/main-agent-retry-launch-profile-p2.md`

## 关键决策

- `RetryLaunchProfileRecord` 是 `local-manager-mock` 内部类型，不进入 shared model；未来 real adapter 证明需要后再扩展协议。
- `riskReplayMode` 默认是 `"required"`，避免 retry 默认绕过风险扫描。
- risk replay 生成 risk event 时返回 `rejected`，而不是 `accepted`；因为 supervisor 尚未触达，`effects[].mocked` 必须保持 true。
- `ProcessSupervisor.startRetry()` 只存在于 explicit supervised mode；默认 `createMockLocalAgentManager()` 仍是 P1 mocked retry。
- safe retry supervisor 成功后，原 error event resolution 为 `retry_started`，新 attempt 由 supervisor 返回 session 再 upsert。

## 暴露的接口或数据结构

新增 `local-manager-mock` 导出类型：

```ts
type RiskReplayMode = "required" | "approved";

interface RetryLaunchProfileInput {
  sessionId: string;
  adapterId: string;
  cwd: string;
  command: string;
  launchProfileHash: string;
  source?: string;
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
interface RetrySupervisorRequest {
  requestId: string;
  event: NotchEvent;
  session: Session;
  launchProfile: RetryLaunchProfileRecord;
  actionId: "retry";
  input?: Record<string, unknown>;
  requestedAt: ISODateTimeString;
}
```

新增 `MockLocalAgentManager` 方法：

```ts
registerRetryLaunchProfile(input: RetryLaunchProfileInput): RetryLaunchProfileRecord;
getRetryLaunchProfile(sessionId: string): RetryLaunchProfileRecord | null;
```

`ProcessSupervisor` 新增可选方法：

```ts
startRetry?(request: RetrySupervisorRequest): ProcessSupervisorResult;
```

## 测试结果

通过：

- `npm run test -w @notch-ai-monitor/local-manager-mock`（21/21）
- `npm run build:app -w @notch-ai-monitor/desktop`
- `npm run test:qa`（10/10）
- `git diff --check`
- `curl -fsS http://127.0.0.1:4317/health`

新增测试覆盖：

- supervised retry 缺 launch profile 时拒绝，fake supervisor 不被调用。
- risky launch profile 触发 risk replay，enqueue active risk event，fake supervisor 不被调用。
- safe launch profile 调用 fake supervisor，event resolved 为 `retry_started`，新 attempt session upsert。
- 同一 requestId replay 不重复调用 fake supervisor。
- 已有 active retry attempt 时拒绝，event 保持 active。

补充检查：

- `rg` 检查没有新增 `process.kill`、`child_process`、`spawn(`、`exec(`、`SIGKILL`、`kill -9` 实现。
- 本轮没有 browser 点击验证，因为默认 Desktop/API 行为保持 mocked，P2.2b 的新增能力只在 `local-manager-mock` supervised opt-in 测试路径启用。

## 未解决问题

- launch profile 尚未持久化。
- risk approval 尚未和未来 `allow-once` 审计联动；当前仅支持 profile 明确 `riskReplayMode: "approved"`。
- real CLI adapter 尚未注册真实 launch profile。
- `retry` supervisor 仍是 fake tests，不代表真实 OS process side effect。
- Desktop 确认 UI 尚未展示 retry 目标回显。

## 下一位 agent 需要知道的上下文

- 默认 Desktop/API 路径没有变，`retry` 仍是 mocked process effect。
- 要测试 P2.2b supervised retry，需要 `processSideEffectMode: "supervised"`、`processSupervisor.startRetry()` 和 `registerRetryLaunchProfile()`。
- 下一步可进入 P2.3，把 process action audit 和 launch profile 持久化；或继续 P2.4，让 real CLI adapter 注册 launch profile，但仍必须保持 Desktop 解耦。
