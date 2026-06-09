# Local Manager Agent P0 Handoff

日期：2026-06-06  
Agent：Local Manager Agent  
阶段：P0 技术 Spike  
工作目录：`/Users/zhaiyongtao/vibeCoding/notch-ai-monitor`

## 1. 本次目标

- 创建 `packages/local-manager-mock` 最小 TypeScript 包，依赖 `@notch-ai-monitor/shared`。
- 实现 mock Local Agent Manager runtime：接收 mock CLI/debug event、归一化、维护 sessions/events、处理 UI action request、返回 action result 和 snapshot。
- 添加 P0 单测覆盖 scenario、normalization、action routing、subscribe。
- 不碰 UI、prototype、design、apps/desktop，不实现真实 Tauri IPC、真实 CLI adapter 或真实危险副作用。

## 2. 已完成内容

- 新增 `@notch-ai-monitor/local-manager-mock` workspace 包。
- 实现 `MockLocalAgentManager` 和 `createMockLocalAgentManager`。
- 支持 `upsertSession(session)`、`ingestEvent(event)`、`injectScenario(...)`、`requestAction(payload)`、`getSnapshot()`、`subscribe(listener)`。
- 实现 P0 event/action normalization：默认 status、priority、actions、createdAt、updatedAt、commandHash、action style/sideEffect/enabled/requiresConfirm。
- 实现缺 `riskLevel` 的 risk event 安全处理：`allow-once` 默认禁用；即使收到 confirmed request，也返回 `failed`，事件保持 active。
- 实现 ActionRouter mock：resolving action 更新事件为 `resolved` 或 `ignored` 并返回 `nextEventId`；`allow-once`/`terminate` 未确认时返回 `needs_confirmation`；`copy`/`copy-summary`/`locate`/`view-log` 返回 `noop`。
- 所有 effects 都只返回 `{ mocked: true }`，不执行 process/filesystem/navigation/clipboard 副作用。
- 根 `package.json` 的 `build` / `test` 串联 shared 和 local-manager-mock，不修改 shared 包脚本。

## 3. 修改/新增文件

| 文件 | 类型 | 说明 |
| --- | --- | --- |
| `package.json` | 修改 | 根 build/test 最小接入 local manager workspace |
| `package-lock.json` | 修改 | 新增 local-manager-mock workspace link |
| `packages/local-manager-mock/package.json` | 新增 | mock manager package metadata、exports、scripts、shared dependency |
| `packages/local-manager-mock/tsconfig.json` | 新增 | strict TypeScript 编译配置 |
| `packages/local-manager-mock/src/index.ts` | 新增 | package barrel exports |
| `packages/local-manager-mock/src/mock-local-agent-manager.ts` | 新增 | P0 runtime、normalization、ActionRouter mock |
| `packages/local-manager-mock/tests/mock-local-agent-manager.test.mjs` | 新增 | Node test runner 单测 |
| `docs/handoffs/local-manager-agent-p0.md` | 新增 | 本 handoff |

## 4. 关键决策

- 复用 shared 的 `enqueueEvent`、`replaceEvents`、`resolveEvent`、`ignoreEvent`、`buildManagerSnapshot`，local manager 只负责 runtime glue 和 normalization。
- `ingestEvent` 使用宽松输入类型 `MockNotchEventInput`，因为 P0 mock CLI/debug event 可能缺 contract 默认字段。
- `commandHash` 使用包内 FNV-1a 稳定 hash，避免给 spike 包额外引入 Node type dependency。
- `reject` 和 `ignore` 这类拒绝/忽略动作把事件更新为 `ignored`；其他 resolving action 更新为 `resolved`。
- `injectScenario("idle")` 保留 fixture sessions、清空 events，因此 UI 会得到 dormant view hints，但 session count 仍可用于 sessions panel。

## 5. 暴露的接口或数据结构

- `MockLocalAgentManager`
- `createMockLocalAgentManager(options?)`
- `stableCommandHash(command)`
- `DEFAULT_ACTIONS_BY_EVENT_TYPE`
- `MockNotchEventInput`
- `LooseActionInput`
- `ManagerClock`
- `ManagerSnapshotListener`
- `MockLocalAgentManagerOptions`
- Runtime methods:
  - `upsertSession(session): Session`
  - `ingestEvent(event): NotchEvent`
  - `injectScenario("idle" | "waiting" | "result" | "error" | "risk" | "all"): ManagerSnapshot`
  - `requestAction(payload: ActionRequestPayload): ActionResultPayload`
  - `getSnapshot(): ManagerSnapshot`
  - `subscribe(listener): () => void`

## 6. 测试结果

- 执行命令：`npm install`
- 执行命令：`npm test`
- 结果：shared 9 个测试全部通过；local-manager-mock 7 个测试全部通过。
- 覆盖内容：scenario injection、normalization defaults、缺 riskLevel 的 allow-once 阻断、resolve -> next event、needs_confirmation、noop action、subscribe/unsubscribe。
- 测试后已清理本轮生成的 `node_modules/`、`packages/shared/dist/`、`packages/local-manager-mock/dist/` 构建产物。

## 7. 未解决问题

- P0 目前没有 transport/server wrapper；本包只提供 in-memory manager runtime API。
- Action result 没有持久化进 snapshot；当前按 contract 直接由 `requestAction` 返回。
- `ActionResultPayload.effects.target` 只是 mock target hint，不代表真实进程、路径、窗口或剪贴板操作。

## 8. 下一位 agent 需要知道的上下文

- UI/IPC agent 可以用 `getSnapshot()` 拉取当前真值，用 `subscribe()` 接 snapshot 更新。
- DebugHarness 可以直接调用 `injectScenario(...)`，或用 `ingestEvent(...)` 注入缺字段事件来验证 normalization。
- `allow-once` 和 `terminate` 未带 `confirmed: true` 时一定返回 `needs_confirmation`，事件保持 active。
- 缺 `riskLevel` 的 risk event 不允许执行 `allow-once`；这既体现在 action disabled，也体现在 router 的 `failed` guard。
- 本轮没有修改 `packages/shared` 源码。

## 9. 注意事项

- 不要回滚其他 agent 或用户已有改动。
- 如果需要修改非自己 ownership 文件，先在 handoff 中写明原因。
- P0 只做技术 Spike，不扩展到完整产品实现。
- 当前工作区原本已有旧 `prototype/interactive.*` 删除状态和大量未跟踪 docs/design/output/prototype v2/package/shared 文件；本次未回滚、未清理、未修改这些非本任务文件。
