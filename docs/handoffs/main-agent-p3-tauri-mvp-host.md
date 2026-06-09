# P3 Tauri MVP Host Handoff

日期：2026-06-09

## 目标

按用户纠偏后的产品事实，先实现一个 Tauri Web UI MVP host：它应表现为 macOS 刘海区域附近的本地 AI CLI agent 控制面，而不是普通 dashboard、固定 popover 或整屏透明 overlay。

## 已读产品事实

- `docs/technical-options-and-task-plan.md`：Tauri + Web UI 是最快 Web UI MVP 路线；SwiftUI/AppKit 仍是 formal host 候选/后续路线；Electron 只适合 demo/spike。
- `docs/product-requirements-v2.md`：默认隐藏在 MacBook 刘海区域附近，只在 AI 会话需要介入时以轻量胶囊、表情状态、下拉面板提醒。
- `docs/效果说明.md`：真实 Mac 刘海尺寸不变，胶囊从刘海背后滑出；表情在右胶囊里。
- `docs/product-audit.md` 与高保真/截图：现有视觉基准覆盖固定刘海、左右胶囊、右当前事件、左会话入口和面板就近落下；debug/demo 不得混入正式体验。

## 已完成

- 新增 `apps/tauri` Tauri 2 MVP host。
- Tauri app 启动 app-managed Local Manager API，监听随机 `127.0.0.1` port。
- Tauri app 加载内置 `apps/desktop/dist`，注入 `manager=api&managerUrl=<app-managed-url>&surface=tauri-mvp`。
- Tauri window 是顶部居中的小尺寸透明 WebView：
  - compact: `820x120`
  - expanded: `820x560`
  - 不是整屏 overlay，不遮挡整屏点击。
- Desktop 新增 `surface=tauri-mvp`，保留刘海、左右胶囊、右表情 capsule 和就近下拉面板。
- Desktop 对 Tauri surface 只通过 `@tauri-apps/api/core` 调用 `set_surface_expanded` 同步窗口高度；业务仍只消费 Manager read-only snapshot/projection endpoints。
- Tauri persistence/log 路径：
  - process state: `~/Library/Application Support/Notch AI Monitor/process-state/process-state.json`
  - event history: `~/Library/Application Support/Notch AI Monitor/event-history/event-history.json`
  - app log: `~/Library/Application Support/Notch AI Monitor/logs/tauri-mvp.log`
- Tauri app 支持正常关闭、Tauri exit event、SIGTERM/SIGINT 时关闭自己启动的 Manager。
- 本地 `.app` 可直接打开：优先使用运行时 `NOTCH_REPO_ROOT`，否则使用构建时注入的 repo path 找 Manager runtime。
- Tauri bundle target 暂时收窄为 `.app`；DMG 阶段曾在本机 `bundle_dmg.sh` 失败，未硬凑。
- Electron active code 已在后续清理中移除，当前活跃 macOS host 路线只保留 Tauri MVP。

## 修改文件

- `apps/tauri/package.json`
- `apps/tauri/src-tauri/Cargo.toml`
- `apps/tauri/src-tauri/Cargo.lock`
- `apps/tauri/src-tauri/build.rs`
- `apps/tauri/src-tauri/tauri.conf.json`
- `apps/tauri/src-tauri/capabilities/default.json`
- `apps/tauri/src-tauri/src/main.rs`
- `apps/desktop/package.json`
- `apps/desktop/src/app/app-shell.ts`
- `apps/desktop/src/ui/styles/notch.css`
- `package.json`
- `package-lock.json`
- `AGENTS.md`
- `scripts/design-surface-guard.mjs`
- `docs/qa/p2-p3-beta-acceptance.md`
- `docs/handoffs/main-agent-context-checkpoint-p2.md`
- 后续清理删除：
  - `apps/electron`
  - `scripts/electron-packaging-smoke.mjs`
  - `scripts/package-electron-mac.mjs`
  - `scripts/verify-mac-artifact.mjs`

## 验证结果

- `npm run guard:design` 通过。
- `npm run build:app -w @notch-ai-monitor/desktop` 通过。
- `npm run check -w @notch-ai-monitor/tauri-app` 通过。
- `npm run build` 通过。
- `npm run build:tauri-mvp` 通过，产物：
  - `apps/tauri/src-tauri/target/release/bundle/macos/Notch AI Monitor Tauri MVP.app`
- 从 `.app` 直接启动成功，app-managed Manager URL：
  - `http://127.0.0.1:60840`
- debug `all` 场景注入成功：
  - sessions: 3
  - events: 4
  - activeEvents: 4
- 截图：
  - `output/tauri-mvp/tauri-mvp-app-final-running.png`
- SIGTERM 退出清理验证通过：Tauri app 退出后日志记录 `manager graceful shutdown requested` / `manager process exited`，Manager 无残留。

## 当前运行状态

- Tauri `.app` 当前保留运行，方便用户查看：
  - app PID: `53221`
  - app-managed Manager PID: `53297`
  - Manager URL: `http://127.0.0.1:51775`

## 未解决问题

- Tauri `.app` 仍是本机 MVP：它通过本 repo 的 Node/Manager runtime 启动后端，不是可独立分发的离线包。
- Tauri DMG bundling 暂未完成；本机 `bundle_dmg.sh` 曾失败，当前只验 `.app`。
- 还没有 Tauri artifact smoke 脚本覆盖 `.app` 启动、Manager health、Desktop connected、Session Hub/action panel、real-link event 和退出清理。
- 还没有签名、公证、Applications 安装、升级迁移和正式分发 QA。
- SwiftUI/AppKit formal host 是否进入下一阶段仍需产品/技术决策。

## 下一位 Agent 注意

- 不要回到 Electron overlay/menu bar popover 惯性；Electron active code 已清理，不要恢复为产品宿主或 packaging spike。
- 不要把 fake macOS wallpaper/menu-bar/demo controls 当正式产品体验。
- Tauri MVP 后续优先补：
  1. `smoke:tauri-mvp` 自动化。
  2. Tauri app artifact resource strategy，决定是否 bundle Node sidecar/Manager runtime。
  3. Tauri DMG 或安装包。
  4. 视觉 gate：截图覆盖 quiet、debug all、sessions panel、action panel。
- Desktop UI 继续只消费 Manager API read-only endpoints；不要新增直接 CLI/process/persistence/control-token 访问。
