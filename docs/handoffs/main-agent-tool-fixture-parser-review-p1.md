# Main Agent P1.3 Tool Fixture Parser Review Handoff

日期：2026-06-06  
Agent：Main Agent  
阶段：P1.3 Real CLI Adapter Fixture Parser Review  
工作目录：`/Users/zhaiyongtao/vibeCoding/notch-ai-monitor`

## 1. 本次目标

- 审查 Tool Fixture Parser Agent 的 Codex CLI / Claude Code CLI profile-aware parser 工作。
- 按用户最新决策确认 Qwen 第一版不做专项 parser，只保留 profile、scan discovery 与 generic fallback。
- 做 P1.3 集成验证：真实 wrapper 输出 -> Local Manager API -> EventQueue -> Notch UI -> 用户动作 -> event resolved。

## 2. 已完成内容

- 审查了 `@notch-ai-monitor/cli-adapter-real` 的 parser 入口和测试 fixture。
- 确认 `createEventFromLine` 已切换到 `classifyOutputLineForProfile`。
- 确认 `classifyOutputLine(line)` 保持 P1.2 generic 行为兼容。
- 确认 Codex CLI 与 Claude Code CLI 有专项 parser，且普通 assistant 文本 fixture 不产生事件。
- 确认 Qwen 不新增专项 parser；`qwen-cli` 当前只走 generic fallback。
- 重启 Local Manager API，让验证快照从空状态开始。
- 用 `claude-code-cli` wrapper 做端到端验证，产生 `confirm`、`result`、`error` 三类事件。
- 在 in-app browser 中展开 Notch 面板，验证 UI 显示 `Claude Code CLI 确认，3 项待处理`。
- 点击 UI 的 `拒绝` action，确认 manager 将 confirm 事件置为 `ignored`，当前事件切换到 error，active events 从 3 变 2。

## 3. 修改/新增文件

| 文件 | 类型 | 说明 |
| --- | --- | --- |
| `docs/handoffs/main-agent-tool-fixture-parser-review-p1.md` | 新增 | 主 agent 对 P1.3 fixture parser 的审查、集成验证和下一步说明 |

本轮主 agent 没有修改 parser 源码；源码变更由 Tool Fixture Parser Agent 完成并记录在 `docs/handoffs/tool-fixture-parser-agent-p1.md`。

## 4. 关键决策

- P1.3 接受 fixture-driven parser，不追求官方结构化 CLI hook；真实结构化 hook 放到后续 P1/P2。
- Qwen 第一版暂不专项支持；当前保留 profile 是为了 scan/generic fallback 和后续扩展，不把 Qwen 行为写成专项承诺。
- UI 仍只消费 Local Manager API 的 snapshot/SSE，不直接解析 CLI 输出。
- wrapper 的安全边界保持不变：只执行 `--` 后显式传入的 child command；parser 提取的 command 只作为 event 数据，不会被 adapter 执行。

## 5. 暴露的接口或数据结构

- `classifyOutputLineForProfile(line, profileOrId)`：
  - `codex-cli`：专项 parser 后 fallback generic。
  - `claude-code-cli`：专项 parser 后 fallback generic。
  - `qwen-cli` / `cursor-app` / `codex-app` / `custom`：generic fallback only。
- `createEventFromLine(line, session, profile, options)`：
  - wrapper/stdin 的统一 event 创建入口。
  - `event.evidence.origin` 使用 `${profile.name} output`，例如 `Claude Code CLI output`。

## 6. 测试结果

- `npm run test -w @notch-ai-monitor/cli-adapter-real`：通过，11/11。
- `npm run build`：通过。
- `npm test`：通过。
  - shared：9/9
  - local-manager-mock：8/8
  - risk-policy：6/6
  - local-manager-api：5/5
  - cli-adapter-mock：3/3
  - cli-adapter-real：11/11
- Claude wrapper live validation：
  - 命令 profile：`claude-code-cli`
  - child output：`Bash: ...`、`Task completed: ...`、`Permission denied: ...`
  - adapter summary：`eventTypes = ["confirm", "result", "error"]`，`eventSendFailures = 0`
  - API snapshot：1 session，3 events，current 为 confirm，mood 为 waiting。
- UI action validation：
  - 初始 UI：`Claude Code CLI 确认，3 项待处理`
  - 点击 `拒绝` 后：`Claude Code CLI 失败，2 项待处理`
  - API snapshot：confirm 事件为 `ignored`，active events 为 error/result，current 为 error。

## 7. 未解决问题

- Codex/Claude parser 仍是代表性 fixture + 正则，无法覆盖所有真实 CLI 输出格式。
- 当前 parser 没有提取更细粒度字段，例如 cwd、affected paths、tool call id、structured metadata。
- scan 仍只能发现进程/session，不能读取已打开终端的历史输出。
- Cursor App / Codex App 当前只有 profile/scan 能力，没有 app-specific event hook。

## 8. 下一位 agent 需要知道的上下文

- 下一步更自然的方向是 P1.4：真实 CLI adapter 的 fixture 扩展与 smoke harness，或开始定义 TTY/structured hook 的最小接口。
- 如果继续扩展 Codex/Claude parser，必须先新增 fixture，再改 parser，避免普通 assistant 文本误触发。
- Qwen 暂缓，不要在没有真实 fixture 和新需求前补专项 parser。
- Local Manager API 和 desktop 当前可继续用：
  - API：`http://127.0.0.1:4317`
  - Desktop：`http://127.0.0.1:5174`
