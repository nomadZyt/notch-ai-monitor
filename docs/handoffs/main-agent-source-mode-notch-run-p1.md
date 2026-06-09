# Main Agent P1.4 Source Mode + Notch Run Handoff

日期：2026-06-07  
Agent：Main Agent  
阶段：P1.4 Source Mode + Notch Runner  
工作目录：`/Users/zhaiyongtao/vibeCoding/notch-ai-monitor`

## 1. 本次目标

- 解决用户无法区分页面中的 CLI session 是模拟、fixture、扫描、wrapper 还是真实接入的问题。
- 增加最小真实启动入口 `notch-run`，让 Notch 可以显式启动真实 CLI child process 并标记为 `live`。
- 增加开发/验收用 reset 入口，避免上次验证数据残留到页面中。

## 2. 已完成内容

- 新增强类型 `SourceMode = "mock" | "fixture" | "wrapper" | "scan" | "live"`。
- `Session` 和 `ProtocolSource` 增加可选 `sourceMode` 字段。
- 内置 fixture sessions 标记为 `fixture`。
- `MockLocalAgentManager` 新增 `reset()`，清空 sessions/events 并广播空 snapshot。
- Local Manager API 新增 `POST /v1/debug/reset`。
- `cli-adapter-real` 新增 `--source-mode` 参数。
- `scan` 默认 `sourceMode: "scan"`，`emit` 默认 `fixture`，`stdin` 默认 `live`，`wrapper` 默认 `wrapper`。
- 新增 `notch-run` bin，复用 wrapper，但默认 `sourceMode: "live"`。
- Desktop client 新增 `resetSnapshot()`。
- Desktop UI 在 session row 和 event panel 中展示来源模式 badge。
- Demo tray 的 `重置队列` 改成 `清空数据`，调用 `/v1/debug/reset`。
- 更新协议和 API/adapter contract 文档。

## 3. 修改/新增文件

| 文件 | 类型 | 说明 |
| --- | --- | --- |
| `packages/shared/src/models/primitives.ts` | 修改 | 新增 `SourceMode` |
| `packages/shared/src/models/session.ts` | 修改 | `Session.sourceMode` |
| `packages/shared/src/protocol/envelope.ts` | 修改 | `ProtocolSource.sourceMode` |
| `packages/shared/src/models/index.ts` | 修改 | 导出 `SourceMode` |
| `packages/shared/src/fixtures/sessions.ts` | 修改 | fixture sessions 标记 `sourceMode: "fixture"` |
| `packages/local-manager-mock/src/mock-local-agent-manager.ts` | 修改 | 新增 `reset()` |
| `packages/local-manager-mock/tests/mock-local-agent-manager.test.mjs` | 修改 | reset 测试 |
| `packages/local-manager-api/src/local-manager-api.ts` | 修改 | 新增 `POST /v1/debug/reset` |
| `packages/local-manager-api/tests/local-manager-api.test.mjs` | 修改 | reset API 测试 |
| `packages/cli-adapter-real/src/index.ts` | 修改 | `--source-mode`、sourceMode defaults、`runNotchRun()` |
| `packages/cli-adapter-real/src/bin/notch-run.ts` | 新增 | `notch-run` bin 入口 |
| `packages/cli-adapter-real/package.json` | 修改 | 暴露 `notch-run` bin 和 `npm run run` |
| `packages/cli-adapter-real/tests/cli-adapter-real.test.mjs` | 修改 | sourceMode 和 notch-run 测试 |
| `apps/desktop/src/manager-client/types.ts` | 修改 | client 增加 `resetSnapshot()` |
| `apps/desktop/src/manager-client/local-manager-api-client.ts` | 修改 | 调用 `/v1/debug/reset` |
| `apps/desktop/src/manager-client/mock-manager-client.ts` | 修改 | mock reset |
| `apps/desktop/src/app/app-shell.ts` | 修改 | 来源模式 badge、清空数据按钮 |
| `apps/desktop/src/ui/styles/notch.css` | 修改 | source mode badge 样式 |
| `docs/contracts/event-protocol.md` | 修改 | 记录 `SourceMode` |
| `docs/contracts/local-manager-api.md` | 修改 | 记录 `/v1/debug/reset` |
| `docs/contracts/real-cli-adapter.md` | 修改 | P1.4 sourceMode / notch-run 文档 |
| `docs/handoffs/main-agent-source-mode-notch-run-p1.md` | 新增 | 本 handoff |

## 4. 关键决策

- `sourceMode` 放在 `Session` 与 `ProtocolSource`，不放在 `NotchEvent`，因为它描述的是会话/传输来源，不是事件类型。
- `notch-run` 不复制 wrapper 实现，只是预置 `wrapper --source-mode live`，保持安全边界和 parser 入口统一。
- `POST /v1/debug/reset` 不走 envelope；它是开发/验收控制面，后续正式产品可替换为 Tauri IPC 或 dev-only command。
- Qwen 第一版仍不做专项 parser，本轮只影响来源标识和启动入口。

## 5. 暴露的接口或数据结构

- `SourceMode`：
  - `mock`
  - `fixture`
  - `wrapper`
  - `scan`
  - `live`
- `Session.sourceMode?: SourceMode`
- `ProtocolSource.sourceMode?: SourceMode`
- `MockLocalAgentManager.reset(): ManagerSnapshot`
- `POST /v1/debug/reset`
- CLI:
  - `--source-mode mock|fixture|wrapper|scan|live`
  - `npm run run -w @notch-ai-monitor/cli-adapter-real -- --profile codex-cli -- codex`
  - installed bin: `notch-run --profile claude-code-cli -- claude`

## 6. 测试结果

- `npm test`：通过。
  - shared 9/9
  - local-manager-mock 9/9
  - risk-policy 6/6
  - local-manager-api 6/6
  - cli-adapter-mock 3/3
  - cli-adapter-real 12/12
- `npm run build`：通过。
- Browser 验收：
  - `notch-run` live smoke 发送 `Codex CLI` result。
  - UI 展开事件面板显示 `Codex CLI · Terminal · 真实`。
  - Event facts 显示 `Mode: 真实`。
  - 点击 demo tray `清空数据` 后 UI 回到 `全部安静`。
  - API snapshot 确认 sessions/events/activeEventIds 全部为空。

## 7. 未解决问题

- `notch-run` 当前验证使用 `node -e` smoke；真实 `codex` / `claude` CLI 仍需要用户本机命令可用并登录。
- 还没有 attach 已打开终端，也没有读取 shell history。
- `scan` 仍只产生 session，不读取输出事件。
- Cursor App / Codex App 仍没有 app-specific structured event hook。
- `sourceMode` 目前只用于 UI 标识，没有进入持久化或审计日志。

## 8. 下一位 agent 需要知道的上下文

- 下一步可以做 P1.5：真实 `notch-run --profile codex-cli -- codex` / `notch-run --profile claude-code-cli -- claude` smoke guide 和更真实的 fixture capture。
- 如果要接入已打开终端，先设计 TTY/pty/structured hook 的最小协议，不要让 UI 直接读取终端输出。
- 若扩展 source provenance，优先新增字段到 `Session` 或 `ProtocolSource`，不要把来源模式散落到 event summary 文本中。
