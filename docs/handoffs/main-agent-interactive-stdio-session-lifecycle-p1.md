# Main Agent P1.7 Interactive Stdio + Session Lifecycle Handoff

日期：2026-06-07  
Agent：Main Agent  
阶段：P1.7 Interactive Stdio + Session Lifecycle  
工作目录：`/Users/zhaiyongtao/vibeCoding/notch-ai-monitor`

## 1. 本次目标

- 执行 P1 的真实交互 CLI 下一步：为 `notch-run -- codex` / `notch-run -- claude` 定义并实现最小交互式 stdio 边界。
- 保持不 attach 已打开终端、不读取 shell history、不从 UI 向真实 CLI 注入 stdin。
- 让真实 child process 退出后通过 Manager API 更新 session lifecycle，而不是只在 wrapper summary 中出现 exit code。

## 2. 已完成内容

- `wrapper` / `notch-run` 新增 `--stdio capture|inherit`：
  - `capture`：默认行为，stdin inherit，stdout/stderr pipe 捕获、原样转发并解析事件。
  - `inherit`：stdin/stdout/stderr 全继承当前 terminal，适合交互式 Codex/Claude；adapter 不解析输出事件。
- adapter 新增 `notch.session.ended` envelope 生成和发送。
- Local Manager mock 新增 `endSession(sessionId, state)`。
- Local Manager API 新增 `notch.session.ended` ingest 分支。
- 更新真实 CLI adapter 合同到 P1.7，文档化 stdio mode、session lifecycle 和交互式 CLI 推荐命令。
- 读取并纳入 CLI Adapter Agent notes：`docs/handoffs/cli-adapter-agent-interactive-cli-contract-notes-p1.md`。其中“没有 session ended contract”是该 notes 生成时的缺口，已在本阶段实现。

## 3. 修改/新增文件

| 文件 | 类型 | 说明 |
| --- | --- | --- |
| `packages/cli-adapter-real/src/index.ts` | 修改 | 新增 `WrapperStdioMode`、`--stdio`、`createSessionEndedEnvelope`、child exit 后发送 `notch.session.ended` |
| `packages/cli-adapter-real/tests/cli-adapter-real.test.mjs` | 修改 | 新增 stdio inherit、session ended envelope 和 lifecycle 测试 |
| `packages/local-manager-mock/src/mock-local-agent-manager.ts` | 修改 | 新增 `endSession` |
| `packages/local-manager-mock/tests/mock-local-agent-manager.test.mjs` | 修改 | 新增 session end 状态测试 |
| `packages/local-manager-api/src/local-manager-api.ts` | 修改 | 支持 ingest `notch.session.ended` |
| `packages/local-manager-api/tests/local-manager-api.test.mjs` | 修改 | 新增 session ended API 测试 |
| `docs/contracts/real-cli-adapter.md` | 修改 | P1.7 合同、stdio mode、session ended payload |
| `docs/handoffs/cli-adapter-agent-interactive-cli-contract-notes-p1.md` | 新增 | CLI Adapter Agent 旁路 contract notes |
| `docs/handoffs/main-agent-interactive-stdio-session-lifecycle-p1.md` | 新增 | 本 handoff |

## 4. 关键决策

- `capture` 继续作为默认，不破坏现有 parser、smoke 和 UI event 链路。
- `inherit` 是交互式 CLI 的 P1 最小边界：真实 CLI 拿到原生 terminal，但 adapter 不读取 inherited 输出，所以不产生事件。
- `notch.session.ended` 只更新已有 session；缺失 session 返回 `session_not_found`，避免生命周期事件凭空创建 session。
- UI action 仍只处理 Notch event 状态，不向 child stdin 写入内容。
- 真正 TTY attach、PTY 管理、已有终端接管和 UI-to-stdin 注入继续排除在 P1 外。

## 5. 暴露的接口或数据结构

- CLI 参数：
  - `--stdio capture`
  - `--stdio inherit`
- TypeScript：
  - `WrapperStdioMode = "capture" | "inherit"`
  - `createSessionEndedEnvelope(session, profile, exitCode, signal, now?)`
  - `MockLocalAgentManager.endSession(sessionId, state)`
- Protocol event：
  - `notch.session.ended`
  - payload：`{ sessionId, state: "completed" | "failed", exitCode?, reason? }`

## 6. 测试结果

- `npm run test -w @notch-ai-monitor/local-manager-mock`：通过，10/10。
- `npm run test -w @notch-ai-monitor/local-manager-api`：通过，7/7。
- `npm run test -w @notch-ai-monitor/cli-adapter-real`：通过，16/16。
- `npm test`：通过。
- `npm run build`：通过。
- 已重启本地 API 和 desktop dev server。
- `npm run smoke:notch-run`：通过，summary 显示 `stdio: "capture"`、`sessionEnded: "notch.session.ended"`、`counts.activeSessions: 0`、`counts.activeEvents: 1`。
- `npm run run -w @notch-ai-monitor/cli-adapter-real -- --url http://127.0.0.1:4317 --profile codex-cli --stdio inherit --session-id sess_interactive_inherit_codex_version -- codex --version`：通过，真实输出 `codex-cli 0.137.0-alpha.4`，summary 显示 `stdio: "inherit"`、`eventTypes: []`、session ended 为 `completed`。

## 7. 未解决问题

- `--stdio inherit` 不解析事件，这是刻意边界；后续若要事件，需要工具 hook、PTY 或保留 `capture`。
- 真实 `codex` / `claude` 长期交互是否要求 stdout 是 TTY，需要人工或专门 E2E 验收。
- UI 暂不展示 completed/failed session 的更多 lifecycle 细节，只通过 snapshot counts 反映 active session 变化。
- 未实现 signal 转发策略、terminal size、raw mode、existing terminal attach。

## 8. 下一位 agent 需要知道的上下文

- P1.7 后，`notch-run` 可用于两类场景：
  - event 解析 smoke：默认 `capture`，例如 `npm run smoke:notch-run`。
  - 真实交互 CLI 生命周期：`--stdio inherit`，只验证 live session start/end。
- 如果要继续做 UI，可考虑在 Session Hub 里更清楚地区分 running/completed/failed，但不要把它和 parser/TTY 改动混在一起。
- 如果要继续做真实 CLI 事件，优先收集 Codex/Claude 的真实输出 fixture，再调整 parser。
