# Main Agent Handoff: P3 Release Artifact Packaging

日期：2026-06-09

## 1. 目标

本轮目标是把 P3 Electron packaging MVP 推进到真实 macOS artifact tooling：

- 生成本地可运行的 `.app`。
- 生成本地可挂载的 `.dmg`。
- 补 app name/version/bundle id/icon metadata。
- 增加 artifact smoke，覆盖从 `.app` 或挂载 `.dmg` 启动真实 app-managed Manager。
- 保留 signing/notarization 占位，但不在没有 Developer ID 的情况下伪造正式分发状态。

## 2. 已完成

- 新增 `@electron/packager` dev dependency。
- 新增 `npm run package:mac`：
  - 先运行完整 `npm run build`。
  - 生成 release staging。
  - 内置 `apps/electron/dist`、`apps/desktop/dist`、Local Manager API、real CLI adapter、shared/risk-policy/local-manager-mock package dist。
  - 复制必要 workspace package 到 staging `node_modules/@notch-ai-monitor/*`，让 packaged runtime 能解析 workspace imports。
  - 生成 `release/build/notch-ai-monitor.icns`。
  - 用 Electron Packager 生成 macOS `.app`。
  - 用 `hdiutil create -format UDZO` 生成 `.dmg`。
- 新增 `npm run smoke:artifact`：
  - 重新打包。
  - 挂载 DMG。
  - 从挂载卷启动 `.app`。
  - 验证 Manager `/health`。
  - 验证 Desktop connected。
  - 打开 Session Hub。
  - 用 real `notch-run` 向 app-managed Manager 注入 active event。
  - 关闭 app 后确认 app-managed Manager 端口下线。
- 扩展 `scripts/electron-packaging-smoke.mjs` 支持三种入口：
  - repo-run Electron MVP：无参数。
  - 本地 `.app`：`--app "release/artifacts/Notch AI Monitor.app"`。
  - 挂载 `.dmg` 后启动 app：`--dmg "release/artifacts/Notch-AI-Monitor-0.3.0-mac-arm64.dmg"`。

## 3. 修改/新增文件

- `package.json`
  - 新增 `package:mac`。
  - 新增 `smoke:artifact`。
  - 保留 `smoke:packaging` 作为 repo-run Electron MVP smoke。
  - 新增 `@electron/packager` dev dependency。
- `package-lock.json`
  - 记录 Packager dependency 和 Electron app metadata 变化。
- `apps/electron/package.json`
  - product name: `Notch AI Monitor`
  - version: `0.3.0`
  - description: `Local desktop monitor for AI coding sessions.`
- `scripts/package-electron-mac.mjs`
  - 新增 mac artifact packaging 脚本。
- `scripts/electron-packaging-smoke.mjs`
  - 扩展 artifact smoke。
- `docs/qa/p2-p3-beta-acceptance.md`
  - 新增 `smoke:artifact` acceptance。
  - 更新 artifact、signing、notarization 状态。
- `docs/handoffs/main-agent-context-checkpoint-p2.md`
  - 新增 P3 Release Artifact Packaging 工作日志。
- `docs/handoffs/main-agent-p3-release-artifact-packaging.md`
  - 本 handoff。

## 4. 关键决策

- 本阶段选 `@electron/packager + hdiutil`，暂不引入 Electron Forge/Builder。
  - 原因：当前需要显式可审计的 staging 内容、快速生成 `.app/.dmg`、本地 unsigned artifact smoke。
  - 后续接 Developer ID、notarization、auto-update 时，可以迁移到 Forge/Builder 或在现有脚本上继续扩展。
- `.app` 从 packager 输出复制到 `release/artifacts` 时使用 `ditto`。
  - 原因：`fs.cp` 会破坏 Electron Framework 的 bundle symlink 布局，导致 packaged app 启动时报 `icudtl.dat` 相关运行时错误。
- Packager 设置 `prune: false`。
  - 原因：staging 中 workspace package 是最小 dist subset，不能让 Packager 按普通 npm dependency pruning 删除必需的本地 package。
- packaged app smoke 不使用 Playwright `_electron.launch()` 启动 `.app`。
  - 原因：该路径会给 packaged app 注入 debug 参数，在当前 Electron/macOS 组合上会导致 packaged runtime 异常。
  - 当前做法：直接 spawn `.app/Contents/MacOS/Notch AI Monitor --remote-debugging-port=<port>`，再用 Chromium CDP 连接。
- Desktop UI 仍只通过 query 注入的 app-managed Manager URL 消费 Local Manager API，不读取 persistence file，也不直接控制 CLI 进程。

## 5. 产物

当前本机 artifact 路径：

- `.app`: `release/artifacts/Notch AI Monitor.app`
- `.dmg`: `release/artifacts/Notch-AI-Monitor-0.3.0-mac-arm64.dmg`

当前 bundle metadata：

- `CFBundleDisplayName`: `Notch AI Monitor`
- `CFBundleName`: `Notch AI Monitor`
- `CFBundleIdentifier`: `com.notch-ai-monitor.desktop`
- `CFBundleShortVersionString`: `0.3.0`
- `CFBundleVersion`: `0.3.0`
- `CFBundleIconFile`: `electron.icns`

当前 artifact 默认未签名，适合本地 smoke，不适合正式分发。

## 6. Signing / Notarization 状态

- `scripts/package-electron-mac.mjs` 已支持 `NOTCH_MAC_SIGN_IDENTITY`，会传给 Packager `osxSign.identity`。
- `notarization` 仍输出 `not-configured`。
- 下一步需要 Developer ID Application certificate、Team ID、Apple ID/App Store Connect API 凭据。
- 接入后应新增签名后验证：
  - `codesign --verify --deep --strict --verbose=2`
  - `spctl --assess --type execute`
  - notarization submit/staple
  - 签名/公证后的 `.dmg` artifact smoke

## 7. 验证结果

已通过：

- `npm run package:mac`
- `node scripts/electron-packaging-smoke.mjs --app "release/artifacts/Notch AI Monitor.app"`
- `node scripts/electron-packaging-smoke.mjs --dmg "release/artifacts/Notch-AI-Monitor-0.3.0-mac-arm64.dmg"`
- `npm run smoke:artifact`
- `npm run smoke:packaging`
- `git diff --check`

额外人工/命令核对：

- `.app` bundle metadata 已写入 `0.3.0`、bundle id 和 app name。
- `.icns` 已复制到 bundle resources，hash 与生成源一致。
- `.dmg` 为 UDZO read-only compressed image。
- Electron Framework symlink 经 `ditto` 后保持相对 bundle symlink。
- artifact smoke 退出后 app-managed Manager 端口下线。

## 8. 已知注意点

- `@electron/packager` 在 macOS 新版本上会提示找不到 `.icon` 格式 icon；当前 `.icns` 仍被写入 bundle，并已核对 hash。后续如要完全消除 warning，可补 macOS `.icon` 资产或升级/配置 Packager。
- `npm install -D @electron/packager` 后 npm audit 仍报告 2 个 moderate vulnerabilities。本轮未执行 `npm audit fix --force`，避免破坏性升级。
- `release/` 是生成产物目录，当前未判断是否应加入 `.gitignore`；下一位 agent 如果要清理 repo hygiene，可以单独处理。

## 9. 下一步建议

1. 接入 Developer ID signing 和 notarization。
2. 增加签名/公证后的 artifact smoke。
3. 决定是否迁移到 Electron Forge/Builder，以获得更标准的 maker/notarize/update pipeline。
4. 补安装体验 QA：拖拽到 Applications、Gatekeeper、隔离属性、覆盖安装、用户目录 persistence 迁移。
5. 明确 crash/log collection 与 first-run 隐私说明。
