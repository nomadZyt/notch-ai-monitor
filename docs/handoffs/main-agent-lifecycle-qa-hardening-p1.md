# Main Agent P1.9 Lifecycle QA Hardening Handoff

日期：2026-06-07  
Agent：Main Agent  
阶段：P1.9 Lifecycle QA Hardening  
工作目录：`/Users/zhaiyongtao/vibeCoding/notch-ai-monitor`

## 1. 本次目标

- 补齐 P1.8 handoff 中明确暴露的 lifecycle UI QA 缺口。
- 用真实 Local Manager API 通道验证 `running/no-event` 和 `failed` 两个 session lifecycle 状态。
- 不修改 CLI adapter、Manager API 或 UI 协议，只增加稳定的 Playwright 验收。

## 2. 已完成内容

- 新增 `running` live session 且无 active event 的 quiet lifecycle E2E：
  - 通过 `notch.session.upserted` envelope 注入 live running session。
  - 验证 UI 保持 `data-state="dormant"`、`data-mood="none"`。
  - 验证 Session Hub meta 为 `1 活跃 · 0 事件`，右胶囊显示 `全部安静`。
  - 验证 API snapshot 的 `counts.activeSessions=1` 和 `counts.activeEvents=0`。
- 新增 `failed` live session lifecycle E2E：
  - 通过 `notch.session.upserted`、`notch.event.created`、`notch.session.ended` envelope 构造失败会话。
  - 验证 UI 进入 `glance`/`sad`，Session Hub meta 为 `0 活跃 · 1 已结束 · 1 事件`。
  - 验证 Session Hub row、Action panel meta、event facts 都显示 `失败` lifecycle state。
  - 验证 error event 的 log excerpt 渲染到事件详情。
- API client smoke 从 3 条扩展到 5 条；`npm run test:qa` 从 7 条扩展到 9 条。

## 3. 修改/新增文件

| 文件 | 类型 | 说明 |
| --- | --- | --- |
| `apps/desktop/tests/e2e/api-client-smoke.spec.mjs` | 修改 | 新增 running/no-event 和 failed lifecycle API-client E2E |
| `docs/handoffs/main-agent-lifecycle-qa-hardening-p1.md` | 新增 | 本 handoff |

## 4. 关键决策

- `running/no-event` 是安静态，不主动唤醒 Notch：UI 只通过 session count/meta 表达活跃会话。
- `failed` lifecycle 需要有 active error event 才唤醒右胶囊；测试覆盖的是 “失败会话 + 未处理错误事件”。
- 测试继续使用 `createLocalManagerApi()` 的临时端口，不依赖全局 `127.0.0.1:4317` dev API，避免跨测试污染。
- 不新增 shared fixture helper，先保持测试局部可读；等 API-client lifecycle 场景继续增加时再抽 `postSessionLifecycle()`。

## 5. 暴露的接口或数据结构

- 没有新增生产接口。
- 测试继续依赖已有协议 envelope：
  - `notch.session.upserted`
  - `notch.event.created`
  - `notch.session.ended`
- UI 验收点：
  - `#desktop[data-state][data-mood]`
  - `#sessionHubTitle`
  - `#sessionHubMeta`
  - `#alertTitle`
  - `#alertMeta`
  - `#eventPanelMeta`
  - `#eventBody`

## 6. 测试结果

- `npm run build:app -w @notch-ai-monitor/desktop`：通过。
- `npx playwright test -c apps/desktop/tests/playwright.config.mjs apps/desktop/tests/e2e/api-client-smoke.spec.mjs`：通过，5/5。
- `npm test`：通过。
- `npm run build`：通过。
- `npm run test:qa`：通过，9/9。

## 7. 未解决问题

- Quiet session 下左侧 Session Hub 仍不可展开；如果产品希望 “无事件也可查看运行中的 CLI session”，需要单独做 UX/StateMachine 决策。
- UI 仍不显示 session exit code、signal 或 ended reason；failed 测试只验证 lifecycle state 和事件证据。
- 未做视觉截图基线更新；本次没有 UI 代码改动。

## 8. 下一位 agent 需要知道的上下文

- 当前 lifecycle QA 已覆盖 `running/no-event`、`completed/result`、`failed/error` 三条主路径。
- 后续如果继续 P1，建议进入 “无事件 Session Hub 可访问性/展开策略” 或 “真实 CLI attach/PTY 交互策略”，不要把这两件事混在一个任务里。
- 当前本地 dev API/desktop 服务可能仍保留上一轮 `smoke:notch-run` 的 live completed result 数据；新增 Playwright 测试不依赖该全局服务。
