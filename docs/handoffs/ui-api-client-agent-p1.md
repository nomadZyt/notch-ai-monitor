# UI API Client Agent P1 Handoff

日期：2026-06-06  
Agent：P1 UI API Client Agent  
阶段：P1 第一个真实接入点  
工作目录：`/Users/zhaiyongtao/vibeCoding/notch-ai-monitor`

## 1. 本次目标

- 将 desktop 从浏览器内存 `MockLocalAgentManager` 默认路径切到本地 HTTP/SSE API client。
- 支持 `GET /v1/snapshot`、`GET /v1/events`、`POST /v1/envelopes` 的最小 UI 接入。
- 保留 `?manager=mock` 浏览器内存 fallback，便于单独做 UI 开发和 P0 smoke。
- 不修改 API server 业务逻辑，不接真实 Claude/Codex/Qwen，不做 Tauri IPC 或真实命令执行。

## 2. 已完成内容

- 新增 desktop manager client 抽象 `DesktopManagerClient`。
- 新增 `LocalManagerApiClient`：
  - `init()` 时 `GET /v1/snapshot` 初始化 snapshot。
  - 使用 `EventSource` 订阅 `GET /v1/events` 的 `notch.snapshot.updated`。
  - `requestAction(...)` 通过 `POST /v1/envelopes` 发送 `notch.action.requested`，读取同步响应里的 `notch.action.result` payload。
  - `injectScenario(...)` 通过 `POST /v1/envelopes` 发送 `notch.debug.injected`。
  - API 不可用、SSE 中断、响应格式错误会进入 UI toast/live region，不会白屏。
- 新增 `MockManagerClient` 包装现有 `MockLocalAgentManager`，保持 P0 UI smoke 体验。
- `bootstrap` 默认连接 `http://127.0.0.1:4317`；`?manager=mock` 走浏览器内存 mock；`?managerUrl=...` 可覆盖 API 地址。
- `app-shell` 仅从直接依赖 mock manager 改成依赖 client interface，并把 action/debug 调用改成 async。
- QA 保留 P0 mock smoke，并新增 API-client e2e smoke 和 API 不可用 smoke。

## 3. 修改/新增文件

| 文件 | 类型 | 说明 |
| --- | --- | --- |
| `apps/desktop/src/manager-client/types.ts` | 新增 | desktop manager client interface、空 snapshot、错误类型 |
| `apps/desktop/src/manager-client/local-manager-api-client.ts` | 新增 | HTTP/SSE API client |
| `apps/desktop/src/manager-client/mock-manager-client.ts` | 新增 | mock manager adapter |
| `apps/desktop/src/manager-client/index.ts` | 新增 | manager-client exports |
| `apps/desktop/src/app/bootstrap.ts` | 修改 | 默认 API client，支持 `?manager=mock` 和 `?managerUrl=` |
| `apps/desktop/src/app/app-shell.ts` | 修改 | 依赖 `DesktopManagerClient`，处理 async action/debug 和错误 toast |
| `apps/desktop/src/debug/debug-harness.ts` | 修改 | 依赖 client interface，返回 async snapshot |
| `apps/desktop/tests/e2e/p0-smoke.spec.mjs` | 修改 | P0 smoke 显式打开 `?manager=mock` |
| `apps/desktop/tests/e2e/api-client-smoke.spec.mjs` | 新增 | API snapshot 初始加载、action POST resolve、API 不可用不白屏 |
| `apps/desktop/tests/playwright.config.mjs` | 修改 | QA webServer 使用 root `dev:qa` 先构建 local API dist |
| `package.json` | 修改 | 新增 `dev:api`、`dev:qa` scripts |
| `docs/handoffs/ui-api-client-agent-p1.md` | 新增 | 本 handoff |

## 4. 关键决策

- API client 只做 transport 翻译，不复制 manager/risk/action 业务逻辑；snapshot 仍然由 API server 返回结果驱动。
- UI 构造时可以先渲染空 snapshot，再异步 `init()` API；这样默认 4317 未启动时仍有 shell、toast 和 live region。
- P0 mock smoke 改为 URL fallback，而不是把 default 留在 mock；P1 默认路径现在是 API client。
- API e2e 使用 `createLocalManagerApi()` 监听 port `0`，测试结束 `api.close()`，不占用 4317，也不依赖长期服务。
- `npm run test:qa` 的 desktop webServer 保留 `reuseExistingServer: !CI`，避免关闭用户已有 5174 dev server。

## 5. 暴露的接口或数据结构

- `DesktopManagerClient`
  - `getSnapshot(): ManagerSnapshot`
  - `subscribe(listener): () => void`
  - `subscribeErrors?(listener): () => void`
  - `requestAction(payload): Promise<ActionResultPayload>`
  - `injectScenario(scenario): Promise<ManagerSnapshot>`
  - `close?(): void`
- `LocalManagerApiClient`
  - 默认 base URL：`http://127.0.0.1:4317`
  - action envelope source：`{ kind: "ui", name: "notch-desktop" }`
  - debug envelope source：`{ kind: "debug", name: "notch-desktop" }`
- Desktop URL options：
  - 默认：API client -> `http://127.0.0.1:4317`
  - `?manager=mock`
  - `?manager=api&managerUrl=http://127.0.0.1:<port>`

## 6. 测试结果

- 执行命令：`npm run build -w @notch-ai-monitor/desktop`
  - 结果：通过，desktop TypeScript + Vite production build 成功。
- 执行命令：`npm test`
  - 结果：通过，shared 9/9、local-manager-mock 8/8、risk-policy 6/6、local-manager-api 5/5、cli-adapter-mock 3/3。
- 执行命令：`npm run test:qa`
  - 结果：通过，6 个 Playwright tests 全部通过；包含 API client smoke、API unavailable smoke、P0 mock UI smoke。
- 执行命令：`npm run build`
  - 结果：通过，所有 workspace build 和 desktop build 成功。

## 7. 未解决问题

- 默认 API 模式需要本地 API server 已启动；未启动时 UI 会提示错误但不会自动回退到 mock。
- 还没有真实 CLI adapter、真实命令执行、进程控制、Tauri IPC 或持久化。
- SSE 只消费 `notch.snapshot.updated`；action result 仍只通过 POST 同步响应处理，符合当前 API contract。
- API client 当前没有重连状态 UI，只在 SSE 首次中断时提示并保留最近 snapshot。

## 8. 下一位 agent 需要知道的上下文

- 本地开发 API 默认路径：
  - 终端 1：`npm run dev:api`
  - 终端 2：`npm run dev -w @notch-ai-monitor/desktop`
- 单独开发 UI 时使用：`http://127.0.0.1:5174/?manager=mock`
- 指定临时 API server 时使用：`http://127.0.0.1:5174/?manager=api&managerUrl=http://127.0.0.1:<port>`
- 真实 CLI adapter 只需要向 API server 发送标准 protocol envelope；UI 不应直接接真实 Claude/Codex/Qwen，也不应接真实命令执行。
- 真实 adapter 做 action 执行时，要保持 `notch.action.requested` -> `notch.action.result` 的 `correlationId` / `requestId` 对齐，否则 UI 无法可靠展示 action 结果。

## 9. 注意事项

- 不要回滚其他 agent 或用户已有改动。
- 如果需要修改非自己 ownership 文件，先在 handoff 中写明原因。
- P1 只做本地 API 接入，不扩展到完整产品实现。
- 本轮没有修改 `packages/local-manager-api` server 业务逻辑，没有修改 `packages/shared`、`risk-policy`、`local-manager-mock` 业务逻辑，没有执行真实 AI CLI 或真实命令副作用。
