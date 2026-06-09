# Main Agent Handoff: P1+.1 UI Label Semantics

日期：2026-06-07  
Agent：Main Agent  
阶段：P1+.1

## 本次目标

修正 Session Hub 中 `真实` 与 `失败` 并列展示造成的语义混淆：

- 明确 `真实` 是接入来源，不是运行结果。
- 明确 `失败` 是 session 生命周期状态，不是数据来源。
- 不修改 API、protocol、EventQueue、StateMachine 或真实 CLI adapter。

## 已完成内容

- 将 source mode 的 UI 标签从裸 `真实` 调整为 `真实接入`。
- 将 session lifecycle 标签从 `失败` / `已完成` 调整为 `运行失败` / `运行完成`。
- 在 alert meta 和 event panel meta 中加入字段名前缀：
  - `接入方式: 真实接入`
  - `运行状态: 运行失败`
- 将 detail / event facts 中的 `Mode` / `State` 改为：
  - `接入方式`
  - `运行状态`
- 更新 Desktop Playwright QA 断言。
- 用当前真实 API snapshot 在 in-app browser 中验证：
  - selected row 显示 `Terminal · 真实接入 · cli-adapter-real · 运行失败`
  - detail 显示 `运行状态运行失败` 与 `接入方式真实接入`
  - quiet state 仍为 `dormant / none / eventCount 0`

## 修改/新增文件

- 修改 `apps/desktop/src/app/app-shell.ts`
- 修改 `apps/desktop/tests/e2e/api-client-smoke.spec.mjs`
- 修改 `docs/handoffs/main-agent-context-checkpoint-p1.md`
- 新增 `docs/handoffs/main-agent-ui-label-semantics-p1plus.md`

## 关键决策

- 只改展示文案，不改 `Session.sourceMode` 和 `Session.state` 的数据模型。
- badge 使用短但明确的标签；meta 使用带字段名前缀的语句，减少误读。
- 保留 `live` 的技术含义，UI 层翻译为 `真实接入`。
- 不在这个小节引入真实日志打开、retry、terminate 或 process side effect。

## 暴露的接口或数据结构

没有新增 API 或 protocol。

UI helper 语义：

- `sourceModeLabel(session)`：把 `live` 显示为 `真实接入`。
- `sourceModeMetaLabel(session)`：显示为 `接入方式: ...`。
- `sessionStateLabel(session)`：把 `failed` 显示为 `运行失败`，`completed` 显示为 `运行完成`。
- `sessionStateMetaLabel(session)`：显示为 `运行状态: ...`。

## 测试结果

通过：

- `npm run build:app -w @notch-ai-monitor/desktop`
- `npm run test:qa`（9/9）
- `curl http://127.0.0.1:4317/v1/snapshot`
- in-app browser 验收真实 API mode：
  - row：`Terminal · 真实接入 · cli-adapter-real · 运行失败`
  - detail：`运行状态运行失败`、`接入方式真实接入`
  - browser console error：0

当前服务仍在：

- Local Manager API：`http://127.0.0.1:4317`，PID `67138`
- Desktop Vite：`http://127.0.0.1:5174`，PID `67996`

## 未解决问题

- `exitCode:<code>` 仍未本地化。
- detail 中 `Source`、`PID`、`Started` 等字段仍是英文/混合文案。
- 真实 `view-log` / `retry` / `terminate` side effect 仍未实现。
- 当前 workspace 仍有大量 untracked 文件，`git diff` 无法展示这些新项目文件的内容差异。

## 下一位 agent 需要知道的上下文

- 用户指出的混淆点已经修复：现在 UI 将来源和状态拆成 `真实接入` 与 `运行失败`。
- 当前 API snapshot 仍是 P1 final acceptance 留下的 quiet snapshot：
  - failed live session 保留 `exitCode=7` / `endReason=exitCode:7`
  - error event 已 ignored
  - `activeEvents=0`
- 下一步如果继续 P1+，建议处理剩余 detail 文案本地化和 `exitCode:<code>` formatter；如果进入 P2，则先设计真实 `view-log` 的安全文件打开合同。
