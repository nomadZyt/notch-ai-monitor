# Main Agent Context Checkpoint P1

更新时间：2026-06-08  
Agent：Main Agent  
工作目录：`/Users/zhaiyongtao/vibeCoding/notch-ai-monitor`

## 1. 当前总目标

Notch AI Monitor 已完成 P1 技术 Spike 与 P1+ polish：  
`真实/模拟 CLI event -> Local Agent Manager API -> EventQueue/StateMachine -> Notch UI -> 用户动作/状态展示`

当前产品不是完整发布版，重点是：

- 协议清晰。
- UI 与业务逻辑解耦。
- Session/Event/Action 强类型。
- Local Manager API 与 UI 通过明确 HTTP/SSE 协议通信。
- 每个阶段都有 handoff、测试和可恢复上下文。

## 2. 主 Agent 流程规则

- 每次进入新的开发步骤前，先核对并更新本 checkpoint。
- checkpoint 只记录主线摘要、接口边界、服务状态、下一步入口，不复制所有实现细节。
- 详细任务内容继续写入 `docs/handoffs/` 的阶段 handoff。
- 主 agent 只读取最近 handoff 与必要源码，避免把所有子任务细节塞回对话上下文。
- 如果发现上一阶段有不合理代码或扩展性风险，先修正，再进入下一步。

## 3. 已完成阶段摘要

- P0：工程结构、shared protocol、EventQueue/StateMachine、mock manager、Notch UI、risk policy、QA 基线。
- P1.1-P1.4：Local Manager API、UI API client、real CLI adapter/profile/parser/wrapper 初步接入。
- P1.5：`notch-run` smoke，从 wrapper 到 Manager API 验证 live source mode。
- P1.6：真实 CLI smoke presets：`codex-version`、`claude-version`；Qwen 暂不作为第一版重点。
- P1.7：interactive stdio + `notch.session.ended` lifecycle。
- P1.8：Session lifecycle UI，展示 running/completed/failed。
- P1.9：Lifecycle QA hardening，覆盖 `running/no-event` 与 `failed/error`。
- P1.10：Quiet state 下有 session 时可打开 Session Hub。
- P1.11：Session Hub 内新增 selected session detail。
- P1.12：`notch.session.ended` 的 `exitCode/reason` 持久化到 `Session.exitCode/endReason`，Session Detail 可显示退出码和结束原因。
- P1.13：重启真实 dev 服务并重新跑 `smoke:notch-run`，主 API snapshot 已包含 live completed session 的 `exitCode: 0`。
- P1.14：新增真实 failed exit smoke fixture，主 API snapshot 已包含 live failed session 的 `exitCode: 7`，Desktop detail 可显示失败退出码。
- P1.15：明确 real adapter exit reason 合同，非零退出写入 `reason=exitCode:<code>`，Manager 持久化为 `Session.endReason`，Desktop detail 可显示 `End Reason`。
- P1.16：新增真实 action resolution smoke，验证 failed event 的 `ignore` action 可通过 Manager API 置为 `ignored`，session 仍保留 failed exit metadata。
- P1.17：定义 P1 action side effect 安全边界，固定 `view-log` read-only/noop、`terminate` 需确认、process effects mocked。
- P1.18：扩展 action smoke 覆盖 read-only `view-log`，验证 action result 为 `noop` 且 event 保持 active。
- P1.19：完成 P1 final acceptance，完整测试/构建/QA/smoke/API/UI 验收通过，最终 snapshot 回到 quiet。
- P1+.1：完成 Session Hub 状态/来源文案语义澄清，`真实` 改为 `真实接入`，`失败` 改为 `运行失败`，详情字段改为 `接入方式` / `运行状态`。
- P1+.2：完成 Session Detail 文案本地化和 `exitCode:<code>` formatter，不改 API/protocol。
- P1+.3：完成 event type/value 展示本地化，`risk` / `confirm` / `result` / `error` 在 UI 中显示为 `风险` / `确认` / `结果` / `错误`，不改 API/protocol。
- P1+.4：完成 Evidence grid 标签本地化，`Reason` / `Impact` / `Origin` / `Rollback` / `Log` 显示为 `原因` / `影响范围` / `证据来源` / `回滚方式` / `日志`，不改 API/protocol。
- P1+.5：完成普通运行静音偏好持久化，`quietNormalRuns` 存于 Desktop localStorage，按钮支持 `aria-pressed` toggle，不改 API/protocol。
- P1+.6：完成可访问性语义回归，补齐 panel/dialog、aria-hidden、aria-labelledby、aria-current 与中文 aria-label QA，不改 API/protocol。

## 4. 最近关键 handoff

- `docs/handoffs/main-agent-p1-final-acceptance.md`
- `docs/handoffs/main-agent-accessibility-regression-p1plus.md`
- `docs/handoffs/main-agent-quiet-preference-persistence-p1plus.md`
- `docs/handoffs/main-agent-evidence-label-localization-p1plus.md`
- `docs/handoffs/main-agent-event-type-localization-p1plus.md`
- `docs/handoffs/main-agent-detail-localization-p1plus.md`
- `docs/handoffs/main-agent-ui-label-semantics-p1plus.md`
- `docs/handoffs/main-agent-readonly-view-log-smoke-p1.md`
- `docs/handoffs/main-agent-action-side-effect-boundary-p1.md`
- `docs/handoffs/main-agent-session-detail-p1.md`
- `docs/handoffs/main-agent-real-action-resolution-smoke-p1.md`
- `docs/handoffs/main-agent-exit-reason-contract-p1.md`
- `docs/handoffs/main-agent-failed-exit-smoke-p1.md`
- `docs/handoffs/main-agent-real-smoke-refresh-exit-metadata-p1.md`
- `docs/handoffs/main-agent-session-exit-metadata-p1.md`
- `docs/handoffs/main-agent-quiet-session-hub-access-p1.md`
- `docs/handoffs/main-agent-lifecycle-qa-hardening-p1.md`
- `docs/handoffs/main-agent-session-lifecycle-ui-p1.md`
- `docs/handoffs/main-agent-interactive-stdio-session-lifecycle-p1.md`

## 5. 当前架构边界

- `packages/shared` 定义强类型模型、protocol envelope、EventQueue snapshot。
- `packages/local-manager-mock` 管理内存 session/event/action 状态。
- `packages/local-manager-api` 暴露：
  - `GET /health`
  - `GET /v1/snapshot`
  - `GET /v1/events`
  - `POST /v1/envelopes`
  - `POST /v1/debug/reset`
- `apps/desktop` 只通过 ManagerClient 消费 snapshot/events/action，不直接操作 CLI 进程。
- `packages/cli-adapter-real` 负责 CLI profile/parser/wrapper 和 protocol envelope 发送。
- Session Hub detail 当前只消费已有 `Session` 字段，不扩展 API。

## 6. 当前 UI 状态

- Notch 右胶囊：处理 active event。
- Notch 左胶囊：打开 Session Hub。
- Quiet state 中如果存在 session，左胶囊可见且可键盘聚焦。
- Session Hub row 点击只切换 selected session detail，不自动跳转 Action panel。
- Action panel session tab 点击才切换 active event。
- Session detail 当前显示：
  - name/tool mark
  - active event count
  - 运行状态
  - 接入方式
  - 来源
  - 进程 ID
  - 开始时间
  - 最近活动
  - 项目
  - 工作目录
  - 退出码（存在时，格式化为 `正常退出 (0)` 或 `进程退出码 N`）
  - 结束原因（存在时，`exitCode:N` 格式化为 `进程以退出码 N 结束`）
- Action panel 当前将 event type 展示为中文：
  - `risk` -> `风险`
  - `confirm` -> `确认`
  - `result` -> `结果`
  - `error` -> `错误`
  - `severityChip` 中 risk level 展示为 `低` / `中` / `高` / `严重`
- Action panel Evidence grid 当前将标签展示为中文：
  - `reason` -> `原因`
  - `impact` -> `影响范围`
  - `origin` -> `证据来源`
  - `rollback` -> `回滚方式`
  - `logExcerpt` -> `日志`
- Desktop 本地偏好：
  - `quietNormalRuns` 存储在 localStorage key `notch-ai-monitor:desktop-preferences:v1`
  - `静音普通运行` 是 `aria-pressed` toggle，开启后显示 `恢复普通提醒`
  - 当前只作为本地 UI preference，不影响 Manager snapshot、EventQueue 或 action side effect
- Desktop 可访问性语义：
  - `sessionsPanel` / `actionPanel` 使用非模态 `role="dialog"` 和 `aria-labelledby`
  - 展开/收起时同步 panel `aria-hidden` 与胶囊 `aria-expanded`
  - Session Hub row / Action panel session tab 使用 `aria-current` 标记当前项

## 7. 当前服务状态

- Local Manager API：`http://127.0.0.1:4317`
- Desktop Vite：`http://127.0.0.1:5174`
- P1+.5 验证前发现 P1+.4 旧服务已停止，已重启：
  - API PID：`16864`
  - Desktop PID：`17975`
- 当前主 API snapshot：
  - `sessions: 0`
  - `activeSessions: 0`
  - `activeEvents: 0`
  - `events: 0`
  - `currentEventId: null`

## 8. 最近验证结果

P1+.6 Accessibility regression 已通过：

- `npm run build:app -w @notch-ai-monitor/desktop`
- `npm run test:qa`（10/10）
- `curl http://127.0.0.1:4317/health`
- `curl http://127.0.0.1:4317/v1/snapshot`
- in-app browser API mode 验证：
  - 空 quiet：`data-state=dormant`，`data-mood=none`，`eventCount=0`
  - `sessionsPanel/actionPanel role=dialog`
  - `sessionsPanel/actionPanel aria-hidden=true`
  - browser console error：0
- in-app browser mock mode 验证：
  - action panel 展开后 `actionPanel aria-hidden=false`，selected tab `aria-current=true`
  - Session Hub 展开后 `sessionsPanel aria-hidden=false`，selected row `aria-current=true`
  - `quietAllBtn aria-pressed=false`
  - browser console error：0
- 主 agent 代码复核：
  - P1+.6 只改 Desktop DOM 语义、render 状态同步和 QA 断言。
  - 没有修改 API、protocol、EventQueue/StateMachine、Manager action 合同或 real CLI adapter。
  - Desktop UI 未直接接触 CLI 进程。

## 9. 当前未解决问题

- Detail 暂无 “查看事件” 或 “Attach/打开终端” 操作。
- `quietNormalRuns` 目前只是本地 UI preference，尚未影响 event 过滤、入队或通知策略。
- `retry` / `view-log` / `terminate` 的真实 side effect 仍未接入；当前主要是 Manager resolve 语义。
- 左侧 tool stack 仍是静态图标，未按实际 session tools 动态裁剪。
- 尚未实现完整 focus trap / roving tabindex；P1+ 只稳定已有面板的可读语义。

## 10. 下一步入口

当前状态：P1 技术 Spike 与 P1+ polish 已完成，可以进入 P2。

已完成目标：

- 跑完整 P1 验收命令。
- 用真实 smoke 确认 completed/failed/action resolve/view-log 主路径。
- 写 P1 总 handoff 和最终 checkpoint。
- 明确 P2/P1+ 剩余风险。

本轮 P1 收尾拆分：

- P1.17：Action side effect 安全边界与测试合同。
- P1.18：Read-only `view-log` smoke / UI 验证。
- P1.19：P1 final acceptance checkpoint 和总 handoff。

下一阶段建议：

- P2.1：真实 action side effects，优先 `view-log` 安全打开日志，其次 `retry`/`terminate` 进程控制合同。
- 后续产品化 polish 可另开任务处理 focus trap、Session Hub 操作入口、工具栈动态展示。

继续边界：

- 不做 PTY attach。
- 不直接 kill 真实进程。
- 不把当前 P1 spike 伪装成完整产品。

## 11. 本轮 P1+.3 工作日志

- 2026-06-08 开始：进入 P1+.3 event type/value 文案本地化。已读取 P1 final acceptance、P1+.1、P1+.2 handoff，并确认本轮边界是 Desktop 展示层 formatter/QA；不修改 shared model、API、protocol、EventQueue/StateMachine 或 real CLI adapter。
- 2026-06-08 核对：工作目录未找到 `AGENTS.md` 文件；继续遵守用户消息中提供的 AGENTS 指令：生成内容期间说明做法，不只给结果。
- 2026-06-08 复核结束：P1+.1/P1+.2 formatter 均位于 Desktop 展示层，未发现需要先修复的 API/protocol/shared 越界。剩余 raw UI 值集中在 action panel：`EVENT_TYPE_META.label` 的英文文案、`severityChip` 的 `event.type`，以及 Event facts 里的 `类型` 值。
- 2026-06-08 实现结束：Desktop 展示层已把 event type 显示映射为 `风险` / `确认` / `结果` / `错误`，`severityChip` 不再展示 raw `event.type`；risk level 在 chip 中映射为中文等级。已更新 Desktop QA 断言覆盖中文 event kind、severity chip 和 Event facts 类型值。
- 2026-06-08 验证结束：`npm run build:app -w @notch-ai-monitor/desktop` 通过；`npm run test:qa` 9/9 通过。当前服务仍在：API `http://127.0.0.1:4317`，Desktop `http://127.0.0.1:5174`。in-app browser 首次 `127.0.0.1` tab 崩溃，改用干净 `localhost` tab 验证 API mode：`dormant` / `none` / `eventCount=0` / `全部安静`，Session Hub row/detail 显示 `真实接入`、`运行失败`、`进程退出码 7`、`进程以退出码 7 结束`，browser console error 为 0。
- 2026-06-08 收尾结束：已新增 `docs/handoffs/main-agent-event-type-localization-p1plus.md`。下一入口建议为 Evidence grid 标签本地化、偏好/持久化/可访问性回归，或进入 P2.1 设计真实 action side effects。

## 12. 本轮 P1+.4 工作日志

- 2026-06-08 开始：进入 P1+.4 Evidence grid 标签本地化。已读取最新 checkpoint 和 P1+.3 handoff，确认本轮边界是 Desktop 展示层文案和 QA；不修改 shared model、API、protocol、EventQueue/StateMachine 或 real CLI adapter。
- 2026-06-08 复核结束：P1+.3 event type/value 本地化仍集中在 Desktop UI meta/formatter，未发现需要先修复的扩展性问题。剩余英文展示点集中在 `renderEventBody()` 的 Evidence grid 标签：`Reason` / `Impact` / `Origin` / `Rollback` / `Log`。
- 2026-06-08 实现结束：Evidence grid 标签已本地化为 `原因` / `影响范围` / `证据来源` / `回滚方式` / `日志`。只替换 Desktop 可见标签，证据字段值、shared model、API snapshot 和 action side effect 均未改动。已更新 Desktop QA 断言覆盖中文标签与旧英文标签消失。
- 2026-06-08 验证结束：`npm run build:app -w @notch-ai-monitor/desktop` 通过；`npm run test:qa` 9/9 通过；`curl http://127.0.0.1:4317/health` 和 `/v1/snapshot` 通过。in-app browser 使用 `localhost` API mode 验证 quiet 状态和 Session Hub detail，console error 为 0；另开 mock manager 页面验证 active risk evidence 标签显示 `原因` / `影响范围` / `证据来源` / `回滚方式`，旧 `Reason` / `Impact` 不再出现，console error 为 0。
- 2026-06-08 收尾结束：已新增 `docs/handoffs/main-agent-evidence-label-localization-p1plus.md`。下一入口建议为偏好/持久化、可访问性回归、Session Hub 操作入口，或进入 P2.1 设计真实 action side effects。

## 13. 本轮 P1+.5 工作日志

- 2026-06-08 开始：进入 P1+.5 普通运行静音偏好持久化。已读取最新 checkpoint 和 P1+.4 handoff，确认本轮边界是 Desktop 本地 UI preference/localStorage 和 QA；不修改 shared model、API、protocol、EventQueue/StateMachine、Manager action 合同或 real CLI adapter。
- 2026-06-08 复核结束：现有 `quietAllBtn` / `openPrefsBtn` 只是 toast 占位，适合做一个小闭环：持久化 `quietNormalRuns` 偏好、更新按钮状态/文案/ARIA，并让 `偏好` 入口反馈当前本地设置。该偏好暂不改变事件入队、展示优先级或真实 action side effect。
- 2026-06-08 实现结束：新增 Desktop 本地偏好 `quietNormalRuns`，使用版本化 localStorage key 持久化；`静音普通运行` 现在是 aria-pressed toggle，开启后文案变为 `恢复普通提醒`，`偏好` 入口会反馈当前状态。已更新 P0 mock QA 覆盖点击、reload 后持久化和恢复。
- 2026-06-08 验证结束：`npm run build:app -w @notch-ai-monitor/desktop` 通过；`npm run test:qa` 10/10 通过。P1+.4 旧 dev 服务已停止，已重启 API PID `16864` 和 Desktop PID `17975`；重启后 API snapshot 为空 quiet。in-app browser 验证 API mode 空 quiet 状态，mock mode 验证 `quietNormalRuns=false -> true -> reload 保持 true -> false`，browser console error 为 0。
- 2026-06-08 收尾结束：已新增 `docs/handoffs/main-agent-quiet-preference-persistence-p1plus.md`。下一入口建议为可访问性回归、Session Hub 操作入口、工具栈动态展示，或进入 P2.1 设计真实 action side effects。

## 14. 本轮 P1+.6 工作日志

- 2026-06-08 开始：进入 P1+ 最终收口段，目标是补齐 Desktop 展示层的 panel/dialog、aria-hidden、aria-labelledby 和当前选中项语义，并把这些语义固化进 QA。边界仍是不改 shared model、API、protocol、EventQueue/StateMachine、Manager action 合同或 real CLI adapter。
- 2026-06-08 复核：P1+.5 的 `quietNormalRuns` 仅在 Desktop 本地偏好/localStorage 中闭环，未发现需要先修复的 API/protocol 越界。当前可访问性缺口集中在 `sessionsPanel` / `actionPanel` 展开状态缺少稳定 `role`、`aria-hidden`、`aria-labelledby`，以及 session row / action tab 缺少“当前选中”的辅助语义。
- 2026-06-08 实现结束：Desktop shell 已为左/右胶囊补充 `aria-haspopup="dialog"`；`sessionsPanel` / `actionPanel` 现在声明非模态 `role="dialog"`、`aria-labelledby`，并随展开状态同步 `aria-hidden`。Session Hub row 与 Action panel session tab 已补充 `aria-current` 和中文 `aria-label`。已更新 mock P0 与 API client smoke，覆盖 action panel、Session Hub、当前选中项和 quiet preference 相关 ARIA。
- 2026-06-08 验证结束：`npm run build:app -w @notch-ai-monitor/desktop` 通过；`npm run test:qa` 首轮因测试期望误写 `Qwen Code` 而失败，修正为 fixture 实际名称 `Qwen CLI` 后 10/10 通过。服务仍在 API PID `16864` / Desktop PID `17975`，`/health` OK，主 `/v1/snapshot` 为空 quiet。in-app browser 验证 API mode：两个 panel 初始 `aria-hidden=true`、dialog/labelledby 存在、console error 0；mock mode：action panel 展开后 selected tab `aria-current=true`，Session Hub 展开后 selected row `aria-current=true`，console error 0。
- 2026-06-08 收尾结束：已新增 `docs/handoffs/main-agent-accessibility-regression-p1plus.md`。P1+ 当前收口完成，下一入口建议进入 P2.1：真实 action side effect 合同，优先 read-only `view-log` 安全打开日志路径。

## 15. P2 入口指针

- 2026-06-08：P2 已开始，后续主 checkpoint 迁移到 `docs/handoffs/main-agent-context-checkpoint-p2.md`。P1 checkpoint 保留为 P1/P1+ 历史入口。
