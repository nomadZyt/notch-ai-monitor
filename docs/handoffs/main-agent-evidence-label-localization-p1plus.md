# Main Agent Handoff: P1+.4 Evidence Label Localization

日期：2026-06-08  
Agent：Main Agent  
阶段：P1+.4

## 本次目标

继续 P1+ UI 文案本地化，把 Action panel 的 Evidence grid 标签从英文改为中文：

- `Reason` -> `原因`
- `Impact` -> `影响范围`
- `Origin` -> `证据来源`
- `Rollback` -> `回滚方式`
- `Log` -> `日志`

本轮只改 Desktop 展示层，不修改 shared model、API、protocol、EventQueue/StateMachine 或 real CLI adapter。

## 已完成内容

- 将 `renderEventBody()` 中 Evidence grid 的可见标签改为中文。
- 保持 evidence 字段值原样展示，不翻译 `evidence.reason/impact/origin/rollback/logExcerpt` 的内容。
- 保持 CSS class、DOM 结构、action button 和 manager client 行为不变。
- 更新 Desktop QA：
  - mock risk event 覆盖 `原因` / `影响范围` / `证据来源` / `回滚方式`。
  - mock error event 覆盖 `日志`。
  - API result/error lifecycle 覆盖中文 evidence 标签。
  - 断言旧英文 `Reason` / `Impact` / `Log` 不再出现在对应 event body 中。

## 修改/新增文件

- 修改 `apps/desktop/src/app/app-shell.ts`
- 修改 `apps/desktop/tests/e2e/p0-smoke.spec.mjs`
- 修改 `apps/desktop/tests/e2e/api-client-smoke.spec.mjs`
- 修改 `docs/handoffs/main-agent-context-checkpoint-p1.md`
- 新增 `docs/handoffs/main-agent-evidence-label-localization-p1plus.md`

## 关键决策

- 只本地化标签，不改 evidence 数据内容，避免丢失诊断原文。
- `Origin` 译为 `证据来源`，避免与 Event facts 里的 `来源` 混淆。
- `Impact` 译为 `影响范围`，比单字 `影响` 更贴合当前 evidence 内容。
- `Rollback` 译为 `回滚方式`，保留它作为操作建议/恢复路径的语义。
- 不接入真实 `view-log` / `retry` / `terminate` side effect。

## 暴露的接口或数据结构

没有新增 API、protocol、模型字段或持久化字段。

## 测试结果

通过：

- `npm run build:app -w @notch-ai-monitor/desktop`
- `npm run test:qa`（9/9）
- `curl http://127.0.0.1:4317/health`
- `curl http://127.0.0.1:4317/v1/snapshot`
- in-app browser API mode 验证：
  - 当前 snapshot 仍是 quiet：`data-state=dormant`，`data-mood=none`，`eventCount=0`，`alertTitle=全部安静`
  - Session Hub row：`Terminal · 真实接入 · cli-adapter-real · 运行失败`
  - Session Detail：`退出码 进程退出码 7`，`结束原因 进程以退出码 7 结束`
  - browser console error：0
- in-app browser mock active-event 验证：
  - risk event action panel 显示 `原因` / `影响范围` / `证据来源` / `回滚方式`
  - 旧英文 `Reason` / `Impact` 不再出现在 event body
  - browser console error：0

当前服务仍在：

- Local Manager API：`http://127.0.0.1:4317`，PID `67138`
- Desktop Vite：`http://127.0.0.1:5174`，PID `67996`

## 未解决问题

- 当前真实 API snapshot 是 quiet，没有 active event 可直接在 API mode 中查看 Evidence grid；active-event 标签由 Playwright QA 和 in-app browser mock manager 页面覆盖。
- `view-log` / `retry` / `terminate` 的真实 side effect 仍未实现。
- Session Hub 暂无 “查看事件” 或 “Attach/打开终端” 操作。
- 左侧 tool stack 仍是静态图标，未按实际 session tools 动态裁剪。
- `AGENTS.md` 文件在工作目录下未找到；本轮按用户消息中提供的 AGENTS 指令执行。

## 下一位 agent 需要知道的上下文

- P1+.4 是纯展示层改动，所有 evidence 字段和 protocol raw values 仍保留在 model/API/snapshot 中。
- P1+ 当前主要中文文案缺口已集中到更细的 polish，例如偏好/持久化、可访问性回归、Session Hub 操作入口。
- 如果进入 P2.1，仍应先设计真实 `view-log` 的安全文件打开合同，再考虑 `retry` / `terminate` 的真实进程 side effects。
