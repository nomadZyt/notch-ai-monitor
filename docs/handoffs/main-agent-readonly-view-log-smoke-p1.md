# Main Agent Handoff: P1.18 Read-only View Log Smoke

日期：2026-06-07  
Agent：Main Agent  
阶段：P1.18

## 本次目标

把 P1.17 定义的 read-only `view-log` 边界固化为真实 smoke 和 UI 验收：

- 基于真实 failed event 触发 `view-log`。
- 验证 action result 为 `noop`。
- 验证 event 保持 active，不清空队列。
- 验证 session failed exit metadata 不变。
- 验证 UI feedback 可见。

## 已完成内容

- 扩展 `notch-action-smoke`：
  - 默认 `ignore` 仍验证 completed/ignored。
  - `--action view-log` 验证 noop/active。
- 新增 root `npm run smoke:view-log`。
- fake Manager API 测试支持 non-resolving action 的 `noop` result。
- 新增 real adapter 测试：
  - `view-log` parser expectations。
  - `view-log` smoke 保持 active event。
- 真实 `npm run smoke:view-log` 通过：
  - 先准备 `node-exit-7` failed fixture。
  - 再触发 `view-log`。
  - action result 为 `noop`。
  - event 仍是 `active`。
- in-app browser 验证：
  - 点击 `view-log` 后 live region 显示 `已模拟动作：查看日志`。
  - Action panel 仍显示错误日志 excerpt。
  - `eventCount=1`，事件未被 resolve。

## 修改/新增文件

- 修改 `packages/cli-adapter-real/src/smoke/action-resolution-smoke.ts`
  - 参数化 expected action result/event status。
  - 支持 `view-log` noop smoke。
- 修改 `packages/cli-adapter-real/package.json`
  - 新增 `smoke:view-log`。
- 修改 `package.json`
  - 新增 root `smoke:view-log`。
- 修改 `packages/cli-adapter-real/tests/cli-adapter-real.test.mjs`
  - fake Manager API 支持 noop action result。
  - 新增 `view-log` smoke 测试。
- 新增 `docs/handoffs/main-agent-readonly-view-log-smoke-p1.md`

## 关键决策

- `view-log` 在 P1 是 read-only/noop，不打开真实文件、不聚焦终端。
- `view-log` 不 resolve event，因为用户只是查看上下文，还没有处理错误。
- `notch-action-smoke` 保持一个入口，通过 action id 决定 expected contract，避免重复 smoke 框架。

## 暴露的接口或数据结构

新增脚本：

```sh
npm run smoke:view-log
```

`notch-action-smoke --action view-log` 预期：

- `resultStatus=noop`
- `resolvedEventStatus=null`
- `eventStatus=active`
- `activeEvents=1`
- `sessionState=failed`
- `sessionExitCode=7`
- `sessionEndReason=exitCode:7`

## 测试结果

- `npm run test -w @notch-ai-monitor/cli-adapter-real`
  - passed
- `npm run smoke:view-log`
  - passed
- in-app browser 手工验收：
  - `view-log` 点击后 UI feedback 可见。
  - event count 保持 1。
  - API snapshot event 保持 `active`。

## 未解决问题

- 还没有真实 log file/path 打开。
- action panel 只是展示 event evidence 里的 `logExcerpt`。
- `view-log` 未来如接真实文件，需要 P2 权限和路径安全合同。

## 下一位 agent 需要知道的上下文

- 当前 API snapshot 是 active failed event：
  - session `state=failed`
  - session `exitCode=7`
  - session `endReason=exitCode:7`
  - event `status=active`
  - `activeEvents=1`
- P1.19 可以做 final acceptance；如需要最终 quiet snapshot，可在 final acceptance 中跑 `smoke:resolve` 收尾。
