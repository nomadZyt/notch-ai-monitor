# Main Agent Handoff: P1.19 Final Acceptance

日期：2026-06-07  
Agent：Main Agent  
阶段：P1.19

## 本次目标

完成 P1 技术 Spike 的最终验收：

- 跑完整测试、构建、QA 与真实 smoke。
- 验证 completed/failed/action resolve/view-log 主路径。
- 确认 API 与 Desktop UI 最终状态一致。
- 记录 P1 边界和下一阶段入口。

## 已完成内容

- 完整执行 P1 验收命令：
  - workspace unit/integration tests。
  - workspace build。
  - desktop Playwright QA。
  - live `notch-run` completed smoke。
  - live failed exit smoke。
  - read-only `view-log` smoke。
  - action resolve `ignore` smoke。
- 复核 P1.17-P1.18 代码：
  - `view-log` 只在 Manager action 合同与 smoke 层定义为 `noop`。
  - Desktop UI 仍只通过 Manager API 读 snapshot/action result。
  - CLI adapter 不直接暴露 UI 状态，不触碰 Notch 组件。
- 验证最终 API snapshot：
  - `activeEvents=0`
  - `currentEventId=null`
  - failed live session 仍保留 `exitCode=7` 与 `endReason=exitCode:7`
  - error event 已被 `ignore` action 标记为 `ignored`
- 验证 in-app browser：
  - API mode URL 正常加载。
  - quiet state 为 `dormant` / `none`。
  - `eventCount=0`，alert title 为 `全部安静`。
  - 左胶囊可打开 Session Hub。
  - Session Detail 显示 `0 待处理事件`、`State 失败`、`Mode 真实`、`Exit Code 7`、`End Reason exitCode:7`。
  - browser console 无 error。

## 修改/新增文件

- 新增 `docs/handoffs/main-agent-p1-final-acceptance.md`
- 修改 `docs/handoffs/main-agent-context-checkpoint-p1.md`

本阶段没有新增 runtime 功能代码，主要是 final acceptance、checkpoint 与 handoff 收口。

## 关键决策

- P1 收口定义为技术 Spike 完成，不定义为完整产品完成。
- 最终 snapshot 停在 quiet state，便于下一阶段从稳定状态继续。
- `view-log` 在 P1 保持 read-only/noop；真实打开日志文件或 terminal attach 放到下一阶段。
- `retry` / `terminate` 等 process side effect 继续保持 mocked，直到 P2 设计权限、安全和真实进程控制合同。

## 暴露的接口或数据结构

P1 最终稳定入口：

- API:
  - `GET /health`
  - `GET /v1/snapshot`
  - `GET /v1/events`
  - `POST /v1/envelopes`
  - `POST /v1/debug/reset`
- root smoke:
  - `npm run smoke:notch-run`
  - `npm run smoke:failed`
  - `npm run smoke:view-log`
  - `npm run smoke:resolve`
- UI API mode:
  - `http://127.0.0.1:5174/?manager=api&managerUrl=http%3A%2F%2F127.0.0.1%3A4317`

Final snapshot contract:

- resolved/ignored event 不出现在 `activeEventIds`。
- `counts.activeEvents=0` 时 `currentEventId=null`。
- session 可以是 `failed`，但只要没有 active event，Notch resting state 是 `dormant`。
- failed session metadata 保留在 Session Hub detail。

## 测试结果

通过：

- `npm test`
- `npm run build`
- `npm run test:qa`
- `npm run smoke:notch-run`
- `npm run smoke:failed`
- `npm run smoke:view-log`
- `npm run smoke:resolve`
- `curl http://127.0.0.1:4317/v1/snapshot`
- in-app browser final check

当前服务：

- Local Manager API：`http://127.0.0.1:4317`，PID `67138`
- Desktop Vite：`http://127.0.0.1:5174`，PID `67996`

## 未解决问题

- `exitCode:<code>` 仍是机器可读字符串，UI 尚无本地化 formatter。
- `view-log` 还不打开真实日志文件。
- `retry` / `terminate` 的真实 process side effect 尚未接入。
- Session Hub 暂无 attach terminal / open source window。
- 左侧 tool stack 仍是静态图标，未按真实 session tools 动态裁剪。
- 当前 workspace 有大量未跟踪文件和旧 prototype 删除状态，尚未做 git commit/分支收敛。

## 下一位 agent 需要知道的上下文

- P1 技术 Spike 已完成，验证链路是：
  `notch-run child process -> real CLI adapter -> Local Manager API -> EventQueue/StateMachine -> Desktop API client -> Notch UI -> action envelope -> event ignored/noop`
- 当前最终 API snapshot 是 quiet：
  - session `state=failed`
  - session `sourceMode=live`
  - session `exitCode=7`
  - session `endReason=exitCode:7`
  - event `status=ignored`
  - `activeEvents=0`
- 下一阶段建议先做 P1+ 或 P2.1：
  - P1+：状态持久化、用户偏好、UI polish、可访问性回归。
  - P2.1：真实 action side effects，尤其是 `view-log` 的安全文件打开合同和 `retry`/`terminate` 的进程控制合同。
