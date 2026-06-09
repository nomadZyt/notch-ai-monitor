# Wrapper Agent P1 Handoff

日期：2026-06-06  
Agent：Wrapper Agent  
阶段：P1.2 Real CLI Adapter Wrapper Mode  
工作目录：`/Users/zhaiyongtao/vibeCoding/notch-ai-monitor`

## 1. 本次目标

- 在 `@notch-ai-monitor/cli-adapter-real` 中新增 `wrapper` mode。
- 让 adapter 启动用户在 `--` 后显式提供的真实 CLI child process，代理 stdout/stderr，并将可识别输出转换为 `notch.event.created`。
- 保持 UI 只消费 Local Manager API snapshot/SSE，不直接读取 CLI 输出。

## 2. 已完成内容

- 新增 `wrapper` mode 参数解析与运行逻辑。
- 支持用法：
  - `npm run send -w @notch-ai-monitor/cli-adapter-real -- wrapper --profile claude-code-cli -- <command> [args...]`
  - `npm run send -w @notch-ai-monitor/cli-adapter-real -- wrapper --profile claude-code-cli --cwd <path> -- <command> [args...]`
- `wrapper` 启动 child process 前先发送 `notch.session.upserted`。
- 使用 Node built-in `child_process.spawn`，未引入新依赖。
- stdout/stderr 会转发到当前 process stdout/stderr，同时按行复用现有 classifier / `createEventFromLine`。
- 解析到 `confirm`、`result`、`error` 后发送 `notch.event.created`。
- child process 退出后输出 wrapper summary JSON。
- child exit code 非 0 时，adapter `process.exitCode` 保持同样 code。
- 增加测试覆盖 `--` 参数隔离、session upsert、stdout confirm/result、stderr error、输出透传、非零 exit code。
- 更新 `docs/contracts/real-cli-adapter.md`，补充 wrapper mode 用法、行为和安全限制。

## 3. 修改/新增文件

| 文件 | 类型 | 说明 |
| --- | --- | --- |
| `packages/cli-adapter-real/src/index.ts` | 修改 | 新增 `wrapper` mode、child command 参数解析、spawn 运行、stdout/stderr 行解析和 summary 输出 |
| `packages/cli-adapter-real/tests/cli-adapter-real.test.mjs` | 修改 | 新增 wrapper 参数解析与 dummy child process 行为测试 |
| `docs/contracts/real-cli-adapter.md` | 修改 | 从 P1.1 更新到 P1.2，新增 wrapper mode contract |
| `docs/handoffs/wrapper-agent-p1.md` | 新增 | 本 handoff |

## 4. 关键决策

- `--` 后的所有参数完全归 child command，adapter 不再解析，避免真实 CLI 参数被误吃掉。
- `wrapper` 使用 `spawn(command, args, { shell: false })`，不拼 shell string，降低 adapter 层额外执行风险。
- 因为 contract 要求 child 启动前先发送 session upsert，此时拿不到 child pid；默认 session 不写 child pid，summary JSON 中记录实际 `childProcessId`。如果调用方显式传 `--pid`，session 仍会按旧参数写入该 pid。
- child stdin 继承当前 terminal，stdout/stderr 使用 pipe 转发和解析，以便真实 CLI 仍可互动，同时 adapter 能观察输出。
- manager API 如果在 child 运行期间接收 event 失败，wrapper 不中断 child；summary 中记录 `eventSendFailures`，若 child 本身成功但 event 发送失败，adapter exit code 置 1。

## 5. 暴露的接口或数据结构

- `RealAdapterMode` 新增 `"wrapper"`。
- `CliOptions` 新增：
  - `childCommand?: string`
  - `childArgs: string[]`
- `parseCliArgs(argv)` 支持：
  - `wrapper --profile <profile> -- <command> [args...]`
  - `--mode wrapper -- <command> [args...]`
  - 没有 child command 时抛出 `Wrapper mode requires a child command after --.`
- wrapper summary JSON 字段：
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

## 6. 测试结果

- `npm run test -w @notch-ai-monitor/cli-adapter-real`：通过，8/8。
- `npm test`：通过。
  - shared 9/9
  - local-manager-mock 8/8
  - risk-policy 6/6
  - local-manager-api 5/5
  - cli-adapter-mock 3/3
  - cli-adapter-real 8/8

## 7. 未解决问题

- wrapper 当前没有发送 `notch.session.ended`，因为 Local Manager API P1 contract 尚未列为支持 endpoint。
- 因为 session 必须在 child 启动前发送，默认 session envelope 不包含实际 child pid；后续如果 manager 需要 pid，可考虑启动后再 upsert 一次 session。
- classifier 仍是保守正则，后续需要针对 Claude/Codex/Qwen 的真实输出格式做更精细命令/结果提取。

## 8. 下一位 agent 需要知道的上下文

- 不要让 adapter 执行 classifier 提取出的 command；这些 command 只作为 event evidence/summary 发给 manager/risk-policy。
- UI 仍只信任 Manager API snapshot/SSE，wrapper 不应直接改 UI state。
- wrapper 测试只使用 `node -e` dummy child，不依赖真实 Claude/Codex/Qwen。
- 如果继续增强 wrapper，优先补充真实工具输出 fixture，而不是引入外部依赖。

## 9. 注意事项

- 不要回滚其他 agent 或用户已有改动。
- 本次没有修改 `apps/desktop/**`、`packages/local-manager-api/**`、`packages/shared/**`、`packages/risk-policy/**`、`packages/local-manager-mock/**`。
