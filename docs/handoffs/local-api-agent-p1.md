# Local API Agent P1 Handoff

日期：2026-06-06  
Agent：P1 Local API Agent  
阶段：P1 第一个真实接入点  
工作目录：`/Users/zhaiyongtao/vibeCoding/notch-ai-monitor`

## 1. 本次目标

- 创建 `@notch-ai-monitor/local-manager-api` TypeScript 包，用 Node 内置 `http` 包装 `MockLocalAgentManager`。
- 提供本地 HTTP/SSE API：health、snapshot、protocol envelope ingestion、snapshot updated SSE。
- 创建最小 mock CLI adapter/sender，能向 API 投递 session、confirm、risk、result、error，以及危险 confirm command。
- 增加 Node tests，覆盖本地 API、SSE、action request resolve 和 risky confirm -> risk。
- 不修改 UI 源码，不接真实 Claude/Codex/Qwen，不做真实命令执行或 Tauri IPC。

## 2. 已完成内容

- 新增 `@notch-ai-monitor/local-manager-api` workspace 包。
- API 支持：
  - `GET /health`
  - `GET /v1/snapshot`
  - `POST /v1/envelopes`
  - `GET /v1/events`
- `POST /v1/envelopes` 支持 `notch.session.upserted`、`notch.event.created`、`notch.action.requested`、`notch.debug.injected`。
- `notch.action.requested` 同步返回 `notch.action.result` envelope，并保持 request correlation。
- SSE 通过 manager `subscribe(...)` 推送 `event: notch.snapshot.updated`。
- 新增 `@notch-ai-monitor/cli-adapter-mock` workspace 包和 `notch-cli-adapter-mock` bin。
- mock CLI sender 支持 `session`、`confirm`、`risky-confirm`、`risk`、`result`、`error`、`all` scenario。
- 根 `npm test` 已接入 local-manager-api 和 cli-adapter-mock 单测；根 `npm run build` 已接入新包并保留 desktop build。
- 新增合同文档 `docs/contracts/local-manager-api.md`。

## 3. 修改/新增文件

| 文件 | 类型 | 说明 |
| --- | --- | --- |
| `package.json` | 修改 | 根 build/test 接入 local-manager-api、cli-adapter-mock；新增 `@types/node` devDependency |
| `package-lock.json` | 修改 | 刷新新 workspace link 和 Node 类型依赖 |
| `packages/local-manager-api/package.json` | 新增 | API package metadata、bin、scripts、dependencies |
| `packages/local-manager-api/tsconfig.json` | 新增 | strict TypeScript NodeNext 配置 |
| `packages/local-manager-api/src/index.ts` | 新增 | API package exports |
| `packages/local-manager-api/src/local-manager-api.ts` | 新增 | HTTP/SSE server、envelope routing、JSON errors |
| `packages/local-manager-api/src/bin/server.ts` | 新增 | `notch-local-manager-api` 启动 bin |
| `packages/local-manager-api/tests/local-manager-api.test.mjs` | 新增 | API Node tests |
| `packages/cli-adapter-mock/package.json` | 新增 | mock CLI package metadata、bin、scripts |
| `packages/cli-adapter-mock/tsconfig.json` | 新增 | strict TypeScript NodeNext 配置 |
| `packages/cli-adapter-mock/src/index.ts` | 新增 | envelope fixtures、sender、scenario builder |
| `packages/cli-adapter-mock/src/bin/mock-cli-sender.ts` | 新增 | `notch-cli-adapter-mock` bin |
| `packages/cli-adapter-mock/tests/cli-adapter-mock.test.mjs` | 新增 | sender fixture Node tests |
| `docs/contracts/local-manager-api.md` | 新增 | P1 local API contract |
| `docs/handoffs/local-api-agent-p1.md` | 新增 | 本 handoff |

## 4. 关键决策

- API 是 thin wrapper：风险升级仍由 `MockLocalAgentManager.ingestEvent(...)` 和已接入的 `risk-policy` 负责，避免 API 复制业务逻辑。
- 使用 Node 内置 `http`，不引入 Express/Fastify。
- `GET /v1/events` 只推 `notch.snapshot.updated`，不推 action result；action result 通过 `POST /v1/envelopes` 同步响应返回。
- JSON body 限制为 1 MiB，错误统一 `{ ok: false, error: { code, message } }`。
- mock CLI sender 独立成包，便于后续真实 CLI adapter 参考 envelope 构造和 POST 行为。
- 新增 `@types/node` 仅用于 TypeScript 编译 Node 内置模块类型。

## 5. 暴露的接口或数据结构

- `createLocalManagerApi(options?)`
- `LocalManagerApiServer`
  - `listen(port?, host?)`
  - `close()`
  - `server`
  - `manager`
- API endpoints：
  - `GET /health`
  - `GET /v1/snapshot`
  - `POST /v1/envelopes`
  - `GET /v1/events`
- SSE event：
  - `event: notch.snapshot.updated`
  - `data` 是 `SnapshotUpdatedEnvelope`
- CLI sender exports：
  - `DANGEROUS_CONFIRM_COMMAND`
  - `createMockSession(...)`
  - `createMockEnvelopeSequence(...)`
  - `postEnvelope(...)`
  - `runMockCliSender(...)`

## 6. 测试结果

- 执行命令：`npm run test -w @notch-ai-monitor/local-manager-api`
- 结果：API 5 个 tests 全部通过；覆盖 health、snapshot、event ingestion、risky confirm -> risk/angry/peek、action request resolve、SSE snapshot updated。
- 执行命令：`npm run test -w @notch-ai-monitor/cli-adapter-mock`
- 结果：CLI adapter mock 3 个 tests 全部通过；覆盖 risky-confirm、all scenario envelope sequence、`postEnvelope` 实际 HTTP POST。
- 执行命令：`npm test`
- 结果：shared 9/9、local-manager-mock 8/8、risk-policy 6/6、local-manager-api 5/5、cli-adapter-mock 3/3 全部通过。
- 执行命令：`npm run build`
- 结果：shared、risk-policy、local-manager-mock、local-manager-api、cli-adapter-mock、desktop production build 全部通过。
- 本轮运行过 `npm install` 刷新 lockfile；未执行 `npm audit fix --force`。

## 7. 未解决问题

- 当前 API 没有持久化，也没有 auth；只适合 localhost P1 spike。
- API 尚未接 UI 或 Tauri IPC；desktop 仍通过现有 mock/debug path 工作。
- SSE 目前只广播 snapshot，不广播 action result 或 event updated。
- `notch.session.ended` 和 `notch.event.updated` 尚未实现；P1 任务未要求。
- mock CLI sender 只发送 HTTP envelope，不接真实终端、stdin/stdout marker 或 AI 工具进程。

## 8. 下一位 agent 需要知道的上下文

- UI 接入时可以先 `GET /v1/snapshot` 初始化，再订阅 `GET /v1/events`，每次收到 `notch.snapshot.updated` 后用 `payload.snapshot` 替换本地 manager 真值。
- UI action 通过 `POST /v1/envelopes` 发送 `notch.action.requested`，同步响应里的 `result.envelope.payload` 是 action result。
- 真实 CLI adapter 接入时应发送标准 protocol envelope，尤其是 `notch.session.upserted` 和 `notch.event.created`。
- 危险命令测试路径：发送 `type: "confirm"` 且 `command: "rm -rf ~/Documents/xhs-drafts/* && git clean -fd"`，API 返回的 ingested event 会是 `type: "risk"`，snapshot 会是 `mood: "angry"`、`restingState: "peek"`。
- 测试 server 使用 port `0` 并在测试结束 `close()`，不会留下长期运行服务。

## 9. 注意事项

- 不要回滚其他 agent 或用户已有改动。
- 如果需要修改非自己 ownership 文件，先在 handoff 中写明原因。
- P1 仍是本地 mock 接入点，不扩展到完整产品实现。
- 本轮没有修改 `apps/desktop` 源码，没有接真实 Claude/Codex/Qwen，没有执行任何 mock command 中的命令。
