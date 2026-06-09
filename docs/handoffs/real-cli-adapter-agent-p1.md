# Agent Handoff

日期：2026-06-06  
Agent：`Real CLI Adapter Agent`  
阶段：`P1.1 真实来源 adapter`  
工作目录：`/Users/zhaiyongtao/vibeCoding/notch-ai-monitor`

## 1. 本次目标

- 新增 `@notch-ai-monitor/cli-adapter-real`，把真实来源 profile 的 scan/stdin/emit 输入翻译成标准 protocol envelope，并发送到 `POST /v1/envelopes`。
- 保持 UI 仍只消费 Local Manager API snapshot/SSE。

## 2. 已完成内容

- 新增 real adapter package，支持 `scan`、`stdin`、`emit` 三种模式。
- 支持 `codex-cli`、`claude-code-cli`、`qwen-cli`、`cursor-app`、`codex-app`、`custom` source profiles。
- `scan` 使用 `ps -axo pid=,command=` 发现进程并发送 `notch.session.upserted`。
- `stdin` 启动时发送 session upsert，并将保守匹配到的 confirm/error/result 文本行转换成 `notch.event.created`。
- `emit` 支持通过 CLI 参数发送真实 profile 下的 confirm/error/result/risk demo event。
- 新增 Node `node --test` 覆盖 profile 映射、ps 解析、输出行解析、envelope 生成、HTTP post mock server。
- 根 `npm test` 已加入 real adapter 测试。

## 3. 修改/新增文件

| 文件 | 类型 | 说明 |
| --- | --- | --- |
| `packages/cli-adapter-real/package.json` | 新增 | real adapter workspace package、bin、build/test/send scripts |
| `packages/cli-adapter-real/tsconfig.json` | 新增 | TypeScript NodeNext 构建配置 |
| `packages/cli-adapter-real/src/index.ts` | 新增 | profile、session/event/envelope、ps/stdin/emit、HTTP post 实现 |
| `packages/cli-adapter-real/src/bin/real-cli-adapter.ts` | 新增 | CLI bin 入口 |
| `packages/cli-adapter-real/tests/cli-adapter-real.test.mjs` | 新增 | 单包 Node 测试 |
| `docs/contracts/real-cli-adapter.md` | 新增 | P1.1 real adapter contract 和命令示例 |
| `docs/handoffs/real-cli-adapter-agent-p1.md` | 新增 | 本 handoff |
| `package.json` | 修改 | 根 build/test 加入 `@notch-ai-monitor/cli-adapter-real` |
| `package-lock.json` | 修改 | npm workspace lockfile 加入 real adapter |

## 4. 关键决策

- real adapter 不依赖 `cli-adapter-mock`，但复用了同样的 localhost `POST /v1/envelopes` 思路。
- `notch.event.created` 发送 manager 可 ingest 的 event input，而不是强行在 adapter 侧补完整 actions；manager/risk-policy 继续负责 priority/status/actions 和危险 confirm 升级。
- `scan` 只做进程发现和 session upsert，不尝试读取已打开终端内容，避免越过 P1.1 边界。
- 行解析保持保守：confirm 优先于 error/result，危险命令以 confirm 交给 manager/risk-policy 再升级。

## 5. 暴露的接口或数据结构

- CLI bin：`notch-cli-adapter-real`
- npm script：`npm run send -w @notch-ai-monitor/cli-adapter-real -- <scan|stdin|emit> ...`
- Profiles：`codex-cli`、`claude-code-cli`、`qwen-cli`、`cursor-app`、`codex-app`、`custom`
- Exported helpers：`resolveSourceProfile`、`createSession`、`parsePsOutput`、`classifyOutputLine`、`createEventFromLine`、`createEventFromType`、`createSessionUpsertEnvelope`、`createEventCreatedEnvelope`、`postEnvelope`

## 6. 测试结果

- `npm run test -w @notch-ai-monitor/cli-adapter-real`：通过，6/6 tests pass。
- `npm test`：通过，shared/local-manager-mock/risk-policy/local-manager-api/cli-adapter-mock/cli-adapter-real 全部通过。
- `npm run build`：通过，包含新增 `@notch-ai-monitor/cli-adapter-real` 和 desktop production build。

## 7. 未解决问题

- wrapper 模式未做；P1.1 先完成 scan/stdin/emit。
- `scan` 不能读取已打开终端的事件内容，后续需要 TTY attach 或工具专用 hook。
- 命令提取目前是保守正则，后续可按 Codex/Claude/Qwen 输出格式做结构化解析。

## 8. 下一位 agent 需要知道的上下文

- Local Manager API 会接受 event input 并正规化；真实 adapter 不需要自己生成 action 列表。
- 危险命令仍以 `confirm` 发出，由 manager/risk-policy 负责升级为 `risk`。
- 不要修改 `apps/desktop/**`、`packages/local-manager-api/**`、`packages/shared/**`、`packages/risk-policy/**`，除非新阶段明确要求。

## 9. 注意事项

- 不要回滚其他 agent 或用户已有改动。
- 当前仓库已有大量未跟踪文件和 prototype 删除，本次只应关注 real adapter 相关文件。
