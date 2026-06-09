# Notch AI Monitor P2/P3 Beta Acceptance

日期：2026-06-09
阶段：P2 beta acceptance -> P3 Tauri MVP host
范围：真实链路、Desktop Browser QA、dev/test timeout override、Tauri MVP host。

## 1. 当前结论

P2 runtime 已进入 beta-ready 状态：

- Local Manager API / Desktop API mode / real CLI adapter 主链路已跑通。
- `notch-run` registration -> action -> pending projection -> completion/timeout 已有可重复 smoke。
- Desktop 继续只消费 Manager API snapshot/read-only endpoints，不直接操作 CLI 进程或 persistence file。
- `terminate` 仍只走 graceful stop；没有 force kill、PID kill 或 raw token 访问。

P3 当前路线切到 Tauri MVP host：先用 Tauri 承载顶部刘海区域附近的小尺寸 WebView surface，并由 Tauri 启动 app-managed Local Manager API。这个 MVP 复用现有 Desktop Web UI / Manager API / real CLI adapter 成果，但不把窗口做成整屏透明 overlay，也不新增 Desktop 进程控制能力。

Electron active code 已清理；当前 checkpoint 保留它作为废弃 spike 的原因记录，过期 Electron 独立 handoff 已删除。后续 packaging / signing / notarization 应围绕 Tauri MVP 或 formal SwiftUI/AppKit host 继续，不恢复 Electron 路线。

## 2. 自动化入口

```sh
npm run smoke:real-link
npm run guard:design
npm run dev:tauri
npm run build:tauri-mvp
npm run test:qa:real-link
npm run test:qa
npm run build
```

建议 beta acceptance 顺序：

1. `npm run smoke:real-link`
2. `npm run guard:design`
3. `npm run build:tauri-mvp`
4. `npm run test:qa:real-link`
5. `npm run test:qa`
6. `npm run build`

## 3. Acceptance Checklist

| 验收项 | 状态 | 自动化覆盖 | 证据 |
| --- | --- | --- | --- |
| real CLI adapter registration | 已覆盖 | `npm run smoke:real-link` | 临时 API 收到 `notch.process.registered`，adapter control enabled |
| confirmed terminate completion | 已覆盖 | `npm run smoke:real-link` | pending `completed`，event `resolved`，resolution `terminate_graceful_completed` |
| scheduler-driven timeout projection | 已覆盖 | `npm run smoke:real-link` | pending `expired/resultStatus=failed/errorCode=pending_action_timeout`，event 保持 `active` |
| Desktop Session Hub 显示 real-link timeout 已过期 | 已覆盖 | `npm run test:qa:real-link` | Browser 打开 Desktop API mode，Session Hub “动作状态”包含“已过期 / 终止旧服务 / 动作等待完成超时” |
| product shape design guard | 已覆盖 | `npm run guard:design` | guarded UI/packaging 改动必须存在产品形态 checkpoint；Tauri/Desktop surface 修改前必须读产品设计源 |
| Tauri MVP host | 已覆盖到本地 smoke | `npm run dev:tauri` / `npm run build:tauri-mvp` | Tauri 启动 app-managed Manager，加载内置 Desktop dist 的 `surface=tauri-mvp`，顶部小尺寸窗口显示刘海、右表情胶囊、左/右 capsule 和展开面板；Manager persistence 写入用户目录，退出时关闭自己启动的 Manager |
| 常规 Desktop API/mock regression | 已覆盖 | `npm run test:qa` | 现有 12 条 Playwright QA |
| TypeScript/package build | 已覆盖 | `npm run build` | shared/risk-policy/manager/API/adapters/Desktop 全部 build |
| dev/test timeout override 可发现 | 已覆盖 | `notch-local-manager-api --help` + contracts | CLI help 和合同记录 `NOTCH_PENDING_ACTION_TIMEOUT_MS` / `--pending-action-timeout-ms` |
| Desktop 不新增 process control 能力 | 已覆盖 | contracts + Browser QA | Desktop 只读 projection；action 仍走 `notch.action.requested` |

## 4. Dev/Test Timeout Override

Local Manager API 支持 dev/test-only timeout override：

```sh
NOTCH_PENDING_ACTION_TIMEOUT_MS=1200 \
NOTCH_PENDING_ACTION_SWEEP_INTERVAL_MS=200 \
  npm run serve -w @notch-ai-monitor/local-manager-api
```

等价 CLI：

```sh
npm run serve -w @notch-ai-monitor/local-manager-api -- \
  --pending-action-timeout-ms 1200 \
  --pending-action-sweep-interval-ms 200
```

语义：

- unset：Manager 默认 5 分钟。
- `0`：关闭 pending action timeout deadline。
- 正整数：覆盖 pending action deadline。
- 只改变 `expiresAt`，不新增 retry/terminate endpoint，不调用 supervisor，不让 Desktop 获得新进程控制能力。

## 5. Per-Action Timeout 评估

当前不建议立刻实现 per-action timeout。

理由：

- 现有全局 timeout 已覆盖 P2 beta 风险：accepted action 不会永久显示“正在处理”。
- retry/terminate 的真实耗时边界还没有足够 beta 数据，过早分 action deadline 容易制造误过期。
- per-action timeout 会影响 action contract、QA matrix、文案和用户预期，应等 beta 数据后再定。

建议记录 beta 观察项：

| action | 当前 timeout | beta 观察 |
| --- | --- | --- |
| `terminate` | 全局默认 5 分钟 | 是否经常需要更短，例如 30-60 秒 |
| `retry` | 全局默认 5 分钟 | 是否需要更长，因为 retry 可能包含启动和风险 replay |
| `view-log` | 不适用 | noop/read-only，不进入 in-progress timeout |
| mocked/noop actions | 不适用 | terminal result，不进入 timeout |

后续触发条件：

- beta 中出现大量 terminate 长时间 pending。
- retry 的正常执行时间明显超过 terminate。
- 用户需要按 action type 解释 timeout。

## 6. P3 Tauri MVP / Beta Release Hardening

Tauri MVP 当前目标：

1. app host 选择 Tauri，因为产品技术路线文档把 Tauri + Web UI 列为最快 Web UI MVP 路线。
2. Tauri 启动 app-managed Local Manager API，监听随机 localhost port。
3. Desktop UI 加载内置 `apps/desktop/dist`，通过 app-managed Manager URL 连接，并显式使用 `surface=tauri-mvp`。
4. Tauri 窗口为顶部居中的小尺寸透明 WebView，不是全屏透明 overlay；展开面板时只增高本窗口。
5. 本地 `.app` 优先读取运行时 `NOTCH_REPO_ROOT`，否则使用构建时注入的 repo path 寻找 Manager runtime；这保证本机 MVP 可打开，但还不是可分发离线包。
6. persistence path 使用用户目录：
   - macOS: `~/Library/Application Support/Notch AI Monitor/`
   - process state: `process-state/process-state.json`
   - event history: `event-history/event-history.json`
7. app-level logs 写入 `~/Library/Application Support/Notch AI Monitor/logs/tauri-mvp.log`。
8. Desktop 仍只消费 Manager snapshot/read-only endpoints，不直接操作 CLI 进程或 persistence file。
9. 当前 Tauri MVP bundle target 先收窄到 `.app`，因为本机 Tauri create-dmg 阶段曾失败；DMG artifact smoke 后续单独接，不在本轮 MVP 里硬凑。
10. 当前 Tauri MVP 仍是本地 MVP，不等同于签名、公证后的正式分发 artifact。

## 7. 当前缺口

- 当前本机还没有 Developer ID 签名和 Apple notarization 后的 `.app` / `.dmg` release artifact。
- 当前 Tauri MVP 是正确路线上的本地 Web UI host，但还不是 SwiftUI/AppKit formal MVP，也还没有完成真实安装包、签名、公证和升级迁移 QA。
- Electron active code 已清理；过期 Electron 独立 handoff 已删除，废弃原因以 checkpoint / AGENTS / docs index 为准。
- 还没有自动更新。
- real-link Browser QA 覆盖 timeout UI，但还不覆盖 Tauri packaged app shell。
- Tauri signed/notarized release gate 还未接入。
- 还没有覆盖安装器、Applications 安装或升级迁移。
