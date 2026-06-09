# Main Agent Handoff: P3 Packaging MVP Electron Shell

日期：2026-06-09
阶段：P3 packaging MVP
主线：Electron app shell + app-managed Local Manager API lifecycle

## 本次目标

实现首个 packaging MVP：

1. Electron app 启动 Local Manager API 子进程。
2. Desktop UI 加载内置 `apps/desktop/dist`，通过 app-managed Manager URL 连接。
3. persistence path 移到用户目录，并保持 process state / event history logical section 分离。
4. App 退出时 graceful shutdown 自己启动的 Manager API。
5. 增加 app-level logs。
6. 增加 packaging smoke。

## 已完成内容

- 新增 `@notch-ai-monitor/electron-app` workspace。
- Electron main process 会：
  - 解析 repo/app resource path。
  - 创建 `~/Library/Application Support/Notch AI Monitor/` 下的 runtime 目录。
  - 使用 Electron 的 `ELECTRON_RUN_AS_NODE=1` 或 `NOTCH_NODE_BIN` 启动 Local Manager API 子进程。
  - 传入 `--port 0`、`--process-side-effects supervised`、独立 process/event history persistence file、`--pending-action-sweep-interval-ms 30000`。
  - 解析 Manager stdout 中的 app-managed URL，并等待 `/health`。
  - 加载 `apps/desktop/dist/index.html?manager=api&managerUrl=<app-managed-url>`。
  - App 退出时向自己启动的 Manager 子进程发送 SIGTERM 并等待退出。
- Desktop Vite build 新增 `base: "./"`，支持 Electron `file://` 加载内置 dist assets。
- Local Manager API 新增可选 logger port；server bin 在 `NOTCH_APP_MANAGED=1` 时记录 adapter registration failures 和 SSE disconnects 到 stderr，Electron app 捕获后写入 app log。
- 新增 root scripts：
  - `npm run dev:electron`
  - `npm run smoke:packaging`
- 新增 `scripts/electron-packaging-smoke.mjs`：
  - 启动 Electron app。
  - 验证 Manager `/health`。
  - 验证 Desktop connected。
  - 打开 Session Hub。
  - 用 real `notch-run` 向 app-managed Manager 注入 active error event。
  - 关闭 Electron 后验证 Manager 端口下线。

## 修改 / 新增文件

- `package.json`
- `package-lock.json`
- `apps/desktop/vite.config.ts`
- `apps/electron/package.json`
- `apps/electron/tsconfig.json`
- `apps/electron/src/main.ts`
- `packages/local-manager-api/src/index.ts`
- `packages/local-manager-api/src/local-manager-api.ts`
- `packages/local-manager-api/src/bin/server.ts`
- `scripts/electron-packaging-smoke.mjs`
- `docs/qa/p2-p3-beta-acceptance.md`
- `docs/handoffs/main-agent-context-checkpoint-p2.md`
- `docs/handoffs/main-agent-p3-packaging-mvp-electron.md`

## Runtime Paths

macOS app-managed persistence/log paths:

- User data root: `~/Library/Application Support/Notch AI Monitor/`
- Process state: `~/Library/Application Support/Notch AI Monitor/process-state/process-state.json`
- Event history: `~/Library/Application Support/Notch AI Monitor/event-history/event-history.json`
- App log: `~/Library/Application Support/Notch AI Monitor/logs/app.log`

These files are owned by the app-managed Local Manager API and Electron shell. Desktop still reads only Manager API snapshot/read-only endpoints.

## Key Decisions

- Electron was chosen for MVP because the Manager API and adapters are Node runtime.
- The app shell uses a random localhost port (`--port 0`) and injects the discovered URL into Desktop query params.
- App-managed Manager is a child process, not an in-process API instance, so lifecycle and smoke match the future packaged boundary.
- The Electron app uses SIGTERM only for its own Manager child process. It does not terminate product CLI processes by PID.
- Full signed `.app` / `.dmg`, notarization, auto-update, icon/version metadata, and installer QA remain out of this MVP.

## Testing Results

- `npm run smoke:packaging`: passed.
  - app-managed Manager URL: `http://127.0.0.1:54596`
  - injected event: `evt_real_codex_cli_error_20260608170600_0001`
  - app close shut down Manager port.
- `npm run build`: passed.
- `npm run test -w @notch-ai-monitor/local-manager-api`: 30/30 passed.
- `npm run smoke:real-link`: passed.
  - completion: `completed/resolved/terminate_graceful_completed`
  - timeout: `expired/failed/pending_action_timeout`, event remained `active`
- `npm run test:qa:real-link`: 1/1 passed.
- `npm run test:qa`: 12/12 passed.
- `git diff --check`: passed for tracked diffs.

## Current Service State

Long-running dev services were not restarted by this P3 implementation:

- Local Manager API remains expected at `http://127.0.0.1:4317`.
- Desktop Vite remains expected at `http://127.0.0.1:5174`.
- Packaging smoke used temporary app-managed random ports and confirmed they shut down after app close.

## Next Agent Notes

- Next packaging step should likely add release artifact tooling: Electron Packager/Forge/Builder choice, `.app` metadata, icon, version, signing/notarization decision, and install/first-run QA.
- Keep Desktop UI decoupled. It should continue to consume only Manager URL + read-only endpoints.
- Do not introduce force kill. `terminate` product action remains graceful only; Electron only owns its own Manager child lifecycle.
- If moving from repo-run smoke to real packaged artifact smoke, ensure `packages/local-manager-api/dist`, `packages/cli-adapter-real/dist`, and `apps/desktop/dist` are included in the app resources.
