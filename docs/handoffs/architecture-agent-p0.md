# Architecture Agent P0 Handoff

日期：2026-06-06  
Agent：Architecture Agent  
阶段：P0 技术 Spike  
工作目录：`/Users/zhaiyongtao/vibeCoding/notch-ai-monitor`

## 1. 本次目标

- 基于现有 PRD、技术路线、高保真方向稿和 v2 原型，建立 P0 技术 Spike 的架构/契约/交接文档。
- 只改 `docs/contracts/` 和 `docs/handoffs/`，不搭工程、不安装依赖、不写业务实现。

## 2. 已完成内容

- 阅读并提取了 `product-requirements-v2.md` 中的 Session/Event/Evidence/Action、状态机、队列、四类事件工作流和 a11y 规则。
- 阅读并提取了 `technical-options-and-task-plan.md` 中的推荐 P0 路线、MVP 架构、模块职责、事件协议和 P0 任务拆分。
- 阅读了高保真方向稿，确认 P0 UI 视觉验证以 Quiet Glass 方向和当前 v2 状态机为基准。
- 阅读了 `interactive-v2` 原型，提取现有 mock sessions、event seed、priority、mood 映射、panel 行为、action resolve 行为。
- 新增 P0 架构契约，明确推荐工程结构、模块边界、依赖方向、数据 ownership、文件 ownership 和验收清单。
- 新增 P0 事件协议契约，明确 TypeScript shape、envelope、CLI -> Manager、UI -> Manager、Manager -> UI、action result 格式。
- 新增通用 handoff 模板。
- 写入本 Architecture Agent handoff。

## 3. 修改/新增文件

| 文件 | 类型 | 说明 |
| --- | --- | --- |
| `docs/contracts/architecture.md` | 新增 | P0 架构契约、推荐目录、模块/依赖/ownership |
| `docs/contracts/event-protocol.md` | 新增 | P0 事件协议、TypeScript shape、消息格式、测试矩阵 |
| `docs/handoffs/TEMPLATE.md` | 新增 | 后续 agent 交接模板 |
| `docs/handoffs/architecture-agent-p0.md` | 新增 | 本 agent 交接记录 |

## 4. 关键决策

- P0 推荐路线使用 `Tauri 或静态 Web shell + Web UI + mock Local Agent Manager + shared TypeScript event model`。这是为了匹配技术路线中的“最快 Spike”目标，同时不提前承诺正式 MVP 必须用 Tauri。
- 协议统一使用 `notch.*` 事件名。PRD 中的 `ai_monitor.event_created` 作为历史别名，由 adapter 归一化，不让后续实现出现两套命名。
- `LocalAgentManager/EventQueue` 是 Session/Event/Evidence/Action 的真值 owner。UI 只消费 snapshot，发 action request，不直接修改事件真值。
- `selectedEventId`、`panel`、焦点和局部展开状态由 UIStore owning。它们是 view state，不是 manager 持久真值。
- P0 action 全部 mock，不执行真实危险副作用。`allow-once` 和 `terminate` 必须二次确认。
- `StateMachine`、`EventQueue`、协议 types 应该优先做纯模块，便于 State/QA agent 做单测。

## 5. 暴露的接口或数据结构

- `Session`
- `Evidence`
- `Action`
- `NotchEvent`
- `ProtocolEnvelope<TEvent, TPayload>`
- `ManagerSnapshot`
- `ActionRequestPayload`
- `ActionResultPayload`
- `notch.session.upserted`
- `notch.session.ended`
- `notch.event.created`
- `notch.event.updated`
- `notch.snapshot.updated`
- `notch.action.requested`
- `notch.action.result`
- `notch.debug.injected`

详细字段见 `docs/contracts/event-protocol.md`。

## 6. 测试结果

- 本次只做文档契约，没有运行代码测试。
- 已用 `git status --short` 检查当前工作区，发现已有多处未跟踪/删除文件，未回滚也未修改这些非本任务文件。
- 待最终检查：确认新增文件只落在 `docs/contracts/` 和 `docs/handoffs/`。

## 7. 未解决问题

- 正式 MVP 最终技术栈仍未定：SwiftUI/AppKit 质感最佳，Tauri Spike 最快。
- P0 具体 transport 未定：Tauri event、WebSocket、localhost JSON POST 均可，但必须使用 envelope。
- 首个真实 CLI adapter 未定：Claude、Codex、Qwen 需要后续根据可获得的结构化事件能力选择。
- 持久化暂不进入 P0，P1 再决定 SQLite/UserDefaults/Tauri store。
- 无刘海/外接显示器模式只保留契约和验收，P0 不一定实现完整系统探测。

## 8. 下一位 agent 需要知道的上下文

- State Agent 可以直接从 `docs/contracts/event-protocol.md` 实现 shared models、state-machine、event-queue。
- Manager Agent 应先实现 mock manager：接 fixture event，维护 in-memory queue，处理 action request，广播 snapshot/action result。
- UI Agent 迁移 `interactive-v2` 时应保留现有交互语义，但把数据来源改成 manager snapshot。
- Risk Agent P0 只需要识别 `rm -rf`、`git clean -fd`、`sudo`，不要做完整安全引擎。
- QA Agent 可用协议文档第 12 节的最小测试矩阵作为第一版用例。

## 9. 注意事项

- 当前 repo 已有未跟踪的 PRD、技术路线、设计稿、原型文件，以及旧 `prototype/interactive.*` 删除状态。本次没有回滚这些改动。
- 后续 agent 并行时请遵守 `docs/contracts/architecture.md` 的文件 ownership 表。
- P0 不要扩展到真实命令执行或系统级权限集成。
