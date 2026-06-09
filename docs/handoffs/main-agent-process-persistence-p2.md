# Main Agent Handoff: P2.3 Process Persistence

日期：2026-06-08  
Agent：Main Agent  
阶段：P2.3

## 本次目标

持久化 P2.2 已形成的 process action audit、retry launch profile 和 retry risk replay result，让 Manager 重启后可以恢复这些安全上下文。

边界：

- Desktop 不直接读写持久化文件。
- `local-manager-mock` 不依赖 Node `fs`，只定义 storage port。
- `local-manager-api` 提供可选 JSON file store。
- 不修改 shared model、protocol envelope、EventQueue/StateMachine 或 real CLI adapter。

## 已完成内容

- `local-manager-mock` 新增持久化 port：
  - `ProcessPersistenceStore`
  - `ProcessPersistenceSnapshot`
- `local-manager-mock` 新增 retry risk replay 记录：
  - `RetryRiskReplayRecord`
  - `RetryRiskReplayDecision`
  - `getRetryRiskReplayRecords()`
- Manager 启动时可从 store hydrate：
  - process action audit
  - retry launch profiles
  - retry risk replay records
- Manager 状态变化时保存 process snapshot：
  - 注册 retry launch profile
  - 写入 process action audit
  - 记录 retry risk replay
  - safe retry 后更新 `retryAttemptActive`
  - reset 清空 process persistence state
- `local-manager-api` 新增 JSON file store：
  - `JsonFileProcessPersistenceStore`
  - `createLocalManagerApi({ processPersistenceFile })`
  - `NOTCH_PROCESS_PERSISTENCE_FILE`
  - `--process-persistence-file`

## 修改/新增文件

- 修改 `packages/local-manager-mock/src/mock-local-agent-manager.ts`
- 修改 `packages/local-manager-mock/src/index.ts`
- 修改 `packages/local-manager-mock/tests/mock-local-agent-manager.test.mjs`
- 新增 `packages/local-manager-api/src/process-persistence-store.ts`
- 修改 `packages/local-manager-api/src/local-manager-api.ts`
- 修改 `packages/local-manager-api/src/index.ts`
- 修改 `packages/local-manager-api/src/bin/server.ts`
- 修改 `packages/local-manager-api/tests/local-manager-api.test.mjs`
- 修改 `docs/contracts/retry-terminate-p2.md`
- 修改 `docs/contracts/local-manager-api.md`
- 修改 `docs/handoffs/main-agent-context-checkpoint-p2.md`
- 新增 `docs/handoffs/main-agent-process-persistence-p2.md`

## 关键决策

- 持久化 port 放在 `local-manager-mock`，实际文件存储放在 `local-manager-api`，保持浏览器 mock mode 可打包。
- 默认不启用 JSON file store，避免测试和开发启动时自动落盘。
- JSON file store 写入 `{ schemaVersion: 1, processState }`，为后续 schema 迁移留位置。
- P2.3 持久化的是审计和恢复上下文，不持久化 action result cache；因此 process action `requestId` 幂等 replay 尚不跨重启。
- `reset()` 会清空 process persistence state，符合 debug reset 的“清空数据”语义。

## 暴露的接口或数据结构

```ts
interface ProcessPersistenceSnapshot {
  processActionAudit: readonly ProcessActionAuditRecord[];
  retryLaunchProfiles: readonly RetryLaunchProfileRecord[];
  retryRiskReplays: readonly RetryRiskReplayRecord[];
}

interface ProcessPersistenceStore {
  load(): ProcessPersistenceSnapshot | null | undefined;
  save(snapshot: ProcessPersistenceSnapshot): void;
}
```

```ts
type RetryRiskReplayDecision = "passed" | "blocked" | "approved_skip";

interface RetryRiskReplayRecord {
  requestId: string;
  eventId: string;
  sessionId: string;
  launchProfileHash: string;
  commandHash: string;
  decision: RetryRiskReplayDecision;
  replayedAt: ISODateTimeString;
  riskEventId?: string;
  riskLevel?: string;
  message: string;
}
```

API usage:

```ts
createLocalManagerApi({
  processPersistenceFile: ".notch/process-state.json",
});
```

CLI usage:

```sh
NOTCH_PROCESS_PERSISTENCE_FILE=.notch/process-state.json npm run serve -w @notch-ai-monitor/local-manager-api
notch-local-manager-api --process-persistence-file .notch/process-state.json
```

## 测试结果

通过：

- `npm run test -w @notch-ai-monitor/local-manager-mock`（22/22）
- `npm run test -w @notch-ai-monitor/local-manager-api`（9/9）
- `npm run build:app -w @notch-ai-monitor/desktop`
- `npm run test:qa`（10/10）
- `git diff --check`
- `curl -fsS http://127.0.0.1:4317/health`

新增测试覆盖：

- mock manager 可通过 fake store 跨实例 hydrate retry launch profile、process action audit、retry risk replay records。
- JSON file store 可落盘并读取三类 process state records。
- `createLocalManagerApi({ processPersistenceFile })` 可从 JSON file hydrate retry launch profile。

补充检查：

- `rg` 检查没有新增 `process.kill`、`child_process`、`spawn(`、`exec(`、`SIGKILL`、`kill -9` 实现。
- Desktop build/QA 仍走默认 mock/API 行为，没有直接读取持久化文件。

## 未解决问题

- 没有 SQLite 或迁移系统；当前是 schemaVersion 1 JSON 文件。
- 没有跨重启 action result idempotency cache。
- 没有持久化完整 event history；本轮只持久化 P2.2 process side effect 上下文。
- real CLI adapter 尚未注册真实 launch profile/process ownership。
- Desktop 没有显示持久化审计历史。

## 下一位 agent 需要知道的上下文

- P2.3 已完成最小 process persistence，可以进入 P2.4 real CLI adapter hardening。
- 如果继续 P2.3 扩展，下一步应设计完整 event history persistence，而不是让 Desktop 直接读 JSON 文件。
- 如果进入 P2.4，应让 real CLI adapter 注册 launch profile/process ownership，并复用 P2.3 的 `ProcessPersistenceStore`。
