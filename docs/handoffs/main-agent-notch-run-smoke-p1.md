# Main Agent P1.5 Notch Run Smoke Handoff

日期：2026-06-07  
Agent：Main Agent  
阶段：P1.5 Notch Run Smoke Harness  
工作目录：`/Users/zhaiyongtao/vibeCoding/notch-ai-monitor`

## 1. 本次目标

- 把 P1.4 的 `notch-run` live 验证固化成一条可重复 smoke 命令。
- 减少手动执行 `curl reset + notch-run + curl snapshot` 的步骤。
- 让后续真实 Codex/Claude CLI 接入前，有一个稳定的本地链路验收入口。

## 2. 已完成内容

- 新增 `runNotchRunSmoke(argv)`：
  - 检查 `GET /health`
  - 默认调用 `POST /v1/debug/reset`
  - 调用 `runNotchRun(...)`
  - 读取 `GET /v1/snapshot`
  - 断言存在 `sourceMode: "live"` 的 session
  - 断言存在指定类型的 active event
- 新增 bin：`notch-run-smoke`
- 新增 npm scripts：
  - 根目录：`npm run smoke:notch-run`
  - adapter 包：`npm run smoke:live -w @notch-ai-monitor/cli-adapter-real`
- 默认 child command 是安全的 Node smoke 输出：`Completed: notch-run live smoke`。
- 支持传入真实 child command，例如 `-- claude --version`。
- 新增 fake manager server 测试，不让 `cli-adapter-real` 依赖 `local-manager-api` 包。
- 更新 `docs/contracts/real-cli-adapter.md` 到 P1.5。

## 3. 修改/新增文件

| 文件 | 类型 | 说明 |
| --- | --- | --- |
| `packages/cli-adapter-real/src/smoke/notch-run-smoke.ts` | 新增 | smoke harness 主逻辑 |
| `packages/cli-adapter-real/src/bin/notch-run-smoke.ts` | 新增 | CLI bin 入口 |
| `packages/cli-adapter-real/package.json` | 修改 | 新增 `notch-run-smoke` bin 与 `smoke:live` script |
| `packages/cli-adapter-real/tests/cli-adapter-real.test.mjs` | 修改 | 新增 smoke harness 测试 |
| `package.json` | 修改 | 新增根脚本 `smoke:notch-run` |
| `package-lock.json` | 修改 | 同步 package bin/scripts metadata |
| `docs/contracts/real-cli-adapter.md` | 修改 | P1.5 smoke 文档 |
| `docs/handoffs/main-agent-notch-run-smoke-p1.md` | 新增 | 本 handoff |

## 4. 关键决策

- smoke harness 仍复用 `runNotchRun`，不复制 wrapper/spawn 逻辑。
- 默认 smoke child 使用 Node 输出，保证 smoke 不依赖用户是否已登录 Codex/Claude。
- 如果用户要验真实 CLI，可在 smoke 命令后传 `-- codex ...` 或 `-- claude ...`。
- 测试用 fake manager server，保持包边界：adapter 测试只验证 HTTP contract，不直接 import manager 实现。

## 5. 暴露的接口或数据结构

- `parseNotchRunSmokeArgs(argv)`
- `runNotchRunSmoke(argv)`
- `notch-run-smoke`
- `npm run smoke:notch-run`
- `npm run smoke:live -w @notch-ai-monitor/cli-adapter-real -- [args]`

Smoke 参数：

- `--url <manager-url>`
- `--profile <profile>`
- `--cwd <path>`
- `--expect-type confirm|result|error`
- `--no-reset`
- `-- <child command...>`

## 6. 测试结果

- `npm run test -w @notch-ai-monitor/cli-adapter-real`：通过，13/13。
- `npm test`：通过。
- `npm run build`：通过。
- `npm run smoke:notch-run`：通过，输出 `mode: "notch-run-smoke"`、`ok: true`、`sourceMode: "live"`、`eventTypes: ["result"]`。
- Browser UI 检查：通过，折叠态显示 `Codex CLI 完成，1 项待处理`；展开态显示 `Codex CLI · Terminal · 真实` 和正文 `Completed: notch-run live smoke`。
- Browser UI action 检查：通过，点击 `标记已读` 后 UI 回到 `全部安静`。
- API resolved 检查：通过，`GET /v1/snapshot` 中 smoke event `status: "resolved"`、`resolution: "marked_read"`、`counts.activeEvents: 0`。

## 7. 未解决问题

- 默认 smoke 仍是 Node child 输出，不等同于真实 Codex/Claude 登录态验证。
- 如果真实 child command 不输出可解析的 `confirm/result/error` 行，smoke 会失败；可用 `--expect-type` 配合真实输出调整。
- `notch-run-smoke` 当前只验证 API snapshot，不直接操作 UI；UI 展示和 UI action resolved 仍由主 agent Browser 验收。

## 8. 下一位 agent 需要知道的上下文

- 真实 CLI smoke 的下一步可以是文档化 `codex --version`、`claude --version` 或低风险 dry-run 输出格式。
- 如果要接入长期运行的 interactive CLI，会涉及 stdin/TTY 生命周期，不能只靠这个 smoke harness。
