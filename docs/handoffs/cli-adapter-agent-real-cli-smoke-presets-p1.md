# CLI Adapter Agent P1.6 Real CLI Smoke Presets Handoff

日期：2026-06-07  
Agent：CLI Adapter Agent（Main Agent 集成）  
阶段：P1.6 Real CLI Smoke Presets  
工作目录：`/Users/zhaiyongtao/vibeCoding/notch-ai-monitor`

## 1. 本次目标

- 在 P1.5 `notch-run-smoke` 基础上，增加真实低风险 CLI 探测入口。
- 先支持 Codex CLI 和 Claude Code CLI；Qwen 第一版暂不推进专项支持。
- 保持默认 smoke 继续验证完整 event 链路，不把版本号探测误当成 UI event smoke。

## 2. 已完成内容

- `notch-run-smoke` 新增 `--preset`：
  - `node-result`：默认 preset，继续生成 `result` event。
  - `codex-version`：执行 `codex --version`，验证 live Codex CLI session。
  - `claude-version`：执行 `claude --version`，验证 live Claude Code CLI session。
- `notch-run-smoke` 新增 `--expect-type none`，用于 session-only smoke。
- 新增根目录 npm scripts：
  - `npm run smoke:codex`
  - `npm run smoke:claude`
- 新增 adapter package scripts：
  - `npm run smoke:codex -w @notch-ai-monitor/cli-adapter-real`
  - `npm run smoke:claude -w @notch-ai-monitor/cli-adapter-real`
- 更新真实 CLI adapter 合同文档，区分 event smoke 和 session-only CLI probe。

## 3. 修改/新增文件

| 文件 | 类型 | 说明 |
| --- | --- | --- |
| `packages/cli-adapter-real/src/smoke/notch-run-smoke.ts` | 修改 | 新增 preset、`expect-type none`、child exit code 失败检查 |
| `packages/cli-adapter-real/tests/cli-adapter-real.test.mjs` | 修改 | 新增 preset 解析测试和 session-only smoke 测试 |
| `packages/cli-adapter-real/package.json` | 修改 | 新增 `smoke:codex`、`smoke:claude` |
| `package.json` | 修改 | 新增根目录 `smoke:codex`、`smoke:claude` |
| `package-lock.json` | 修改 | 同步 workspace script metadata |
| `docs/contracts/real-cli-adapter.md` | 修改 | 文档化 P1.6 smoke presets |
| `docs/handoffs/cli-adapter-agent-real-cli-smoke-presets-p1.md` | 新增 | 本 handoff |

## 4. 关键决策

- `codex --version` / `claude --version` 通常只输出版本号，不含可解析 result 关键词，所以 preset 默认 `expect-type none`。
- session-only smoke 只证明真实 CLI 可启动、wrapper 可捕获输出、Local Manager API 收到 live session；它不替代 UI event smoke。
- 默认 `npm run smoke:notch-run` 保持不变，仍用于验证 `mock CLI event -> API -> EventQueue -> Notch UI` 的事件链路。
- 如果 child command 退出码非 0，smoke 会失败，避免“只创建 session 但命令实际失败”的假阳性。

## 5. 暴露的接口或数据结构

- `NotchRunSmokePreset = "node-result" | "codex-version" | "claude-version"`
- `parseNotchRunSmokeArgs(argv)` 支持：
  - `--preset node-result|codex-version|claude-version`
  - `--expect-type confirm|result|error|none`
- `runNotchRunSmoke(argv)` 输出摘要新增：
  - `preset`
  - `expectType`

## 6. 测试结果

- `npm run test -w @notch-ai-monitor/cli-adapter-real`：通过，15/15。
- `npm test`：通过。
- `npm run build`：通过。
- `npm run smoke:codex`：通过，本机 `codex-cli 0.137.0-alpha.4`，snapshot 中 `sourceMode: "live"`、`eventTypes: []`。
- `npm run smoke:claude`：通过，本机 `2.1.144 (Claude Code)`，snapshot 中 `sourceMode: "live"`、`eventTypes: []`。
- `npm run smoke:notch-run`：通过，默认 `node-result` preset 仍生成 active `result` event。

## 7. 未解决问题

- `codex-version` / `claude-version` 不是长期运行 interactive CLI 接入，只是低风险真实命令探测。
- 真实 Codex/Claude 交互式输出仍需要后续定义 TTY/stdin 生命周期和更稳定的事件触发样例。
- Cursor App 目前仍只适合 process scan/session discovery；还没有 app 输出事件源。

## 8. 下一位 agent 需要知道的上下文

- 当前页面可能保留 `npm run smoke:notch-run` 产生的 active result event；如需干净状态可调用 `POST /v1/debug/reset` 或 UI demo tray 清空。
- 下一步建议进入 “真实交互 CLI adapter contract”：定义 interactive child process 的启动、stdin、退出、事件解析和用户动作边界。
