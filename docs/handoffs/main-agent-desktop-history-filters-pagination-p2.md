# Main Agent Handoff: Desktop History Filters / Pagination P2

日期：2026-06-08
阶段：P2 Desktop history visibility polish
状态：完成

## 本次目标

在 Desktop Session Hub 中实现完整一点的 History filters / pagination UI，消费已有 Manager/API read-only event history projection；保持 Desktop 与业务逻辑解耦，不读取 persistence file，不新增 retry/terminate side effect。

## 已完成内容

- Session Hub 的“事件历史”区块新增：
  - status filter：全部、待处理、解决、忽略、过期。
  - type filter：全部、风险、错误、确认、结果。
  - cursor pagination：上一页、下一页、页码/本页条数。
- `UIStore` 新增 history filter 与 cursor stack 状态。
- Desktop history refresh 从“一次拉全局 40 条”改为：
  - 当前 selected session。
  - 当前 status/type filters。
  - 当前 cursor。
  - `limit=5`。
- History rows 继续只读，不绑定新的 action shortcut。
- API smoke 新增同 session 6 条 history 的 pagination 覆盖。
- Mock smoke 新增 history type/status filter 覆盖。
- Local Manager API test server close 显式关闭 idle/all connections，避免新增 projection fetch + SSE 在 Playwright teardown 中拖住临时 server。

## 修改/新增文件

- 修改 `apps/desktop/src/state/ui-store.ts`
- 修改 `apps/desktop/src/app/app-shell.ts`
- 修改 `apps/desktop/src/ui/styles/notch.css`
- 修改 `apps/desktop/tests/e2e/p0-smoke.spec.mjs`
- 修改 `apps/desktop/tests/e2e/api-client-smoke.spec.mjs`
- 修改 `packages/local-manager-api/src/local-manager-api.ts`
- 修改 `docs/contracts/event-history-pending-actions-p2.md`
- 修改 `docs/handoffs/main-agent-context-checkpoint-p2.md`
- 新增 `docs/handoffs/main-agent-desktop-history-filters-pagination-p2.md`

## 关键决策

- History pagination 走 `GET /v1/event-history` 的 cursor contract，不在 Desktop 本地一次加载无限历史。
- Pagination 是 per selected session 的；切换 session 或 filter 会重置 cursor。
- Pending action timeout/heartbeat 没有在本切片实现，因为它会改变 action lifecycle，需要单独合同。
- History item 不提供 retry/terminate shortcut，避免绕过 `notch.action.requested`。
- API close 的连接清理只影响 server shutdown/test teardown，不改变运行期 endpoint 或 side effect 行为。

## 暴露的接口或数据结构

Desktop UI state：

```ts
type HistoryStatusFilter = "all" | EventStatus;
type HistoryTypeFilter = "all" | EventType;

interface UIState {
  historyStatusFilter: HistoryStatusFilter;
  historyTypeFilter: HistoryTypeFilter;
  historyCursor: string | null;
  historyCursorStack: Array<string | null>;
}
```

Desktop history query：

```ts
getEventHistory({
  sessionId,
  status,
  type,
  cursor,
  limit: 5,
});
```

## 测试结果

- `npm run test -w @notch-ai-monitor/local-manager-api`：20/20 通过。
- `npm run build:app -w @notch-ai-monitor/desktop`：通过。
- `npm run test:qa`：12/12 通过。
- `npm run build`：通过。
- in-app browser API mode：通过。
  - Session Hub 可见 History status/type filters 和 pager。
  - 点击 type=`risk` 后 History rows 从 2 条变为 1 条。
  - filtered row 文本为“风险 已拦截危险命令 待处理 · 6/6 11:42”。
  - console error 0。

## 未解决问题

- Pending action timeout/heartbeat 策略未实现。
- History retention/archive/clear 产品策略未定。
- `notch.history.updated` SSE envelope 仍未设计；当前 read-only endpoint + snapshot 足够本切片。
- History filter 还没有 project/cwd 聚合维度。

## 下一位 agent 需要知道的上下文

- 当前最稳下一步：pending action timeout/heartbeat 策略合同和最小 runtime tests。
- Desktop 仍不得直接读取 `.notch/event-history.json`、process persistence file、action audit 或 adapter control token。
- 如果继续做 UI polish，优先补 mobile History filter overflow/empty states，不要新增真实 action side effect。
- `terminate` 真实能力仍只能 graceful stop，不能在 History/Pending UI 上增加 force kill。
