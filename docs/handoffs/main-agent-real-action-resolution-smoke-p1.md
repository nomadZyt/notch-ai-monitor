# Main Agent Handoff: P1.16 Real Action Resolution Smoke

日期：2026-06-07  
Agent：Main Agent  
阶段：P1.16

## 本次目标

把真实 failed event 的用户动作闭环固化为 smoke：

- 真实 failed fixture 产生 active `error` event。
- 通过 Manager API 发送 `notch.action.requested`。
- 验证 `ignore` action 将 event 置为 `ignored`。
- 验证 session 保留 `state=failed`、`exitCode=7`、`endReason=exitCode:7`。
- 用浏览器再覆盖一次真实 UI 点击路径。

## 已完成内容

- 进入 P1.16 前先审计 checkpoint：
  - P1.15 摘要、handoff、下一步入口存在。
  - 发现服务状态漂移：checkpoint 写着 `4317/5174` 在跑，但实际端口未监听。
  - 已重启 Local Manager API 和 Desktop Vite。
  - 已重新跑 `smoke:failed` 恢复真实 failed fixture。
- review 现有 action 代码：
  - Desktop 通过 `LocalManagerApiClient.requestAction()` 发送 `notch.action.requested`。
  - Local Manager API 同步返回 `notch.action.result` envelope。
  - Mock manager 已有 `ignore -> ignored` 语义。
  - 因此 P1.16 不需要新增 action protocol 字段。
- 新增 `notch-action-smoke`：
  - 默认先运行 `node-exit-7` failed fixture。
  - 读取当前 active event。
  - 发送 `ignore` action request。
  - 验证 action result 和 resolved snapshot。
- 新增 root `npm run smoke:resolve`。
- in-app browser 手工验收：
  - 真实 failed event 出现后，打开 action panel。
  - 点击 `ignore`。
  - UI 变为 dormant，event count 变为 0。
  - Session Hub 仍显示 failed session 和 exit metadata。

## 修改/新增文件

- 新增 `packages/cli-adapter-real/src/smoke/action-resolution-smoke.ts`
  - action resolution smoke 核心逻辑。
- 新增 `packages/cli-adapter-real/src/bin/notch-action-smoke.ts`
  - CLI entrypoint。
- 修改 `packages/cli-adapter-real/package.json`
  - 新增 `notch-action-smoke` bin。
  - 新增 workspace `smoke:resolve`。
- 修改 `package.json`
  - 新增 root `smoke:resolve`。
- 修改 `packages/cli-adapter-real/tests/cli-adapter-real.test.mjs`
  - fake Manager API 支持 `notch.action.requested`。
  - 新增 action smoke args 测试。
  - 新增 action resolution smoke 测试。
- 新增 `docs/handoffs/main-agent-real-action-resolution-smoke-p1.md`

## 关键决策

- smoke 只通过 HTTP API 与 Manager 通信，不读取 Manager 内部状态。
- 默认 `smoke:resolve` 自己准备 failed fixture，避免依赖人工先跑 `smoke:failed`。
- P1.16 只验证 `ignore`，不接真实 `retry` / `terminate` side effect。
- action resolution 不改变 session lifecycle metadata。
- 保持 `SessionEndedEnvelope` 和 `ActionRequestedEnvelope` shape 不变。

## 暴露的接口或数据结构

新增 smoke options：

```ts
export interface ActionResolutionSmokeOptions {
  baseUrl: string;
  actionId: string;
  prepareFailure: boolean;
  expectedSessionState: "failed";
  expectedExitCode: number;
  expectedEndReason: string;
}
```

新增 CLI：

```sh
npm run smoke:resolve
```

默认行为：

- 准备 `node-exit-7` failed fixture。
- 执行 `ignore` action。
- 预期 action result：
  - `status=completed`
  - `resolvedEventStatus=ignored`
- 预期 snapshot：
  - `activeEvents=0`
  - event `status=ignored`
  - session `state=failed`
  - session `exitCode=7`
  - session `endReason=exitCode:7`

## 测试结果

- `npm run test -w @notch-ai-monitor/cli-adapter-real`
  - 18/18 passed
- `npm run smoke:resolve`
  - passed
  - `eventStatus=ignored`
  - `resultStatus=completed`
  - `resolvedEventStatus=ignored`
  - `sessionExitCode=7`
  - `sessionEndReason=exitCode:7`
- in-app browser 手工验收：
  - 首屏 failed/glance：通过
  - action panel 点击 `ignore`：通过
  - UI event count 清零：通过
  - Session Hub metadata 保留：通过
- `curl http://127.0.0.1:4317/v1/snapshot`
  - event `status=ignored`
  - `activeEvents=0`
- `npm test`
  - 全部 package tests 通过
- `npm run build`
  - TypeScript packages + Desktop Vite production build 通过
- `npm run test:qa`
  - 9/9 passed

## 未解决问题

- `retry`、`view-log`、`terminate` 仍是 mocked effects，没有真实 side effect。
- `smoke:resolve` 当前只覆盖 `ignore`。
- `exitCode:<code>` 仍是机器可读展示，UI 尚未本地化 formatter。
- 当前 manager 仍是内存状态，服务重启后 snapshot 会丢失。

## 下一位 agent 需要知道的上下文

- 当前 API snapshot 是 resolved 后状态：
  - session `state=failed`
  - session `exitCode=7`
  - session `endReason=exitCode:7`
  - event `status=ignored`
  - `activeEvents=0`
- 服务本轮已重启：
  - API PID `67138`
  - Desktop PID `67996`
- 推荐下一步：P1.17 Action Side Effect Boundary。
  - 先定义 `retry` / `view-log` / `terminate` 的安全边界。
  - 不建议直接做真实进程控制；应先从 read-only `view-log` 或 explicit confirmation contract 开始。
