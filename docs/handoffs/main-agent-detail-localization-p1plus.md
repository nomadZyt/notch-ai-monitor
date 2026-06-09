# Main Agent Handoff: P1+.2 Detail Localization

日期：2026-06-07  
Agent：Main Agent  
阶段：P1+.2

## 本次目标

在 P1+.1 的来源/状态语义澄清之后，继续处理 Session Detail 的展示质量：

- 将 detail 中英混排字段改为中文。
- 将 `exitCode:<code>` 这类机器字符串格式化为用户可读文案。
- 保持 API/protocol/model 不变。

## 已完成内容

- 新增 UI formatter：
  - `formatExitCode(0)` -> `正常退出 (0)`
  - `formatExitCode(7)` -> `进程退出码 7`
  - `formatEndReason("exitCode:7")` -> `进程以退出码 7 结束`
  - `formatEndReason("signal:SIGTERM")` -> `进程收到信号 SIGTERM`
  - `formatEndReason("child exited")` -> `子进程已退出`
- 将 Session Detail 字段本地化：
  - `Source` -> `来源`
  - `PID` -> `进程 ID`
  - `Started` -> `开始时间`
  - `Last Active` -> `最近活动`
  - `Exit Code` -> `退出码`
  - `End Reason` -> `结束原因`
  - `Project` -> `项目`
  - `CWD` -> `工作目录`
  - `Window` -> `窗口`
  - `Tab` -> `标签页`
- 将 Event facts 字段本地化：
  - `Type` -> `类型`
  - `Session` -> `会话`
  - `Source` -> `来源`
  - `Time` -> `时间`
- 更新 QA：
  - completed session 验证 `正常退出 (0)`。
  - failed session 验证 `exitCode:1` 格式化为 `进程以退出码 1 结束`。
  - running quiet detail 验证中文字段存在。
- 用当前真实 API snapshot 验证：
  - row 仍显示 `Terminal · 真实接入 · cli-adapter-real · 运行失败`
  - detail 显示 `退出码进程退出码 7`
  - detail 显示 `结束原因进程以退出码 7 结束`

## 修改/新增文件

- 修改 `apps/desktop/src/app/app-shell.ts`
- 修改 `apps/desktop/tests/e2e/api-client-smoke.spec.mjs`
- 修改 `docs/handoffs/main-agent-context-checkpoint-p1.md`
- 新增 `docs/handoffs/main-agent-detail-localization-p1plus.md`

## 关键决策

- formatter 留在 Desktop 展示层，不改 shared model；`Session.endReason` 继续保留机器可读值。
- 对未知 `endReason` 保持原文展示，避免错误翻译或丢失诊断信息。
- 只做展示质量，不接真实 `view-log` / `retry` / `terminate` side effect。

## 暴露的接口或数据结构

没有新增 API、protocol 或持久化字段。

新增展示层 helper：

- `formatExitCode(exitCode: number): string`
- `formatEndReason(reason: string): string`

## 测试结果

通过：

- `npm run build:app -w @notch-ai-monitor/desktop`
- `npm run test:qa`（9/9）
- `curl http://127.0.0.1:4317/v1/snapshot`
- in-app browser 验收真实 API mode：
  - detail：`退出码进程退出码 7`
  - detail：`结束原因进程以退出码 7 结束`
  - quiet state：`dormant / none / eventCount 0`
  - browser console error：0

当前服务仍在：

- Local Manager API：`http://127.0.0.1:4317`，PID `67138`
- Desktop Vite：`http://127.0.0.1:5174`，PID `67996`

## 未解决问题

- Event type value 仍使用 protocol raw type，例如 `error` / `result`，只是字段名已改为 `类型`。
- `Terminal`、project name、cwd 等值仍是数据原文，不做翻译。
- 真实 `view-log` / `retry` / `terminate` side effect 仍未实现。
- 当前 workspace 仍有大量 untracked 文件，`git diff` 无法展示这些新项目文件的内容差异。

## 下一位 agent 需要知道的上下文

- P1+.2 是纯展示层改动，API snapshot 和数据模型未变。
- 当前真实 snapshot 仍是 P1 final acceptance 留下的 quiet snapshot：
  - failed live session 保留 `exitCode=7` / `endReason=exitCode:7`
  - error event 已 ignored
  - `activeEvents=0`
- 下一步如果继续 P1+，建议处理 event type/value 文案和偏好/持久化；如果进入 P2，则先设计真实 `view-log` 的安全文件打开合同。
