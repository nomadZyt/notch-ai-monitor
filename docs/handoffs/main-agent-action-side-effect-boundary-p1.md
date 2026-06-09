# Main Agent Handoff: P1.17 Action Side Effect Boundary

日期：2026-06-07  
Agent：Main Agent  
阶段：P1.17

## 本次目标

定义 P1 阶段 `retry` / `view-log` / `terminate` 等 action side effect 的安全边界，并用测试固定：

- P1 不执行真实进程控制。
- P1 中 `view-log` 保持 read-only/noop。
- `terminate` 必须先要求确认。
- 所有 process/navigation/clipboard effects 在 Manager 层都必须标记 `mocked: true`。

## 已完成内容

- 审查现有 action runtime：
  - Desktop 通过 ManagerClient 发 `notch.action.requested`。
  - Local Manager API 返回 `notch.action.result`。
  - Mock manager 内已有 `NOOP_ACTION_IDS`、`CONFIRMATION_ACTION_IDS`、mocked effects。
- 新增 P1 side effect 合同文档。
- 在 event protocol 和 local manager API contract 中引用 side effect 边界文档。
- 新增 local-manager-mock 测试覆盖 error action 边界：
  - `view-log` -> `noop`，event 保持 active，navigation effect mocked。
  - `terminate` 未确认 -> `needs_confirmation`，event 保持 active，process effect mocked。
  - `terminate` confirmed -> `completed`，event resolved，process effect mocked。
  - `retry` -> `completed`，event resolved，process effect mocked。

## 修改/新增文件

- 新增 `docs/contracts/action-side-effects-p1.md`
- 修改 `docs/contracts/event-protocol.md`
- 修改 `docs/contracts/local-manager-api.md`
- 修改 `packages/local-manager-mock/tests/mock-local-agent-manager.test.mjs`
- 新增 `docs/handoffs/main-agent-action-side-effect-boundary-p1.md`

## 关键决策

- P1 不接真实 `retry` / `terminate` side effect。
- P1 的 process effects 只作为 result feedback，必须 `mocked: true`。
- `view-log` 在 P1 保持 read-only/noop，不 resolve event。
- 真实 side effect 必须进入 P2 前另建 confirmation、权限、审计和失败反馈合同。

## 暴露的接口或数据结构

无新增 runtime API shape。

新增文档合同：

- `docs/contracts/action-side-effects-p1.md`

测试固定的 P1 语义：

- `view-log`: `status=noop`, event active
- `terminate` without confirmation: `status=needs_confirmation`, event active
- `terminate` with confirmation: `status=completed`, event resolved
- `retry`: `status=completed`, event resolved
- process/navigation effects: `mocked=true`

## 测试结果

- `npm run test -w @notch-ai-monitor/local-manager-mock`
  - 11/11 passed

## 未解决问题

- 还没有真实 log viewer。
- 还没有真实 retry/terminate。
- clipboard/navigation/process effects 仍是 Manager mocked feedback。

## 下一位 agent 需要知道的上下文

- P1.17 只定义安全边界，没有接真实 side effect。
- P1.18 推荐做 read-only `view-log` smoke / UI 验证，因为它符合安全边界且能补齐错误日志入口。
