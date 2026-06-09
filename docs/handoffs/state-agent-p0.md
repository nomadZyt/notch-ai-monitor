# State Agent P0 Handoff

日期：2026-06-06  
Agent：State Agent  
阶段：P0 技术 Spike  
工作目录：`/Users/zhaiyongtao/vibeCoding/notch-ai-monitor`

## 1. 本次目标

- 建立 `packages/shared` 最小 TypeScript 包，提供 P0 contracts 中的 shared models、protocol envelopes、状态机、事件队列和 fixture。
- 从 `prototype/interactive-v2.js` 迁移四类 mock events 到协议字段。
- 添加聚焦单测覆盖 mood/state、queue 排序、resolve next event、二次确认 action shape 和 P0 去重。
- 不修改 prototype、design、apps/desktop、manager/runtime/risk/ui 相关代码。

## 2. 已完成内容

- 新增最小 npm workspace 和 `@notch-ai-monitor/shared` 包。
- 实现并导出 `Session`、`Evidence`、`Action`、`NotchEvent`、`ProtocolEnvelope`、`ManagerSnapshot`、`ActionRequestPayload`、`ActionResultPayload` 等契约类型。
- 实现纯函数状态机：`moodForEvent`、`restingStateForMood`、`deriveViewHints`。
- 实现纯函数事件队列：active 过滤、priority 排序、同优先级 createdAt 新到旧、P0 去重、resolve/ignore/expire、next event 选择。
- 迁移 Qwen risk/confirm、Claude result、Codex error 四类 fixtures，补齐 ISO 时间、`status`、`sideEffect`、`enabled`、`requiresConfirm`、risk `riskLevel`、error `logExcerpt/errorKey`。
- 添加 Node test runner 单测，已跑通。

## 3. 修改/新增文件

| 文件 | 类型 | 说明 |
| --- | --- | --- |
| `package.json` | 新增 | 最小 npm workspace 和根 build/test script |
| `package-lock.json` | 新增 | TypeScript dev dependency lockfile |
| `packages/shared/package.json` | 新增 | shared package metadata、exports、build/test script |
| `packages/shared/tsconfig.json` | 新增 | strict TypeScript 编译配置 |
| `packages/shared/src/models/*` | 新增 | primitive 类型、Session/Evidence/Action/NotchEvent |
| `packages/shared/src/protocol/*` | 新增 | protocol envelope、snapshot、action request/result 类型 |
| `packages/shared/src/state-machine/*` | 新增 | mood/state/view hint 纯函数 |
| `packages/shared/src/event-queue/*` | 新增 | priority、dedupe、queue update 纯函数 |
| `packages/shared/src/fixtures/*` | 新增 | P0 sessions/events fixtures |
| `packages/shared/src/index.ts` | 新增 | shared package barrel exports |
| `packages/shared/tests/*.test.mjs` | 新增 | 聚焦单测 |
| `docs/handoffs/state-agent-p0.md` | 新增 | 本 handoff |

## 4. 关键决策

- 根 `package.json` 只提供 workspace/build/test 支撑，因为仓库当前没有现成工程脚本，测试无法直接运行。
- `EventQueue` 函数不读取当前时间；`resolveEvent`、`ignoreEvent`、`expireEvent` 要求调用方传入 `at`，保证测试和 Manager runtime 可复现。
- P0 去重保留历史事件对象，但把重复项标为 `expired`。这样 active 队列只暴露合并结果，同时不会丢掉 Manager/QA 后续可能需要的事件历史。
- confirm/error 合并保留第一条事件 id，并用最新重复事件更新 summary/evidence/actions/updatedAt；这样 UI selected event 不会因为同一命令/错误重复上报而跳 id。
- result 去重按 `createdAt` 保留最新事件，旧 result 标为 `expired`，符合“完成提醒保留最新”的契约。
- risk 事件不去重，多个危险命令会逐条保留 active。

## 5. 暴露的接口或数据结构

- Models：`Session`、`Evidence`、`Action`、`NotchEvent`、`ISODateTimeString`、`EventType`、`EventStatus`、`Mood`、`ShellState`、`PanelState`、`SideEffect`。
- Protocol：`ProtocolEnvelope`、`ProtocolSource`、`ManagerSnapshot`、`ActionRequestPayload`、`ActionResultPayload`、`ActionResultStatus`、各 `notch.*` envelope alias。
- State machine：`MOOD_BY_EVENT_TYPE`、`moodForEvent(event)`、`restingStateForMood(mood)`、`deriveViewHints(event)`。
- Event queue：`DEFAULT_EVENT_PRIORITY`、`activeEvents(events)`、`activeEventIds(events)`、`nextEvent(events)`、`nextEventId(events)`、`enqueueEvent(events, event)`、`replaceEvents(events)`、`resolveEvent(events, eventId, options)`、`ignoreEvent(...)`、`expireEvent(...)`、`buildManagerSnapshot(sessions, events)`。
- Fixtures：`fixtureSessions`、`riskEventFixture`、`confirmEventFixture`、`resultEventFixture`、`errorEventFixture`、`allEventsFixture`、duplicate fixtures for dedupe tests.

## 6. 测试结果

- 执行命令：`npm install`
- 执行命令：`npm test`
- 结果：9 个测试全部通过。
- 覆盖内容：risk/confirm/result/error mood，mood 到 resting state，risk auto peek hint，priority + createdAt 排序，resolve 后 `nextEventId`，`allow-once.requiresConfirm` shape，重复 result/confirm/error 去重。
- 测试后已清理本轮生成的 `node_modules/` 和 `packages/shared/dist/` 构建产物，源码和 lockfile 保留。

## 7. 未解决问题

- ActionRouter 仍需 Manager Agent 实现；本次只提供 `ActionRequestPayload` / `ActionResultPayload` shape 和 action fixture，不执行真实或 mock action result runtime。
- `commandHash` 生成和外部 event normalization 尚未实现；P0 Manager 可基于协议第 10 节继续补齐。
- 是否需要根级 `fixtures/events/*.json` 供 QA/DebugHarness 直接读取，后续可由 QA/Manager Agent 决定；本次先提供 typed package fixtures。

## 8. 下一位 agent 需要知道的上下文

- Manager Agent 可以直接用 `buildManagerSnapshot(fixtureSessions, events)` 生成 UI snapshot，并用 `resolveEvent` 等函数更新 queue。
- UI Agent 只应消费 `ManagerSnapshot.viewHints` 和 active/current event，不要直接修改 queue 内部事件。
- `allow-once` 和 `terminate` fixtures 已带 `requiresConfirm: true`；Manager 的 ActionRouter 还需要在 `confirmed !== true` 时返回 `needs_confirmation` 并保持事件 active。
- result/confirm/error 去重逻辑会把重复项标成 `expired`，因此 UI/QA 统计 active 数量时应使用 `activeEventIds` 或 `activeEvents`。

## 9. 注意事项

- 不要回滚其他 agent 或用户已有改动。
- 如果需要修改非自己 ownership 文件，先在 handoff 中写明原因。
- P0 只做技术 Spike，不扩展到完整产品实现。
- 当前工作区原本已有旧 `prototype/interactive.*` 删除状态和大量未跟踪 docs/design/output/prototype v2 文件；本次未回滚、未清理、未修改这些非本任务文件。
