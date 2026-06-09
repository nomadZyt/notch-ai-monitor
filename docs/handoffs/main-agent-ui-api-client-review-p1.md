# Main Agent UI API Client Review P1 Handoff

日期：2026-06-06  
Agent：Main Agent  
阶段：P1 UI API Client 集成复核  
工作目录：`/Users/zhaiyongtao/vibeCoding/notch-ai-monitor`

## 1. 本次目标

- 复核 UI API Client Agent 的交付是否满足 P1 真实接入点目标。
- 验证 desktop 默认路径已从内存 mock manager 切到本地 `GET /v1/snapshot`、`GET /v1/events`、`POST /v1/envelopes`。
- 验证 `mock CLI event -> Local Agent Manager API -> EventQueue -> Notch UI -> 用户动作 -> event resolved` 主链路。

## 2. 已完成内容

- 审阅 `DesktopManagerClient`、`LocalManagerApiClient`、`MockManagerClient`、`bootstrap`、`app-shell`、`DebugHarness`、Playwright QA 配置和 handoff。
- 确认 UI 默认连接 `http://127.0.0.1:4317`，`?manager=mock` 保留 P0 fallback。
- 确认 UI client 只做 HTTP/SSE transport 翻译，不复制 manager、risk、action 业务逻辑。
- 通过浏览器手动验收默认 API 路径：
  - 空 API snapshot -> UI 安静态。
  - CLI mock sender 注入危险命令 -> UI 通过 SSE 进入 `peek` / `angry` / 风险态。
  - UI 点击 `reject` -> `POST /v1/envelopes` 返回 action result -> API snapshot 中事件变为 `ignored`，active event 清空。
- 验证 `?manager=mock` fallback 仍进入 P0 all-events 风险演示态。

## 3. 修改/新增文件

- `docs/handoffs/main-agent-ui-api-client-review-p1.md`

## 4. 关键决策

- 接受 UI API Client Agent 的 P1 实现作为当前默认 desktop 接入路径。
- 保持 API 未启动时不自动 fallback 到 mock；UI 只显示可恢复错误，避免开发者误以为正在接真实 manager。
- 保持 action result 由 POST 同步响应读取，snapshot 真值由 API response/SSE 更新驱动。

## 5. 暴露的接口或数据结构

- 未新增接口。
- 复核通过的 UI client contract：
  - `getSnapshot(): ManagerSnapshot`
  - `subscribe(listener): () => void`
  - `subscribeErrors?(listener): () => void`
  - `requestAction(payload): Promise<ActionResultPayload>`
  - `injectScenario(scenario): Promise<ManagerSnapshot>`
  - `close?(): void`

## 6. 测试结果

- `npm run build`：通过。
- `npm test`：通过。
  - shared 9/9
  - local-manager-mock 8/8
  - risk-policy 6/6
  - local-manager-api 5/5
  - cli-adapter-mock 3/3
- `npm run test:qa`：通过，6/6。
  - API client smoke 通过。
  - API unavailable 不白屏通过。
  - P0 mock UI smoke 通过。
- Browser 手动验收通过：
  - `http://127.0.0.1:5174/` 默认 API 页面可渲染。
  - `npm run send -w @notch-ai-monitor/cli-adapter-mock -- risky-confirm --url http://127.0.0.1:4317` 可驱动 UI 风险态。
  - UI `reject` 后 API snapshot `counts.activeEvents === 0`，事件状态为 `ignored`。
  - 浏览器 console error log 为空。

## 7. 未解决问题

- `npm audit` 仍有 Vite/esbuild 相关 moderate vulnerabilities；自动修复会触发 Vite major upgrade，本阶段未处理。
- 默认 API 页面需要 `npm run dev:api` 常驻；未做进程守护、自动发现或 Tauri IPC。
- 真实 CLI adapter、真实命令执行、进程控制和持久化仍未接入。

## 8. 下一位 agent 需要知道的上下文

- 当前推荐开发启动方式：
  - `npm run dev:api`
  - `npm run dev -w @notch-ai-monitor/desktop`
- 默认 UI 地址：`http://127.0.0.1:5174/`
- mock fallback：`http://127.0.0.1:5174/?manager=mock`
- 真实 CLI adapter 下一步应只负责把真实工具事件翻译成 protocol envelope 并发送给 API server。
- 后续必须保持 UI 不直接依赖 Claude/Codex/Qwen 进程细节；UI 只信任 Manager API snapshot/SSE/action result。
