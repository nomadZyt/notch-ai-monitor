# Main Agent Handoff: P2.4d Async Action Completion

日期：2026-06-08  
阶段：P2.4d  
工作目录：`/Users/zhaiyongtao/vibeCoding/notch-ai-monitor`

## 本次目标

补齐 process action 的异步闭环：`retry` / `terminate` 返回 `accepted` 后，Manager/API 后续能根据可靠完成信号自动更新 action result、audit 和 event 状态；adapter control 请求异步失败时不能静默吞掉。

边界：

- 不修改 shared model、shared protocol、EventQueue/StateMachine 或 Desktop UI 权限。
- Desktop 仍只发送 action request、展示 Manager/API 返回结果。
- `terminate` 仍只能走 graceful stop，不能按 PID kill，不能引入 `SIGKILL` / `kill -9`。

## 已完成内容

- `local-manager-mock` 新增内部 completion 入口 `completeAcceptedProcessAction()`。
- successful completion 会把同一 `requestId` 的 replay result 从 `accepted` 更新为 `completed`，并 resolve 原 active event。
- failed completion 会把同一 `requestId` 的 replay result 从 `accepted` 更新为 `failed`，追加 failed audit，原 event 保持 active。
- `LocalProcessSupervisor` 新增 pending terminate registry，只记录已经返回 `accepted` 的 graceful terminate。
- local child close 或 adapter/session ended 会触发 pending terminate 的 successful completion。
- adapter control HTTP 4xx/5xx、`ok:false`、`status:"failed"` / `status:"rejected"` 或网络错误会触发 failed completion。
- Local Manager API 的 `notch.session.ended` 处理现在同时负责 session end、ownership inactive 和 pending action completion 桥接。
- 合同文档补充 P2.4d async completion 语义。

## 修改/新增文件

- `packages/local-manager-mock/src/mock-local-agent-manager.ts`
- `packages/local-manager-mock/src/index.ts`
- `packages/local-manager-mock/tests/mock-local-agent-manager.test.mjs`
- `packages/local-manager-api/src/local-process-supervisor.ts`
- `packages/local-manager-api/src/local-manager-api.ts`
- `packages/local-manager-api/tests/local-manager-api.test.mjs`
- `docs/contracts/retry-terminate-p2.md`
- `docs/contracts/local-manager-api.md`
- `docs/handoffs/main-agent-context-checkpoint-p2.md`
- `docs/handoffs/main-agent-async-action-completion-p2.md`

## 关键决策

- P2.4d 不新增外部 protocol envelope；completion 是 Manager/API 内部能力。
- adapter control endpoint 的 202/200 只表示 graceful stop request 已被 adapter 接受，不自动 resolve event。
- event auto-resolution 等待 `notch.session.ended` 或 supervisor 持有 child 的 close 信号。
- adapter control 请求失败时，event 保持 active；用户仍可重新选择安全动作。
- failed completion 会替换同一 `requestId` 的 replay result，避免后续重放仍看到旧 `accepted`。

## 暴露的接口或数据结构

`@notch-ai-monitor/local-manager-mock` 新增导出：

```ts
interface ProcessActionCompletionInput {
  requestId?: string;
  eventId?: string;
  sessionId: string;
  actionId: "retry" | "terminate";
  status: "completed" | "failed";
  message: string;
  completedAt?: ISODateTimeString;
  target?: string;
  resolution?: string;
  reason?: string;
  errorCode?: string;
}
```

`MockLocalAgentManager.completeAcceptedProcessAction(input)`：

- 找到匹配的 accepted process action audit。
- 返回新的 `ActionResultPayload`，找不到匹配 audit/event 时返回 `null`。
- `completed` 会 resolve active event。
- `failed` 不 resolve event。

`LocalProcessSupervisor.handleSessionEnded(sessionId, end)`：

- API/本地 child close 用于通知 supervisor 检查 pending terminate。
- 有 pending terminate 时调用 Manager completion callback。

## 测试结果

- `npm run test -w @notch-ai-monitor/local-manager-mock`：24/24 通过。
- `npm run test -w @notch-ai-monitor/local-manager-api`：16/16 通过。
- `npm run test -w @notch-ai-monitor/cli-adapter-real`：21/21 通过。
- `npm run build:app -w @notch-ai-monitor/desktop`：通过。
- `npm run test:qa`：10/10 通过。
- `git diff --check`：通过。
- `rg` 检查：未新增 `SIGKILL` / `kill -9` / 按 PID terminate；实现里仍只有既有 `child.kill("SIGTERM")` graceful stop。
- API smoke：adapter control accepted + `notch.session.ended` 后 event 自动 `resolved / terminate_graceful_completed`，activeEvents 为 0。
- API failure smoke：adapter control 500 后同 requestId replay 返回 `failed / adapter_control_rejected`，event 保持 active。
- in-app browser API mode：页面显示 quiet “全部安静 / 0”，console error 0。

## 未解决问题

- P2.4d 目前只把 completion 结果写入 Manager replay/audit/snapshot；没有新增单独的 async action-result SSE。
- failed completion 的用户可见即时反馈仍依赖当前 UI action result/replay 机制和后续产品化设计。
- 多个不同 requestId 对同一 active terminate 的并发策略还未收紧；当前锁定的是同一 requestId replay 不重复触发。

## 下一位 agent 需要知道的上下文

- P2.4d 不改变 Desktop 解耦原则；Desktop 不应调用 `/v1/process/registrations`、不应读持久化文件、不应直接控制进程。
- P2.5 可以基于现有 session/action 状态做 Session Hub，但不要把 process supervisor 细节泄漏进 UI。
- 如果继续深挖 P2.4，下一步可以设计 async action-result push 或 pending action visibility，但应先定 shared/UI 合同。
