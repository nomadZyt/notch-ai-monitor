# Main Agent Handoff: P2.2a Process Ownership Registry

日期：2026-06-08  
Agent：Main Agent  
阶段：P2.2a

## 本次目标

按照 P2.2 合同后的最稳开发顺序，先实现 Manager 内部 process ownership registry 和 fake supervisor tests，为后续真实 `retry` / graceful `terminate` 打底。

边界：

- 默认 runtime 仍保持 mocked。
- 不接真实 CLI 进程。
- 不让 Desktop 直接操作进程。
- 不修改 shared model、API endpoint、protocol envelope、EventQueue/StateMachine 或 real CLI adapter。

## 已完成内容

- 在 `local-manager-mock` 中新增显式 opt-in 的 process side effect mode：
  - 默认 `processSideEffectMode: "mock"`，保持 P1/P2.1 行为。
  - 测试或未来 adapter 缝合点可传 `processSideEffectMode: "supervised"`。
- 新增 Manager 内部 process ownership registry：
  - `registerProcessOwnership()`
  - `getProcessOwnership()`
- 新增 fake supervisor 接口：
  - `ProcessSupervisor.terminateGracefully()`
  - 没有 force kill API。
- 新增内存审计记录：
  - `getProcessActionAuditRecords()`
- 新增 supervised terminate 路径：
  - 未确认返回 `needs_confirmation`。
  - 缺少归属记录时拒绝。
  - `expectedSessionId` / `expectedRunId` / `expectedLaunchProfileHash` 与归属记录不匹配时拒绝。
  - fake supervisor 返回 `completed` 时，事件 resolution 为 `terminate_graceful_completed`。
  - fake supervisor 返回 `failed` 时，事件保持 active。
- 新增 requestId 幂等 replay：
  - 同一 process action requestId 重放时返回首次 action result。
  - fake supervisor 不会被重复调用。

## 修改/新增文件

- 修改 `packages/local-manager-mock/src/mock-local-agent-manager.ts`
- 修改 `packages/local-manager-mock/src/index.ts`
- 修改 `packages/local-manager-mock/tests/mock-local-agent-manager.test.mjs`
- 修改 `docs/contracts/retry-terminate-p2.md`
- 修改 `docs/handoffs/main-agent-context-checkpoint-p2.md`
- 新增 `docs/handoffs/main-agent-process-ownership-registry-p2.md`

## 关键决策

- 使用 opt-in `processSideEffectMode: "supervised"`，避免默认 Desktop/API mock mode 行为被改变。
- process ownership 是 `local-manager-mock` 内部类型，不进入 shared model；后续 real adapter 如果需要稳定字段，再单独扩展协议。
- fake supervisor 只暴露 `terminateGracefully()`，没有 force kill 方法，从接口层防止直接 kill 路径被测试或实现误用。
- `effects[].mocked=false` 只在 supervised 路径调用 fake supervisor 后出现；默认 mock mode 仍是 `mocked=true`。
- 当前只接 supervised `terminate` 测试路径，不接 `retry` runtime，避免跳过 launch profile/risk policy 设计。

## 暴露的接口或数据结构

新增 `local-manager-mock` 导出类型：

```ts
type ProcessSideEffectMode = "mock" | "supervised";
type ProcessActionId = "retry" | "terminate";
type ProcessCapability = "process.retry" | "process.terminate";

interface ProcessOwnershipInput {
  sessionId: string;
  runId: string;
  adapterId: string;
  cwd: string;
  launchProfileHash: string;
  supervisorTokenHash: string;
  pid?: number;
  processStartedAt?: ISODateTimeString;
  commandHash?: string;
  capabilities?: readonly ProcessCapability[];
  active?: boolean;
}
```

```ts
interface ProcessSupervisor {
  terminateGracefully(request: ProcessSupervisorRequest): ProcessSupervisorResult;
}
```

新增 `MockLocalAgentManager` 方法：

```ts
registerProcessOwnership(input: ProcessOwnershipInput): ProcessOwnershipRecord;
getProcessOwnership(sessionId: string): ProcessOwnershipRecord | null;
getProcessActionAuditRecords(): ProcessActionAuditRecord[];
```

## 测试结果

通过：

- `npm run test -w @notch-ai-monitor/local-manager-mock`（17/17）

新增测试覆盖：

- supervised terminate 未确认返回 `needs_confirmation`。
- supervised terminate 缺 process ownership 拒绝，fake supervisor 不被调用。
- confirmation target mismatch 在 supervisor 前拒绝。
- fake supervisor graceful stop 成功后 event resolved、session ended、`mocked=false`。
- 同一 requestId replay 不重复调用 fake supervisor。
- fake supervisor failed 时 event 保持 active。

## 未解决问题

- 还没有 `retry` supervised runtime。
- 还没有真实 launch profile registry。
- 还没有 real CLI adapter process ownership 接入。
- 还没有持久化审计记录；当前是内存数组，适合 P2.3 承接。
- Desktop 确认 UI 尚未展示 session/tool/cwd 的完整目标回显。
- 当前 supervised path 仍是 fake supervisor tests，不代表真实 OS process side effect。

## 下一位 agent 需要知道的上下文

- 默认 Desktop/API 路径没有变，`createMockLocalAgentManager()` 仍是 mock mode。
- 要测试 P2.2a supervised path，需要构造 `MockLocalAgentManager({ processSideEffectMode: "supervised", processSupervisor })` 并注册 process ownership。
- 下一步如果继续 P2.2，建议先设计/实现 retry launch profile registry，再接 `retry` supervisor；`terminate` 真实接入也必须继续通过 supervisor graceful stop，不允许直接 kill。
