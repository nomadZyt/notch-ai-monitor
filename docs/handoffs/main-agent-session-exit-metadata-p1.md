# Main Agent P1.12 Session Exit Metadata Handoff

日期：2026-06-07  
Agent：Main Agent  
阶段：P1.12 Session Exit Metadata  
工作目录：`/Users/zhaiyongtao/vibeCoding/notch-ai-monitor`

## 1. 本次目标

- 在进入下一步前写入主 agent context checkpoint，避免会话上下文继续发散。
- 将 `notch.session.ended` 的 `exitCode` / `reason` 持久化进 `Session`。
- 让 Desktop Session Detail 展示真实退出码和结束原因。

## 2. 已完成内容

- 新增主上下文 checkpoint：
  - `docs/handoffs/main-agent-context-checkpoint-p1.md`
  - 写入当前阶段、服务状态、关键 handoff、架构边界、下一步入口。
  - 明确主流程规则：每次进入新开发步骤前先核对/更新 checkpoint。
- Shared `Session` model 新增可选字段：
  - `exitCode?: number`
  - `endReason?: string`
- Local Manager Mock：
  - `endSession(sessionId, state, metadata?)` 支持接收 exit metadata。
  - snapshot 中的 ended session 会持久化 `exitCode` / `endReason`。
- Local Manager API：
  - ingest `notch.session.ended` 时读取 payload `exitCode` / `reason`。
  - 将 `reason` 映射为 session 上的 `endReason`，避免和 event/evidence reason 混淆。
  - response 仍保留 `result.exitCode` / `result.reason` 兼容当前调用方。
- Desktop Session Detail：
  - 有 `exitCode` 时显示 `Exit Code`。
  - 有 `endReason` 时显示 `End Reason`。
- Contract 文档：
  - `docs/contracts/event-protocol.md` 更新 `Session` shape 和 session ended ingest 映射说明。

## 3. 修改/新增文件

| 文件 | 类型 | 说明 |
| --- | --- | --- |
| `docs/handoffs/main-agent-context-checkpoint-p1.md` | 新增 | 主 agent context checkpoint |
| `packages/shared/src/models/session.ts` | 修改 | `Session` 新增 `exitCode` / `endReason` |
| `packages/local-manager-mock/src/mock-local-agent-manager.ts` | 修改 | `endSession` 持久化 exit metadata |
| `packages/local-manager-api/src/local-manager-api.ts` | 修改 | `notch.session.ended` ingest 映射 exit metadata |
| `apps/desktop/src/app/app-shell.ts` | 修改 | Session Detail 显示 Exit Code / End Reason |
| `packages/local-manager-mock/tests/mock-local-agent-manager.test.mjs` | 修改 | 验证 manager snapshot 持久化 exit metadata |
| `packages/local-manager-api/tests/local-manager-api.test.mjs` | 修改 | 验证 API ingest 后 result/snapshot 都带 exit metadata |
| `apps/desktop/tests/e2e/api-client-smoke.spec.mjs` | 修改 | 验证 completed/failed session detail 显示 exit metadata |
| `docs/contracts/event-protocol.md` | 修改 | 更新 Session shape 与映射说明 |
| `docs/handoffs/main-agent-session-exit-metadata-p1.md` | 新增 | 本 handoff |

## 4. 关键决策

- Session model 使用 `endReason`，不使用裸 `reason`，避免和 event/evidence reason 混淆。
- Envelope payload 仍保持 `reason?: string`，不破坏 adapter 现有输出。
- Manager API 做映射：`payload.reason -> Session.endReason`。
- 不把 exit metadata 塞进 event evidence；这是 session lifecycle 事实，不是 event evidence。
- 不新增 UI panel；继续扩展 Session Hub 内部 detail。

## 5. 暴露的接口或数据结构

- `Session` 新增：
  - `exitCode?: number`
  - `endReason?: string`
- `MockLocalAgentManager.endSession()` 新签名：
  - `endSession(sessionId, state, metadata?)`
  - `metadata: { exitCode?: number; endReason?: string }`
- `SessionEndedEnvelope` 未改 shape：
  - `exitCode?: number`
  - `reason?: string`

## 6. 测试结果

- 针对性验证：
  - `npm run build -w @notch-ai-monitor/shared`
  - `npm run test -w @notch-ai-monitor/local-manager-api`
  - `npm run build:app -w @notch-ai-monitor/desktop`
  - `npx playwright test -c apps/desktop/tests/playwright.config.mjs apps/desktop/tests/e2e/api-client-smoke.spec.mjs`：5/5
- 全量验证：
  - `npm test`：通过。
  - `npm run build`：通过。
  - `npm run test:qa`：通过，9/9。
- Browser 手工验收：通过。
  - 使用临时 HTTP fixture server，未污染全局 `127.0.0.1:4317`。
  - completed/failed session detail 可显示 `Exit Code` 和 `End Reason`。
  - 验收样例显示 `Exit Code7`、`End Reasonprocess exited with code 7`。

## 7. 未解决问题

- 当前真实 `127.0.0.1:4317` 上的旧 session 是 P1.12 之前生成的 snapshot，不会 retroactively 拥有 exit metadata。
- CLI adapter 已发送 `exitCode/reason`，但需要重新跑新的 smoke 才能在主 API snapshot 中看到持久化后的字段。
- Detail 仍没有 “查看事件” 或 “Attach/打开终端” 操作。
- 左侧 tool stack 仍是静态图标。

## 8. 下一位 agent 需要知道的上下文

- 进入下一步前先更新 `docs/handoffs/main-agent-context-checkpoint-p1.md`。
- 如果要验证真实链路，应重启/确认 API 使用最新 build，然后重新跑 `npm run smoke:notch-run` 或失败码 fixture。
- 不要再新增 `reason` 到 `Session`，统一使用 `endReason`。
- 如果要显示 signal，应考虑新增 `endSignal?: string`，不要塞进 `endReason` 后再解析字符串。
