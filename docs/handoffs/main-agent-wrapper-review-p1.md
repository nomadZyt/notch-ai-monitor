# Main Agent Wrapper Review P1 Handoff

日期：2026-06-06  
Agent：Main Agent  
阶段：P1.2 Real CLI Adapter Wrapper 集成复核  
工作目录：`/Users/zhaiyongtao/vibeCoding/notch-ai-monitor`

## 1. 本次目标

- 复核 Wrapper Agent 交付的 `wrapper` mode。
- 验证 adapter 能启动用户显式提供的 child command，代理 stdout/stderr，并把可识别输出转换为 Manager API envelope。
- 用安全 dummy child 验证 `wrapper -> Manager API -> SSE/snapshot -> Notch UI -> 用户动作` 闭环。

## 2. 已完成内容

- 审阅 `packages/cli-adapter-real/src/index.ts` 的 wrapper 参数解析、child spawn、stdout/stderr 行解析、event post、summary 和 exit code 逻辑。
- 审阅 wrapper 相关测试与 contract 文档。
- 确认 `--` 后 child command 不再被 adapter 解析，`spawn` 使用 `shell: false`。
- 确认 wrapper 不执行 classifier 提取出的命令，只把输出行翻译成 event。
- 重启 Local Manager API，清空旧 snapshot 后做 live 验收。
- 使用安全 dummy child 验证：
  - stdout 原样转发。
  - stderr 原样转发。
  - result 行变成 `result` event。
  - approval + dangerous command 行变成 `confirm`，并由 manager/risk-policy 升级为 `risk`。
  - error 行变成 `error` event。
  - UI 收到 3 个事件，当前风险态显示 `angry` / `peek` / `风险`。
  - UI 点击 `拒绝执行` 后 risk event 变为 `ignored`，剩余 error/result 保持 active。

## 3. 修改/新增文件

- `docs/handoffs/main-agent-wrapper-review-p1.md`

Wrapper Agent 修改文件：

- `packages/cli-adapter-real/src/index.ts`
- `packages/cli-adapter-real/tests/cli-adapter-real.test.mjs`
- `docs/contracts/real-cli-adapter.md`
- `docs/handoffs/wrapper-agent-p1.md`

## 4. 关键决策

- 接受 wrapper mode 作为 P1.2 的真实 CLI 接入路径。
- 验收不运行真实 Claude/Codex/Qwen，只运行安全 Node one-liner；真实 CLI 后续由用户显式提供 child command。
- 保持 child stdin 继承 terminal，stdout/stderr pipe 后转发和解析。
- 继续保持 UI 只信任 Manager API snapshot/SSE。

## 5. 暴露的接口或数据结构

- `RealAdapterMode` 新增 `wrapper`。
- CLI 用法：
  - `npm run send -w @notch-ai-monitor/cli-adapter-real -- wrapper --profile claude-code-cli -- <command> [args...]`
  - `npm run send -w @notch-ai-monitor/cli-adapter-real -- wrapper --profile claude-code-cli --cwd <path> -- <command> [args...]`
- Wrapper summary JSON：
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
- `npm run build`：通过。
- `npm test`：通过。
  - shared 9/9
  - local-manager-mock 8/8
  - risk-policy 6/6
  - local-manager-api 5/5
  - cli-adapter-mock 3/3
  - cli-adapter-real 8/8
- Live API/browser 验收通过：
  - wrapper dummy child sent `result`、`confirm`、`error`。
  - confirm 中的 dangerous command 被升级为 high risk。
  - UI 展示 3 个事件。
  - UI 拒绝风险事件后 API snapshot 中 risk 状态为 `ignored`，activeEvents 从 3 降为 2。
  - 浏览器 error log 为空。

## 7. 未解决问题

- wrapper summary 目前包含完整 Manager API responses，真实长会话下 stdout 可能过长；后续可以改为 compact summary。
- wrapper 启动前发送 session upsert，因此默认 session 不含 child pid；summary 有 `childProcessId`。
- Local Manager API P1 还不支持 `notch.session.ended`，child 退出后 session 仍显示 running。
- classifier 仍是保守正则，真实 Claude/Codex/Qwen 输出需要工具专属 fixture 和 parser。

## 8. 下一位 agent 需要知道的上下文

- 下一步推荐做 `Tool Fixture Parser Agent`：收集/编写 Codex CLI、Claude Code CLI、Qwen CLI 的真实输出 fixture，细化 command/result/error parser。
- 另一条路是扩展 Manager API 支持 `notch.session.ended`，让 wrapper child 退出后能更新 session state。
- 不要让 wrapper 自动执行 parser 提取出的 command；命令执行权限必须仍在真实 CLI 或后续 ActionRouter 中受控处理。
