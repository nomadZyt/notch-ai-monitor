# Main Agent Handoff: P1.14 Failed Exit Smoke Fixture

日期：2026-06-07  
Agent：Main Agent  
阶段：P1.14

## 本次目标

补齐真实 wrapper 路径的失败退出 smoke fixture：

- 通过安全的本地 Node 命令制造非零退出码。
- 从 `notch-run` -> Local Manager API -> Desktop API client -> Notch UI 验证 failed lifecycle。
- 确认 `Session.state=failed` 与 `Session.exitCode=7` 可被持久化和展示。
- 记录 `endReason` 在当前 adapter 合同下的边界。

## 已完成内容

- 新增 `node-exit-7` smoke preset，命令为：
  - `node -e "console.error('Error: notch-run failure smoke'); process.exit(7)"`
- `notch-run-smoke` 支持 `expectedExitCode`，并按预期退出码验证：
  - `expectedExitCode=0` -> session 应为 `completed`
  - `expectedExitCode!=0` -> session 应为 `failed`
- smoke runner 在预期失败时恢复 `process.exitCode`，因此 `npm run smoke:failed` 自身会以成功结果结束。
- smoke 输出增加：
  - `expectedExitCode`
  - `sessionState`
  - `sessionExitCode`
- root workspace 与 `@notch-ai-monitor/cli-adapter-real` 增加 `smoke:failed` 脚本。
- real adapter 测试补齐：
  - preset 解析断言
  - expected failed child exit 断言
  - fake manager 对 `exitCode/reason` 的 session metadata 持久化模拟
- 真实 API smoke 已跑通，当前 API snapshot 处于：
  - `state=failed`
  - `exitCode=7`
  - active `error` event
- in-app browser 真实 UI 验收通过：
  - Notch shell：`data-state=glance`，`data-mood=sad`
  - 右胶囊：`失败`，`eventCount=1`，meta 包含 `真实 · 失败`
  - Session Hub：detail 显示 `STATE 失败`、`MODE 真实`、`EXIT CODE 7`

## 修改/新增文件

- 修改 `package.json`
  - 新增 root `smoke:failed`。
- 修改 `packages/cli-adapter-real/package.json`
  - 新增 workspace `smoke:failed`。
- 修改 `packages/cli-adapter-real/src/smoke/notch-run-smoke.ts`
  - 新增 `node-exit-7` preset。
  - 新增 `expectedExitCode` 合同。
  - 增强 live snapshot 验证。
- 修改 `packages/cli-adapter-real/tests/cli-adapter-real.test.mjs`
  - 新增 failed smoke 测试。
  - 扩展 fake manager 的 exit metadata 持久化。
- 新增 `docs/handoffs/main-agent-failed-exit-smoke-p1.md`

## 关键决策

- 失败 smoke 使用本地 Node fixture，不依赖真实 Codex/Claude/Qwen 二进制，因此安全、稳定、可重复。
- `smoke:failed` 验证 wrapper/manager/UI 合同，不把非零退出当成 smoke 命令自身失败。
- 不修改 `SessionEndedEnvelope` shape。
- 不把 exit metadata 放到 event evidence；`exitCode/endReason` 仍属于 session metadata。
- 当前 real wrapper 非零退出只发送 `exitCode`，不发送 `reason`。因此 Desktop detail 不显示 `End Reason` 是符合当前合同的。

## 暴露的接口或数据结构

新增/扩展的 smoke 层接口：

```ts
export interface NotchRunSmokeOptions {
  expectedExitCode: number;
}

export type NotchRunSmokePreset =
  | "node-result"
  | "node-exit-7"
  | "codex-version"
  | "claude-version";
```

`node-exit-7` preset contract：

- `profileId: "codex-cli"`
- `expectType: "error"`
- `expectedExitCode: 7`
- child command stderr 包含 `Error: notch-run failure smoke`

smoke JSON 输出新增字段：

- `expectedExitCode`
- `sessionState`
- `sessionExitCode`

## 测试结果

- `npm run test -w @notch-ai-monitor/cli-adapter-real`
  - 17/17 passed
- `npm test`
  - shared/local-manager/risk-policy/api/mock-adapter/real-adapter 全部通过
- `npm run build`
  - TypeScript packages + Desktop Vite production build 通过
- `npm run test:qa`
  - 9/9 passed
- `npm run smoke:failed`
  - passed
  - preset `node-exit-7`
  - `sessionState=failed`
  - `sessionExitCode=7`
  - active event type 为 `error`
- in-app browser 手工验收：
  - 首屏 failed/glance 验证通过
  - Session Hub detail `EXIT CODE 7` 验证通过
  - `END REASON` 不存在，符合当前 adapter 合同

## 未解决问题

- 非零退出码目前不会自动生成 `Session.endReason`。
- `reason` 仍只在 signal 结束路径产生，例如 `signal:SIGTERM`。
- Session Hub 仍没有 attach / open terminal / view logs 的真实操作。
- UI 左侧 tool stack 仍为静态视觉，不按真实 session tools 动态裁剪。

## 下一位 agent 需要知道的上下文

- P1.14 已经证明真实 failed exit path 能打通到 UI。
- 如果下一步要让 detail 对失败原因更明确，应先决定合同：
  - 是否把非零退出也映射为 `endReason = "exitCode:<code>"` 或更友好的 reason。
  - 或者保持 `exitCode` 与 `endReason` 分离，只在 signal/外部中断场景写 reason。
- 当前推荐下一步是 P1.15：Exit reason contract decision and implementation。
