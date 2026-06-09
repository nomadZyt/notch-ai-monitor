# Main Agent Handoff: Event History JSON Persistence P2

日期：2026-06-08
阶段：P2 event history persistence
状态：完成

## 本次目标

给 Local Manager API 增加 event history / pending action projection 的可选 JSON persistence store，让 P2 event history runtime 能跨 API 重启恢复；保持与 P2.3 process persistence 的 logical section 分离，Desktop 继续只消费 Manager/API projection。

## 已完成内容

- `local-manager-api` 新增 `JsonFileEventHistoryPersistenceStore`。
- `createLocalManagerApi()` 新增 `eventHistoryPersistenceFile` option。
- server bin 新增：
  - `NOTCH_EVENT_HISTORY_PERSISTENCE_FILE`
  - `--event-history-persistence-file`
- Manager hydrate 时可从 event history JSON file 恢复：
  - event history records
  - timeline entries
  - pending action projection
  - cursorVersion
- `GET /v1/event-history` / `GET /v1/action-requests` 继续返回 Manager projection，不返回 JSON file 原文。
- 更新 event history / Local Manager API 合同文档。
- 更新上一份 implementation handoff 中已过时的 “API JSON persistence 尚未接” 说明。

## 修改/新增文件

- 新增 `packages/local-manager-api/src/event-history-persistence-store.ts`
- 修改 `packages/local-manager-api/src/index.ts`
- 修改 `packages/local-manager-api/src/local-manager-api.ts`
- 修改 `packages/local-manager-api/src/bin/server.ts`
- 修改 `packages/local-manager-api/tests/local-manager-api.test.mjs`
- 修改 `docs/contracts/local-manager-api.md`
- 修改 `docs/contracts/event-history-pending-actions-p2.md`
- 修改 `docs/handoffs/main-agent-event-history-pending-actions-implementation-p2.md`
- 修改 `docs/handoffs/main-agent-context-checkpoint-p2.md`
- 新增 `docs/handoffs/main-agent-event-history-json-persistence-p2.md`

## 关键决策

- Event history persistence 与 process persistence 是两个 contract/logical sections。
- 当前 JSON schema 为：

```ts
interface PersistedEventHistoryStateFile {
  schemaVersion: 1;
  eventHistory: EventHistoryPersistenceSnapshot;
}
```

- Store 只由 Local Manager API/Manager 读写；Desktop 不读取 persistence file。
- Store 会接受旧式 bare `EventHistoryPersistenceSnapshot` 作为 hydrate fallback，方便测试或早期文件迁移。
- 不修改 shared model/API/protocol/EventQueue/StateMachine/real CLI adapter。
- 本切片不新增 Desktop UI，也不接 retry/terminate 新 side effect。

## 暴露的接口或数据结构

Local Manager API package export：

```ts
export { JsonFileEventHistoryPersistenceStore } from "./event-history-persistence-store.js";
```

Local Manager API option：

```ts
interface LocalManagerApiOptions {
  eventHistoryPersistenceFile?: string;
}
```

启动参数：

```sh
NOTCH_EVENT_HISTORY_PERSISTENCE_FILE=.notch/event-history.json \
  npm run serve -w @notch-ai-monitor/local-manager-api

npm run serve -w @notch-ai-monitor/local-manager-api -- \
  --event-history-persistence-file .notch/event-history.json
```

## 测试结果

- `npm run test -w @notch-ai-monitor/local-manager-api`：20/20 通过。
- `npm run build`：通过。
- `npm run test:qa`：11/11 通过。
- `git diff --check`：通过。
- 运行态 API persistence smoke：通过。
  - 使用 `/tmp/notch-event-history-p2.json` 启动 API。
  - 注入 `all` 后文件写出 `schemaVersion=1`、`events=4`、`timeline=4`、`pendingActions=0`、`cursorVersion=4`。
  - 重启同一文件后 `/v1/event-history?limit=10` 返回 `history=4`、`totalEvents=4`。
- in-app browser API mode：通过。
  - 展开 Session Hub 后可见“动作状态”和“事件历史”。
  - console error 0。

## 未解决问题

- Desktop History/Pending 还没有完整分页 UI；当前仍是 session detail 里的近期只读 projection。
- Pending action timeout/heartbeat 策略未定。
- History retention/archive/clear 产品策略未定。
- 还没有设计 `notch.history.updated` SSE envelope；当前 snapshot/read-only endpoint 已足够本切片。

## 下一位 agent 需要知道的上下文

- 当前最稳下一步是 Desktop History filters/pagination UI，或者 pending action timeout/heartbeat 策略。
- 不要让 Desktop 直接读取 `.notch/event-history.json`、process persistence file、action audit 或 adapter control token。
- Event history JSON persistence 是 Local Manager API opt-in；默认开发启动仍不自动落盘。
- `retry` / `terminate` 真实能力仍必须走现有 Manager/supervisor/control-channel 合同；不能在 history/pending UI 上增加绕过 action request 的快捷操作。
- 当前验证服务：Local Manager API `http://127.0.0.1:4317` 以 `--process-side-effects supervised --event-history-persistence-file /tmp/notch-event-history-p2.json` 运行；Desktop Vite `http://127.0.0.1:5174` 运行中。
