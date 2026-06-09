# Main Agent Handoff: P2 Real Link Beta Smoke

日期：2026-06-08  
阶段：P2 real-world beta smoke  
主线：Local Manager API 4317 最新 build + real CLI adapter / notch-run 真实链路验收

## 本次目标

重启长期 Local Manager API `http://127.0.0.1:4317` 到最新 build，并用 real CLI adapter / `notch-run` 跑真实链路：

1. registration
2. action request
3. pending action projection
4. completion
5. timeout projection

边界保持不变：

- Desktop 继续只消费 Manager API snapshot/read-only endpoints。
- 不让 Desktop 直接操作 CLI 进程或 persistence file。
- 不新增 retry / terminate 产品 side effect。
- 产品 terminate 仍只走 adapter control / supervisor 的 graceful stop。
- 不按 PID 实现产品级 kill。

## 已完成内容

- 已运行 `npm run build`，最新 dist build 通过。
- 已用 SIGTERM 停止旧 4317 PID `23610`。
- 已用最新 build 重启长期 4317：
  - PID：`91452`
  - URL：`http://127.0.0.1:4317`
  - 参数：`--process-side-effects supervised --event-history-persistence-file /tmp/notch-event-history-p2.json --pending-action-sweep-interval-ms 30000`
  - `/health` 返回 ok。
- Desktop Vite 仍在：
  - URL：`http://127.0.0.1:5174`
  - PID：`94874`
- 内置 real adapter smoke 已通过：
  - `npm run smoke:failed`
  - 结果确认 `processRegistration.status=registered`
  - adapter control enabled
  - live session exitCode=7
  - active error event 存在
- 真实 completion smoke 已通过：
  - 启动长运行 `notch-run` wrapper child。
  - 子进程输出 `Error: beta terminate smoke active` 生成 active error event。
  - 未确认 `terminate` 返回 `needs_confirmation`，pending 为 `waiting_confirmation`。
  - confirmed `terminate` 返回 `accepted`，effect `mocked:false`，pending 为单条 `in_progress`。
  - 子进程收到 adapter control graceful SIGTERM 后 exit 0。
  - `notch.session.ended` 将原 event resolve 为 `terminate_graceful_completed`。
  - `/v1/action-requests?eventId=...` 返回单条 `completed` pending action。
- 真实 timeout projection smoke 已通过：
  - 第一次 8 秒延迟子进程因人工窗口错过，走了正常 completion，不计入 timeout 结论。
  - 第二次改为 30 秒延迟，并用脚本连续执行 confirmed terminate + debug sweep。
  - real adapter control 返回 `accepted`，pending 先为 `in_progress/mocked:false`。
  - 调 `POST /v1/debug/expire-pending-actions`，传未来 `at`。
  - 返回 `expiredCount=1`，pending 变为 `expired/resultStatus=failed`。
  - 原 event 保持 `active`。
  - late `notch.session.ended` 未把 expired pending 反改为 completed。
- Browser QA 已通过：
  - 打开 `http://127.0.0.1:5174/?manager=api&managerUrl=http%3A%2F%2F127.0.0.1%3A4317`
  - 展开 Session Hub。
  - UI 显示 `1 个会话 · 0 活跃 · 1 已结束 · 1 事件`。
  - “动作状态”显示 1 条“已过期 / 终止旧服务 / 动作等待完成超时，尚未收到可信完成信号”。
  - “事件历史”仍保留 active error event。
  - console error 0。

## 修改 / 新增文件

- 更新：`docs/handoffs/main-agent-context-checkpoint-p2.md`
  - 新增第 25 节 Real Link Beta Smoke 工作日志。
- 新增：`docs/handoffs/main-agent-real-link-beta-smoke-p2.md`
  - 本 handoff。

本轮 beta smoke 没有新增 TypeScript runtime 代码；runtime 功能来自前序 P2 scheduler / pending projection / adapter control 工作。

## 关键决策

- 长期 4317 重启使用 SIGTERM 停旧开发服务；这不是产品 terminate 行为。
- 4317 显式启用 scheduler：`--pending-action-sweep-interval-ms 30000`。
- completion smoke 用真实 `notch-run` wrapper child + adapter control graceful stop。
- timeout smoke 不等待默认 5 分钟 timeout；因为 API 目前只公开 sweep interval，没有公开短 pending timeout 启动参数。
- timeout projection 使用 debug-only `/v1/debug/expire-pending-actions` 推进 `at`，但 accepted pending 仍来自真实 adapter/control 链路。
- 保留最终 runtime 状态为 timeout smoke 终态，方便 UI/后续 agent 直接看到 expired pending action。

## 暴露接口 / 数据结构

本轮没有新增接口或数据结构。

本轮实际使用的现有接口：

- `GET /health`
- `GET /v1/snapshot`
- `GET /v1/action-requests`
- `GET /v1/event-history`
- `POST /v1/envelopes`
- `POST /v1/debug/reset`
- `POST /v1/debug/expire-pending-actions`
- `POST /v1/process/registrations`
- adapter control `POST /v1/control/terminate-gracefully`

## 测试和验证结果

- `npm run build`：通过。
- `npm run smoke:failed`：通过。
- real completion smoke：通过。
- real timeout projection smoke：通过。
- Browser API mode Session Hub：通过，console error 0。
- 当前 API snapshot 终态：
  - sessions：1
  - activeSessions：0
  - activeEvents：1
  - session：`completed`, `sourceMode=live`, `exitCode=0`
  - event：active error, summary `Error: beta timeout smoke active long`
  - pending：`beta-timeout-smoke-long-terminate-confirmed`, `expired`, `resultStatus=failed`, `mocked=false`, `errorCode=pending_action_timeout`

## 未解决问题

- API 暂无公开 `pendingActionTimeoutMs` env/CLI option；真实 timeout smoke 若要完全靠 scheduler 自然过期，需要等默认 5 分钟，或后续设计 test-only/opt-in timeout 配置。
- `npm run test:qa` 在前序阶段曾有 Session Hub history pagination flake，但本轮没有再改该测试；前序已单条和完整重跑通过。
- 本轮只做 smoke 和 handoff，没有把真实链路 smoke 封装成可重复的一键脚本。

## 下一位 agent 需要知道

- 当前长期 4317 正在运行最新 build，PID `91452`，scheduler enabled `30000ms`。
- 当前 Desktop Vite 仍在 5174，PID `94874`。
- 当前 Browser 停在 API mode Session Hub 展开状态，连接 4317。
- 当前 API 状态保留 timeout smoke 终态，适合继续 UI 验收 expired pending action。
- 如要回到干净状态，可调用：

```bash
curl -fsS -X POST http://127.0.0.1:4317/v1/debug/reset
```

- 如果要继续 beta hardening，建议把本次手工 completion/timeout smoke 封装成 repo 内 QA 脚本，并决定是否需要公开 opt-in `pendingActionTimeoutMs` test/dev 配置。
