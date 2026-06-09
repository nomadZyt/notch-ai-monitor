# Main Agent P1.10 Quiet Session Hub Access Handoff

日期：2026-06-07  
Agent：Main Agent  
阶段：P1.10 Quiet Session Hub Access  
工作目录：`/Users/zhaiyongtao/vibeCoding/notch-ai-monitor`

## 1. 本次目标

- 解决 P1.9 暴露的 UX 缺口：无 active event 但存在 running CLI session 时，用户也能打开 Session Hub 查看会话。
- 保持 quiet state 的低打扰原则，不把 running/no-event 误提升成 alert/action 状态。
- 不修改 Local Manager API、CLI Adapter 或 protocol envelope。

## 2. 已完成内容

- Desktop 根节点新增 `data-has-sessions`，用于 CSS 区分 “真空闲” 和 “有 session 但无事件”。
- 左侧 Session Hub 胶囊在 `dormant + none + hasSessions` 下可见、可点、可聚焦。
- 左侧胶囊 `tabIndex` 现在在有 session 且可见时设为 `0`，无 session 或 glance 隐藏时保持 `-1`。
- 左侧胶囊 `aria-label` 动态包含 session 数量和 meta，例如 `查看全部 AI 会话，1 个会话，1 活跃 · 0 事件`。
- 更新 running/no-event API-client E2E：
  - 验证 quiet state 保持 `dormant/none`。
  - 验证左胶囊可聚焦并可打开 Session Hub。
  - 验证 Session Hub row 显示 `Codex CLI`、`真实`、`运行中`。

## 3. 修改/新增文件

| 文件 | 类型 | 说明 |
| --- | --- | --- |
| `apps/desktop/src/app/app-shell.ts` | 修改 | 根节点暴露 `data-has-sessions`；左胶囊 tabIndex/aria-label 动态化 |
| `apps/desktop/src/ui/styles/notch.css` | 修改 | 允许 dormant/no-event 且有 session 时显示左胶囊入口 |
| `apps/desktop/tests/e2e/api-client-smoke.spec.mjs` | 修改 | 扩展 running/no-event lifecycle E2E，覆盖 Session Hub 展开 |
| `docs/handoffs/main-agent-quiet-session-hub-access-p1.md` | 新增 | 本 handoff |

## 4. 关键决策

- `running/no-event` 仍然是 quiet state：`#desktop` 保持 `data-state="dormant"`、`data-mood="none"`。
- 只开放左侧 Session Hub，不开放右侧 Action panel；右侧仍在无事件时提示 `当前没有需要处理的事件`。
- CSS 规则限定为 `data-has-sessions="true" + data-state="dormant" + data-mood="none"`，避免影响 expanded 或 active-event 状态。
- 没有新增状态机事件；复用现有 `openPanel("sessions")`。

## 5. 暴露的接口或数据结构

- 没有新增生产协议。
- UI DOM state 新增：
  - `#desktop[data-has-sessions="true" | "false"]`
- UI 可访问性：
  - `#leftCapsule[aria-label]` 动态描述当前 Session Hub summary。
  - `#leftCapsule[tabindex="0"]` 表示当前可通过键盘访问。

## 6. 测试结果

- `npm run build:app -w @notch-ai-monitor/desktop`：通过。
- `npx playwright test -c apps/desktop/tests/playwright.config.mjs apps/desktop/tests/e2e/api-client-smoke.spec.mjs`：通过，5/5。
- `npm test`：通过。
- `npm run build`：通过。
- `npm run test:qa`：通过，9/9。
- Browser 手工验收：通过。
  - 使用临时 HTTP fixture server 提供 `GET /v1/snapshot` 与 `GET /v1/events`，未污染全局 `127.0.0.1:4317`。
  - 初始状态：`data-state="dormant"`、`data-mood="none"`、`data-has-sessions="true"`。
  - 左胶囊：`aria-label="查看全部 AI 会话，1 个会话，1 活跃 · 0 事件"`、`tabindex="0"`。
  - 点击左胶囊后：`data-state="expanded"`、`data-panel="sessions"`，session row 显示 `Codex CLI`、`真实`、`运行中`。

## 7. 未解决问题

- 左侧胶囊仍使用静态 tool stack 图标，不会按实际 session tools 动态裁剪。
- Session Hub row 点击无 active event 的 session 时仍只显示 toast，不打开 session detail；如果要做 detail panel，需要后续单独设计。

## 8. 下一位 agent 需要知道的上下文

- P1.10 是纯 UI 可访问性/交互增量，不改变 ManagerSnapshot 或 envelope。
- 后续如果继续做 Session Hub，可考虑把 “row click 无事件” 从 toast 升级成 session detail drawer。
- 如果做视觉回归，重点看 390px mobile 下 dormant/no-event 左右胶囊是否仍在 viewport 内。
