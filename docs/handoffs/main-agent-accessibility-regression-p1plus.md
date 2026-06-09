# Main Agent Handoff: P1+.6 Accessibility Regression

日期：2026-06-08  
Agent：Main Agent  
阶段：P1+.6

## 本次目标

完成 P1+ 最终收口段：补齐 Desktop 展示层的基础可访问性语义，并把关键 ARIA 状态固化进 QA。

本轮只改 Desktop UI 语义与测试，不修改 shared model、API、protocol、EventQueue/StateMachine、Manager action 合同或 real CLI adapter。

## 已完成内容

- 左/右 Notch 胶囊按钮新增 `aria-haspopup="dialog"`，明确点击会展开面板。
- `#sessionsPanel` 新增：
  - `role="dialog"`
  - `aria-modal="false"`
  - `aria-labelledby="sessionsPanelTitle"`
  - 初始 `aria-hidden="true"`
- `#actionPanel` 新增：
  - `role="dialog"`
  - `aria-modal="false"`
  - `aria-labelledby="eventPanelTitle"`
  - 初始 `aria-hidden="true"`
- Desktop render 随 `shellState/panel` 同步：
  - 左/右胶囊 `aria-expanded`
  - 两个 panel 的 `aria-hidden`
- Session Hub row 新增：
  - `aria-current`
  - 中文 `aria-label`，包含会话名、接入方式、运行状态、待处理事件数
- Action panel session tab 新增：
  - `aria-current`
  - 中文 `aria-label`，包含会话名和待处理事件数
- 更新 mock P0 QA 和 API client smoke，覆盖 action panel、Session Hub、当前选中项、quiet preference toggle 的 ARIA 状态。

## 修改/新增文件

- 修改 `apps/desktop/src/app/app-shell.ts`
- 修改 `apps/desktop/tests/e2e/p0-smoke.spec.mjs`
- 修改 `apps/desktop/tests/e2e/api-client-smoke.spec.mjs`
- 修改 `docs/handoffs/main-agent-context-checkpoint-p1.md`
- 新增 `docs/handoffs/main-agent-accessibility-regression-p1plus.md`

## 关键决策

- 使用非模态 dialog 语义：当前面板是 Notch 内展开层，不阻塞页面其他区域，因此 `aria-modal="false"`。
- `aria-hidden` 由 Desktop render 统一同步，避免静态属性与 UI state  drift。
- 对 session row / action tab 使用 `aria-current` 表达当前项，而不是引入新的 listbox/tabpanel 交互模型。
- 不做 focus trap、不新增键盘导航模型；P1+ 只固化已有交互的可读语义，复杂焦点管理留给后续完整产品化设计。

## 暴露的接口或数据结构

没有新增 API、protocol、shared model、Manager 数据结构或 localStorage 字段。

新增/稳定的是 Desktop DOM 语义 contract：

- `#sessionsPanel[role="dialog"][aria-labelledby="sessionsPanelTitle"]`
- `#actionPanel[role="dialog"][aria-labelledby="eventPanelTitle"]`
- `#sessionsPanel` / `#actionPanel` 的 `aria-hidden` 随 panel 状态切换
- session row / action tab 的 `aria-current`

## 测试结果

通过：

- `npm run build:app -w @notch-ai-monitor/desktop`
- `npm run test:qa`（10/10）
- `curl http://127.0.0.1:4317/health`
- `curl http://127.0.0.1:4317/v1/snapshot`

说明：

- QA 首轮有 1 个失败，是测试期望误写 fixture 名称 `Qwen Code`；实际 fixture/DOM 是 `Qwen CLI`。修正断言后完整 QA 10/10 通过。
- 当前服务仍在：
  - Local Manager API：`http://127.0.0.1:4317`，PID `16864`
  - Desktop Vite：`http://127.0.0.1:5174`，PID `17975`
- 当前主 API snapshot 为空 quiet：
  - `sessions=0`
  - `activeSessions=0`
  - `activeEvents=0`
  - `currentEventId=null`
- in-app browser API mode 验证：
  - `data-state=dormant`
  - `data-mood=none`
  - `data-panel=none`
  - `eventCount=0`
  - `alertTitle=全部安静`
  - `sessionHubTitle=0 个会话`
  - `sessionsPanel/actionPanel role=dialog`
  - `sessionsPanel/actionPanel aria-hidden=true`
  - browser console error：0
- in-app browser mock mode 验证：
  - action panel 展开后 `actionPanel aria-hidden=false`
  - `rightCapsule aria-expanded=true`
  - selected action tab `aria-current=true`
  - selected action tab `aria-label=Qwen CLI，2 个待处理事件`
  - Session Hub 展开后 `sessionsPanel aria-hidden=false`
  - selected session row `aria-current=true`
  - selected session row `aria-label=Qwen CLI，演示数据，等待确认，2 个待处理事件`
  - `quietAllBtn aria-pressed=false`
  - browser console error：0

## 未解决问题

- 未实现完整 focus trap 或 roving tabindex；当前只稳定已有 panel focus 与 ARIA 状态。
- Session Hub 暂无 “查看事件” 或 “Attach/打开终端” 操作。
- 左侧 tool stack 仍是静态图标，未按实际 session tools 动态裁剪。
- `quietNormalRuns` 仍只是本地 UI preference，未接入 event 过滤、入队或通知策略。
- `view-log` / `retry` / `terminate` 的真实 side effect 仍未实现。

## 下一位 agent 需要知道的上下文

- P1 技术 Spike 与 P1+ UI polish 已完成，可以进入 P2。
- P2 建议从真实 action side effect 合同开始，优先设计 read-only `view-log` 的安全打开日志路径，再考虑 `retry` / `terminate`。
- 继续保持边界：Desktop UI 不直接操作 CLI 进程；真实进程控制应通过 Manager/adapter 明确合同暴露。
- 如果继续做产品化 polish，可以单独开 P2/P3 任务处理 focus trap、动态 tool stack、Session Hub 操作入口。
