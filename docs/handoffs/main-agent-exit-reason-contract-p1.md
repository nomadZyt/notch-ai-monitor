# Main Agent Handoff: P1.15 Exit Reason Contract

日期：2026-06-07  
Agent：Main Agent  
阶段：P1.15

## 本次目标

在不修改 `SessionEndedEnvelope` shape 的前提下，明确真实 wrapper 的退出原因合同：

- 非零退出码应能落到 `Session.endReason`。
- signal 结束仍应保留清晰原因。
- Desktop Session Detail 应能通过已有字段展示真实失败原因。

## 已完成内容

- 主 agent 先审计 checkpoint 与 P1.14 handoff：
  - P1.14 摘要、handoff、真实 failed snapshot、下一步入口均未丢失。
  - 真实 API snapshot 与 checkpoint 对齐。
- review P1.14 代码：
  - smoke 改动局限在 real adapter smoke/test 脚本。
  - 未污染 shared protocol shape。
  - UI 仍只消费 Manager snapshot，不直接依赖 CLI。
- real adapter `notch.session.ended` reason 合同已落地：
  - 普通非零退出：`reason: "exitCode:<code>"`
  - signal 结束：`reason: "signal:<signal>"`
  - signal 优先于 exit code。
- `notch-run-smoke` 现在会验证 expected end reason。
- `node-exit-7` failed smoke 现在验证：
  - `sessionState=failed`
  - `sessionExitCode=7`
  - `sessionEndReason=exitCode:7`
- 协议文档和 real adapter 文档已补充 reason 格式。
- in-app browser 真实 UI 已验证 Session Detail 显示：
  - `EXIT CODE 7`
  - `END REASON exitCode:7`

## 修改/新增文件

- 修改 `packages/cli-adapter-real/src/index.ts`
  - `createSessionEndedEnvelope()` 为非零退出生成 `exitCode:<code>`。
- 修改 `packages/cli-adapter-real/src/smoke/notch-run-smoke.ts`
  - 增加 `expectedEndReason`。
  - live snapshot 校验 `Session.endReason`。
  - smoke JSON 输出 `sessionEndReason`。
- 修改 `packages/cli-adapter-real/tests/cli-adapter-real.test.mjs`
  - 增加 completed/no reason、failed/exitCode reason、signal reason 的 envelope 断言。
  - 增加 failed smoke 的 endReason 断言。
  - wrapper mode 断言 `notch.session.ended.payload.reason`。
- 修改 `docs/contracts/event-protocol.md`
  - 记录 `exitCode:<code>` / `signal:<signal>` reason 格式。
- 修改 `docs/contracts/real-cli-adapter.md`
  - 记录 wrapper 退出原因行为和失败退出示例。
- 修改 `docs/handoffs/main-agent-context-checkpoint-p1.md`
  - 标记 P1.15 执行与合同决策。
- 新增 `docs/handoffs/main-agent-exit-reason-contract-p1.md`

## 关键决策

- 不新增协议字段，继续复用 `SessionEndedEnvelope.payload.reason`。
- `Session.endReason` 保持 session metadata，不写入 event evidence。
- 非零退出 reason 使用稳定机器可读格式 `exitCode:<code>`，避免 UI/manager 解析自然语言。
- signal reason 保持 `signal:<signal>`，并优先于 exit code。

## 暴露的接口或数据结构

`SessionEndedEnvelope` shape 不变：

```ts
export type SessionEndedEnvelope = ProtocolEnvelope<
  "notch.session.ended",
  {
    sessionId: string;
    state: Extract<SessionState, "completed" | "failed">;
    exitCode?: number;
    reason?: string;
  }
>;
```

新增约定值：

- `reason: "exitCode:<code>"`
- `reason: "signal:<signal>"`

`notch-run-smoke` 内部 option 增加：

```ts
expectedEndReason: string | null;
```

## 测试结果

- `npm run test -w @notch-ai-monitor/cli-adapter-real`
  - 17/17 passed
- `npm run smoke:failed`
  - passed
  - `sessionEndReason=exitCode:7`
- in-app browser 手工验收：
  - 首屏：`失败`，`eventCount=1`，`真实 · 失败`
  - Session Detail：`EXIT CODE 7`，`END REASON exitCode:7`
- `npm test`
  - 全部 package tests 通过
- `npm run build`
  - TypeScript packages + Desktop Vite production build 通过
- `npm run test:qa`
  - 9/9 passed

## 未解决问题

- `exitCode:<code>` 目前是直接面向 UI 展示的机器可读文本，未来可以增加 UI label formatter。
- 仍未实现真实 view-log / retry / terminate side effect。
- 仍未实现 attach/open terminal。
- 当前 P1.15 没有改变 action resolution 语义。

## 下一位 agent 需要知道的上下文

- 当前真实 API snapshot 已是 failed live session：
  - `state=failed`
  - `exitCode=7`
  - `endReason=exitCode:7`
  - active `error` event
- Desktop 已能展示 `End Reason`，无需新增 UI 字段。
- 推荐下一步是 P1.16：Real Action Resolution Smoke。
  - 用当前真实 failed event，在 UI 或 API 上触发 `ignore` action。
  - 验证 active event resolved，session 仍保留 failed + exit metadata。
