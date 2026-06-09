# CLI Adapter Agent P1 Interactive CLI Contract Notes Handoff

日期：2026-06-07  
Agent：CLI Adapter Agent  
阶段：P1 Interactive CLI Contract Notes  
工作目录：`/Users/zhaiyongtao/vibeCoding/notch-ai-monitor`

## 1. 本次目标

- 为下一步“真实交互式 CLI 接入”做小范围 handoff，只记录契约和边界，不修改实现代码。
- 基于现有 `@notch-ai-monitor/cli-adapter-real`、`notch-run`、`notch-run-smoke` 和真实 CLI adapter 合同，梳理长期进程、stdin、退出、事件解析、用户动作边界。
- 特别写清当前 wrapper stdio 行为、为什么 P1 暂不做真正 TTY attach、P1 最小可验收标准，以及后续不应并发修改的文件。

## 2. 已完成内容

- 已阅读 `packages/cli-adapter-real/src/index.ts`，确认当前 `wrapper` / `notch-run` 的实际实现边界：
  - `notch-run(argv)` 等价于 `wrapper --source-mode live ...argv`。
  - `wrapper` 只启动 `--` 后用户显式传入的 child command。
  - child process 使用 `spawn(childCommand, childArgs, { shell: false, stdio: ["inherit", "pipe", "pipe"] })`。
  - adapter 在 child 启动前先发送 `notch.session.upserted`。
  - child stdout/stderr 会原样转发到当前 process stdout/stderr，同时按行解析并发送 `notch.event.created`。
  - child 退出后 wrapper 才输出 summary JSON；非 0 exit code、signal 或 event 发送失败会影响 adapter exit code。
- 已阅读 `packages/cli-adapter-real/src/smoke/notch-run-smoke.ts`，确认 P1.6 smoke presets：
  - `node-result`：默认，验证 live session + active `result` event。
  - `codex-version`：执行 `codex --version`，只验证 live session。
  - `claude-version`：执行 `claude --version`，只验证 live session。
- 已阅读 `docs/contracts/real-cli-adapter.md`，确认合同明确排除：
  - 不 attach 已打开终端。
  - 不读取 shell history。
  - 不执行 classifier 提取出的 command。
  - 不执行 manager/risk-policy 返回的 action。
- 已阅读 `docs/handoffs/cli-adapter-agent-real-cli-smoke-presets-p1.md`，确认上一步已把真实 CLI 版本号 smoke 定义为 session-only probe，不作为交互事件验收。
- 新增本 handoff，作为下一位 agent 进入真实交互 CLI 设计/实现前的契约笔记。

## 3. 修改/新增文件

| 文件 | 类型 | 说明 |
| --- | --- | --- |
| `docs/handoffs/cli-adapter-agent-interactive-cli-contract-notes-p1.md` | 新增 | 记录交互式 CLI 接入的 P1 契约、stdio 现状、验收边界和并发修改注意事项 |

## 4. 关键决策

- P1 继续以 `notch-run --profile codex-cli -- codex` / `notch-run --profile claude-code-cli -- claude` 作为用户显式启动入口，不做“接管已有终端”。
- 当前 wrapper 的 stdio 行为是：
  - stdin：child 继承当前 terminal，用户键入内容直接进入真实 CLI；adapter 不拦截、不改写、不通过 Manager API 注入 stdin。
  - stdout/stderr：child 输出进入 pipe，adapter 先原样写回自己的 stdout/stderr，再按 `\r?\n` 行切分解析。
  - 无换行的 prompt、进度条、全屏 TUI 刷新、ANSI cursor control 可能不会及时或稳定形成事件；buffer 会在 stream end 时最后 flush 一次。
- 真正 TTY attach 暂不做，因为它会同时扩大技术和安全边界：
  - attach 已打开终端需要发现并接入外部 TTY/PTY，会触及用户已有 shell 状态、隐私输出和历史上下文。
  - stdin 注入会改变“谁在真实执行命令”的责任边界，容易把 UI 动作误变成对真实 CLI 的自动操作。
  - PTY 会引入 terminal 尺寸、raw mode、信号转发、Ctrl-C/Ctrl-D、光标控制、全屏 TUI、日志脱敏等一组新契约，不适合混进 P1 最小闭环。
  - 现有合同已经明确 wrapper 不 attach、不读 history；下一步应先把显式启动的长期 child process 跑稳。
- P1 最小可验收建议：
  - Local Manager API 运行后，用户手动启动 `notch-run --profile codex-cli -- codex` 或 `notch-run --profile claude-code-cli -- claude`。
  - UI/API snapshot 中出现 `sourceMode: "live"` 的 session，session cwd 与传入 `--cwd` 或当前 cwd 一致。
  - 用户可以在同一 terminal 中向真实 CLI 输入内容；输入不经过 Notch UI、不经过 Manager API、不经过 adapter action router。
  - child stdout/stderr 仍在 terminal 可见；可解析的行输出会生成 `confirm`、`result` 或 `error` event。
  - 用户显式退出真实 CLI 后，wrapper 结束并输出 summary JSON；exit code 透传到 adapter process。
  - UI 上的 approve/reject/ignore 等动作只改变 Notch event 状态或后续受控 action，不自动向 child stdin 写入内容。
- `codex-version` / `claude-version` 继续作为低风险真实 CLI presence smoke；它们不能证明长期交互、stdin 或 event parser 已可用。

## 5. 暴露的接口或数据结构

- 现有 CLI 入口：
  - `notch-run --profile codex-cli -- codex`
  - `notch-run --profile claude-code-cli -- claude`
  - `npm run run -w @notch-ai-monitor/cli-adapter-real -- --profile codex-cli -- codex`
- 现有 `SourceMode` 语义：
  - `live`：用户显式启动或接入的真实 CLI 输出；`notch-run` 默认使用该模式。
  - `wrapper`：普通 wrapper child process；适合 fixture/smoke，不应冒充 live。
- 现有 parser 入口：
  - `createEventFromLine(line, session, profile)`
  - `classifyOutputLineForProfile(line, profileOrId)`
  - Codex/Claude 已有专项 parser，无法识别时 fallback 到 generic classifier。
- 现有 wrapper summary 字段：
  - `mode`
  - `profile`
  - `sessionId`
  - `cwd`
  - `command`
  - `childProcessId`
  - `exitCode`
  - `signal`
  - `sent.session`
  - `sent.eventTypes`
  - `responses.session`
  - `responses.events`
  - `eventSendFailures`
- 当前缺口：
  - 没有 `notch.session.ended` envelope。
  - session upsert 发生在 child spawn 前，因此 session 里通常没有 child pid；child pid 只在 wrapper summary 中出现。
  - 没有从 UI/API 到 child stdin 的写入接口。

## 6. 测试结果

- 本次为文档 handoff，未修改代码实现文件，未运行 build/test。
- 已做静态阅读核对：
  - `packages/cli-adapter-real/src/index.ts`
  - `packages/cli-adapter-real/src/smoke/notch-run-smoke.ts`
  - `docs/contracts/real-cli-adapter.md`
  - `docs/handoffs/cli-adapter-agent-real-cli-smoke-presets-p1.md`
- 上一份 P1.6 handoff 记录的最近 smoke 状态可作为背景：
  - `npm run smoke:notch-run` 通过，默认 `node-result` 仍生成 active `result` event。
  - `npm run smoke:codex` 通过，为 session-only smoke。
  - `npm run smoke:claude` 通过，为 session-only smoke。

## 7. 未解决问题

- 真实 Codex/Claude 长期交互时，CLI 是否要求 stdout 是 TTY 尚未验证；当前 wrapper stdout/stderr 是 pipe，stdin 是 inherited terminal。
- 无换行 prompt、ANSI 颜色/控制序列、流式 token、全屏 TUI 会影响 parser 稳定性，P1 需要先定义可接受的降级行为。
- child 退出后 Manager session 仍可能保持 `running`，因为目前没有 session ended/update contract。
- Ctrl-C、Ctrl-D、SIGTERM、SIGINT 的用户体验和 summary 行为还没有专门验收。
- UI action 与真实 CLI stdin 的关系必须继续保持隔离；如后续要支持“从 UI 发送输入”，需要单独设计授权、审计、回显和取消机制。
- Codex/Claude 的真实输出 fixture 不足；后续 parser 不应只靠版本号输出判断。

## 8. 下一位 agent 需要知道的上下文

- 当前实现的安全核心是“用户显式启动真实 CLI，用户直接在 terminal 输入，adapter 只观察输出并上报事件”。不要把 Notch UI 的动作默认解释为对真实 CLI 的按键或命令输入。
- 下一步如果要做 P1 交互验收，建议先做手动/半自动 contract smoke，而不是直接上 PTY attach：
  - 启动 Local Manager API。
  - 运行 `notch-run --profile codex-cli -- codex` 或 `notch-run --profile claude-code-cli -- claude`。
  - 确认 UI/API 有 live session。
  - 用低风险提示词诱发一条可解析的 `result` / `confirm` / `error` 输出。
  - 手动退出 CLI，确认 wrapper summary 和 exit code。
- 后续实现如果要碰代码，优先串行修改这些文件，避免多个 agent 同时改同一契约面：
  - `packages/cli-adapter-real/src/index.ts`
  - `packages/cli-adapter-real/src/smoke/notch-run-smoke.ts`
  - `packages/cli-adapter-real/tests/cli-adapter-real.test.mjs`
  - `packages/cli-adapter-real/package.json`
  - `docs/contracts/real-cli-adapter.md`
  - `docs/handoffs/cli-adapter-agent-real-cli-smoke-presets-p1.md`
- 如果要新增 session lifecycle，可能还会涉及 shared protocol、local manager、desktop API client 和 UI 状态展示；不要把这类横切修改混在 parser 调整里。
- 如果要做真正 PTY/TTY，建议作为 P2 或单独 spike，先写 contract，再实现；至少要先回答输入授权、日志脱敏、signal 转发、terminal size、raw mode、existing terminal attach 和 action audit。
