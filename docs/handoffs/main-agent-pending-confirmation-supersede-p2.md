# Main Agent Handoff: Pending Confirmation Supersede P2

日期：2026-06-08
Agent：Main Agent
工作目录：`/Users/zhaiyongtao/vibeCoding/notch-ai-monitor`

## 本次目标

收口 pending action visibility 中同一 `eventId + actionId` 的旧 confirmation projection。修正 Browser QA 中看到的“等待确认”和“正在处理/已过期”同时出现在动作状态区块的问题。

## 已完成内容

- Manager pending projection 在写入非 `waiting_confirmation` action result 前，会移除同一 `eventId + actionId` 的旧 `waiting_confirmation` row。
- timeline、audit、action replay 事实不删除；只收口 Desktop 用户可见的 pending projection。
- API `/v1/action-requests` 现在只返回最新 actionable state，不再让 Desktop 同时显示旧 confirmation 和 confirmed request。
- 合同文档已记录 confirmation supersede 规则。
- Browser sanity 已验证 UI 二次确认 terminate 后只显示一条“正在处理”。

## 修改/新增文件

- `packages/local-manager-mock/src/mock-local-agent-manager.ts`
- `packages/local-manager-mock/tests/mock-local-agent-manager.test.mjs`
- `packages/local-manager-api/tests/local-manager-api.test.mjs`
- `docs/contracts/event-history-pending-actions-p2.md`
- `docs/contracts/local-manager-api.md`
- `docs/contracts/retry-terminate-p2.md`
- `docs/handoffs/main-agent-context-checkpoint-p2.md`
- `docs/handoffs/main-agent-pending-confirmation-supersede-p2.md`

## 关键决策

- 修在 Manager projection 层，而不是 Desktop UI 过滤。Desktop 仍只消费 Manager snapshot/read-only endpoints。
- supersede 只影响 pending visibility；不修改 process audit、timeline、shared protocol、EventQueue/StateMachine 或 real CLI adapter。
- 后续非 waiting 状态都可以 supersede 旧 waiting confirmation，包括 `in_progress`、`completed`、`failed`、`rejected`、`noop`、`expired`。

## 暴露接口或数据结构

没有新增接口或 shared type。行为规则是：

```text
needs_confirmation -> waiting_confirmation
confirmed accepted -> in_progress, supersedes old waiting_confirmation for same event/action
timeout sweep -> expired, still only one visible pending row for that event/action
```

## 测试结果

- `npm run test -w @notch-ai-monitor/local-manager-mock`：30/30 通过。
- `npm run test -w @notch-ai-monitor/local-manager-api`：29/29 通过。
- `npm run build`：通过。
- `npm run test:qa`：首轮既有 Session Hub history pagination 测试抖动；单条重跑通过；完整重跑 12/12 通过。
- in-app Browser sanity：临时 API `127.0.0.1:4318`，通过 UI 点击 terminate 二次确认，动作状态区块只显示 1 条“正在处理”，没有“等待确认”，console error 0。

## 未解决问题

- Session Hub history pagination E2E 仍偶发 flake；本轮没有修改该测试或 UI pagination 逻辑，因为单条和完整重跑均通过，且与 pending confirmation supersede 无直接关系。
- 若未来需要展示完整 action attempt history，应新增独立 timeline/audit view，而不是把 superseded confirmation 留在 pending visibility 中。

## 下一位 agent 需要知道的上下文

- 当前长期 API `4317` 可能仍是旧服务；本轮没有重启它。
- 临时 Browser sanity API `4318` 已停止。
- 下一步建议：重启长期 Local Manager API 到最新 build，并做 real CLI adapter / `notch-run` beta runtime smoke，验证 registration -> action -> pending projection -> completion/timeout 的真实链路。
