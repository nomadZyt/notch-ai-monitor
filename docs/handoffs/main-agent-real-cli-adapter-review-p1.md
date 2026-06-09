# Main Agent Real CLI Adapter Review P1 Handoff

日期：2026-06-06  
Agent：Main Agent  
阶段：P1.1 真实 CLI Adapter 集成复核  
工作目录：`/Users/zhaiyongtao/vibeCoding/notch-ai-monitor`

## 1. 本次目标

- 复核 Real CLI Adapter Agent 的交付是否满足 P1.1 真实来源接入目标。
- 验证 `Cursor/Codex App/Claude Code CLI` 等真实来源能转换为 protocol envelope 并进入 Local Manager API。
- 验证 `real adapter -> Manager API -> SSE -> Notch UI -> 用户动作 -> event resolved` 闭环。

## 2. 已完成内容

- 审阅 `@notch-ai-monitor/cli-adapter-real` 的 profile、scan、stdin、emit、parser、HTTP post 和测试实现。
- 发现初版 `scan` 会把 Cursor/Codex App 的 helper 子进程全部上报为 session，导致 Session Hub 被 66 个 session 污染。
- 主 agent 已修正 scan 去噪逻辑：
  - Cursor/Codex App 只上报主进程。
  - Codex App 内部 `app-server` 不当成 Codex CLI。
  - CLI profile 只匹配实际 `codex`、`claude`、`qwen` 命令。
- 更新了 real adapter 测试和 contract 文档，明确 helper 进程不会作为独立 session 上报。
- 使用当前机器真实进程 live 验收：
  - Cursor App -> `sess_real_cursor_app_2058`
  - Codex App -> `sess_real_codex_app_63559`
  - Claude Code CLI -> `sess_real_claude_code_cli_48512`
- 使用 `emit --profile claude-code-cli --type confirm --command "rm -rf ~/Documents/xhs-drafts/* && git clean -fd"` 验证危险命令会被 manager/risk-policy 升级为 critical risk。
- 在浏览器里验证 Notch UI 收到风险事件，点击 `拒绝执行` 后事件 resolved，API activeEvents 回到 0。

## 3. 修改/新增文件

- `packages/cli-adapter-real/src/index.ts`
- `packages/cli-adapter-real/tests/cli-adapter-real.test.mjs`
- `docs/contracts/real-cli-adapter.md`
- `docs/handoffs/main-agent-real-cli-adapter-review-p1.md`

## 4. 关键决策

- 接受 real adapter 的 P1.1 方向：`scan` 只做 session discovery，事件内容通过 `stdin` / `emit` / 后续 wrapper 或 tool hook 进入。
- 不尝试读取已打开终端内容，不 attach TTY，不执行真实命令。
- 对 GUI app 只用主进程代表 app-level session，避免把 Electron/Chromium helper 当作 AI 会话。
- 危险命令仍以 confirm event 进入 manager，由 risk-policy 统一升级 risk。

## 5. 暴露的接口或数据结构

- CLI bin：`notch-cli-adapter-real`
- npm script：`npm run send -w @notch-ai-monitor/cli-adapter-real -- <scan|stdin|emit> ...`
- 支持 profiles：
  - `codex-cli`
  - `claude-code-cli`
  - `qwen-cli`
  - `cursor-app`
  - `codex-app`
  - `custom`
- 主要 exported helpers：
  - `resolveSourceProfile`
  - `createSession`
  - `parsePsOutput`
  - `classifyOutputLine`
  - `createEventFromLine`
  - `createEventFromType`
  - `createSessionUpsertEnvelope`
  - `createEventCreatedEnvelope`
  - `postEnvelope`

## 6. 测试结果

- `npm run test -w @notch-ai-monitor/cli-adapter-real`：通过，6/6。
- `npm run build`：通过。
- `npm test`：通过。
  - shared 9/9
  - local-manager-mock 8/8
  - risk-policy 6/6
  - local-manager-api 5/5
  - cli-adapter-mock 3/3
  - cli-adapter-real 6/6
- Live API/browser 验收通过：
  - `scan` 修正后发现 3 个真实来源 session。
  - `emit` 危险 confirm 被升级为 critical risk。
  - 浏览器 UI 收到风险事件并显示 `angry` / `peek` / `风险`。
  - UI 点击 `拒绝执行` 后 API snapshot 中事件状态为 `ignored`，`counts.activeEvents === 0`。
  - 浏览器 error log 为空。

## 7. 未解决问题

- `scan` 仍只能代表 app 或 CLI process，不代表具体窗口、tab、terminal pane 或 agent task。
- `stdin` parser 是保守正则，后续需要按 Codex/Claude/Qwen 真实输出格式做结构化解析。
- 尚未实现 wrapper 模式、TTY attach、Cursor/Codex App 插件 hook 或真实 action 执行。
- 当前 `emit` 未传 `--cwd` 时会使用 adapter 自己的 `process.cwd()`，后续 wrapper/tool hook 应传真实项目 cwd。

## 8. 下一位 agent 需要知道的上下文

- 下一步推荐做 `Wrapper Agent`：让 adapter 启动真实 CLI 并代理 stdout/stderr，这样能拿到事件内容而不需要 attach 已打开 TTY。
- 如果继续做 app 级集成，Cursor/Codex App 更适合走 extension/plugin/tool hook，而不是靠 `ps` 或 shell history。
- 保持 UI 只信任 Manager API snapshot/SSE；adapter 不应直接改 UI state。
