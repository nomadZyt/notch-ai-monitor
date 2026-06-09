# Tool Fixture Parser Agent P1 Handoff

日期：2026-06-06  
Agent：Tool Fixture Parser Agent  
阶段：P1.3 Real CLI Adapter Fixture Parser  
工作目录：`/Users/zhaiyongtao/vibeCoding/notch-ai-monitor`

## 1. 本次目标

- 为 `@notch-ai-monitor/cli-adapter-real` 增加 Codex CLI 与 Claude Code CLI 的 profile-aware 输出 fixture/parser。
- 保持 P1.2 generic classifier 行为兼容。
- 明确 Qwen first version 只保留 profile、scan discovery 和 generic fallback，不新增专项 parser。

## 2. 已完成内容

- 新增 `classifyOutputLineForProfile(line, profileOrId)`，由 `createEventFromLine` 使用。
- Codex CLI 专项 parser 覆盖：
  - proposed/suggested/run/executing/requesting approval command -> `confirm`
  - completed/done/result/success -> `result`
  - error/failed/exception/fatal -> `error`
  - 普通 assistant streaming 文本忽略
- Claude Code CLI 专项 parser 覆盖：
  - Bash/tool use/command needing approval/permission required/proceed prompt -> `confirm`
  - task completed/done/result ready/success -> `result`
  - error/failed/traceback/permission denied -> `error`
  - 普通 assistant streaming 文本忽略
- 新增 Codex、Claude、ordinary text fixture，并增加对应测试。
- 保持 wrapper mode 继续通过，stdout/stderr 行解析仍走 `createEventFromLine`。

## 3. 修改/新增文件

| 文件 | 类型 | 说明 |
| --- | --- | --- |
| `packages/cli-adapter-real/src/index.ts` | 修改 | 新增 Codex/Claude profile-aware parser、命令提取辅助函数、`classifyOutputLineForProfile`，并让 `createEventFromLine` 使用新入口 |
| `packages/cli-adapter-real/tests/cli-adapter-real.test.mjs` | 修改 | 增加 fixture parser、Qwen generic-only、profile-aware event origin 测试 |
| `packages/cli-adapter-real/tests/fixtures/codex-cli-output.txt` | 新增 | Codex CLI 代表性输出行 |
| `packages/cli-adapter-real/tests/fixtures/claude-code-cli-output.txt` | 新增 | Claude Code CLI 代表性输出行 |
| `packages/cli-adapter-real/tests/fixtures/ordinary-text.txt` | 新增 | 应被忽略的普通 assistant 文本 |
| `docs/contracts/real-cli-adapter.md` | 修改 | 更新到 P1.3，新增 parser support matrix 与 Qwen deferred 说明 |
| `docs/handoffs/tool-fixture-parser-agent-p1.md` | 新增 | 本 handoff |

## 4. 关键决策

- `classifyOutputLine(line)` 保持原 generic 行为，避免破坏既有调用方。
- `createEventFromLine` 切换到 `classifyOutputLineForProfile`，让 stdin/wrapper 自动获得 profile-aware parsing。
- Codex/Claude 专项 parser 只覆盖代表性 fixture 和明确 CLI 信号；识别不到时 fallback 到 generic。
- Qwen 不接入专项 parser；使用 `qwen-cli` profile 时只走 generic fallback。
- adapter 仍只读取和上报输出，不执行 parser 提取出的命令。

## 5. 暴露的接口或数据结构

- 新增导出：
  - `classifyOutputLineForProfile(line, profileOrId)`
- 保持兼容：
  - `classifyOutputLine(line)`
  - `createEventFromLine(line, session, profile, options)`
- `createEventFromLine` 生成的 `event.evidence.origin` 仍为 `${profile.name} output`。

## 6. 测试结果

- `npm run test -w @notch-ai-monitor/cli-adapter-real`：通过，11/11。
- `npm test`：通过。
  - shared 9/9
  - local-manager-mock 8/8
  - risk-policy 6/6
  - local-manager-api 5/5
  - cli-adapter-mock 3/3
  - cli-adapter-real 11/11

## 7. 未解决问题

- Codex/Claude parser 仍是 fixture-driven 正则，不是官方结构化事件 hook。
- Qwen 专项 parser 已按用户要求暂缓；后续需要真实 Qwen fixture 后再补。
- 目前没有 cwd、affected paths 等更细粒度字段提取。

## 8. 下一位 agent 需要知道的上下文

- 如果继续扩 parser，请优先新增 fixture，再扩专项规则，避免普通 assistant 文本误触发。
- Qwen first version 的产品决策是 deferred，不要在没有新需求时补 Qwen 专项 parser。
- wrapper/stdin 的安全边界不变：adapter 不执行输出中的 command，只发送 Manager API envelope。

## 9. 注意事项

- 不要回滚其他 agent 或用户已有改动。
- 如果需要修改非自己 ownership 文件，先在 handoff 中写明原因。
