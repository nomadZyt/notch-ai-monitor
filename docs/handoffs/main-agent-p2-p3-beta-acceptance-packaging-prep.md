# Main Agent Handoff: P2/P3 Beta Acceptance & Packaging Prep

日期：2026-06-09

## 本次目标

按用户指定的 5 个待办推进：

1. 把 `smoke:real-link` 接入 P2/P3 beta acceptance checklist。
2. 补 Browser QA 脚本，验证 real-link timeout 后 Desktop Session Hub 展示“已过期”。
3. 整理 dev/test timeout override 的开发文档或 CLI help 说明。
4. 评估是否需要 per-action timeout。
5. 进入 P3 packaging / beta release hardening：启动方式、持久化路径、长期服务管理、用户验收清单。

## 已完成内容

- 新增 `docs/qa/p2-p3-beta-acceptance.md`，记录 P2 beta-ready 结论、自动化验收顺序、真实链路 checklist、dev/test timeout override、per-action timeout 评估、P3 packaging hardening checklist。
- 新增独立 Browser QA：`apps/desktop/tests/real-link/real-link-timeout-ui.spec.mjs`。
  - 测试会启动临时 Local Manager API。
  - 通过 real `notch-run` 注册 live session / adapter control。
  - 发送 confirmed `terminate`。
  - 使用短 `pendingActionTimeoutMs` + scheduler 自然生成 `expired` pending action。
  - 打开 Desktop API mode，并验证 Session Hub “动作状态”包含“已过期 / 终止旧服务 / 动作等待完成超时”。
- 新增 `apps/desktop/tests/playwright.real-link.config.mjs`，让真实链路 Browser QA 与常规 `test:qa` 分离。
- 更新 root `package.json`，新增/接线 `npm run test:qa:real-link`。
- 更新 Local Manager API server bin `--help/-h`，让 dev/test timeout override 和 scheduler interval 在 CLI help 中可发现。
- 更新 `docs/handoffs/main-agent-context-checkpoint-p2.md` 第 27 节，记录本轮开始、复核、实现、验证和收尾状态。

## 修改/新增文件

- `package.json`
- `packages/local-manager-api/src/bin/server.ts`
- `apps/desktop/tests/playwright.real-link.config.mjs`
- `apps/desktop/tests/real-link/real-link-timeout-ui.spec.mjs`
- `docs/qa/p2-p3-beta-acceptance.md`
- `docs/handoffs/main-agent-context-checkpoint-p2.md`
- `docs/handoffs/main-agent-p2-p3-beta-acceptance-packaging-prep.md`

## 关键决策

- `test:qa:real-link` 独立于常规 `test:qa`。真实链路 QA 会 build real adapter 并启动临时 API，适合 beta acceptance，但不应拖慢普通 Desktop regression。
- 第一阶段不实现 per-action timeout。全局 pending action timeout 已足够覆盖 P2 beta；retry/terminate 是否需要不同 deadline 等 beta 数据后再定。
- P3 packaging 先落 hardening checklist，不在本轮直接引入 Electron/Tauri runtime。
- CLI help 只做可发现性增强，不改变 Local Manager API runtime side effect 边界。

## 暴露接口或数据结构

- 继续沿用已有 dev/test override：
  - `pendingActionTimeoutMs?: number | null`
  - `NOTCH_PENDING_ACTION_TIMEOUT_MS`
  - `--pending-action-timeout-ms`
- scheduler 入口继续沿用：
  - `pendingActionSweepIntervalMs?: number | null`
  - `NOTCH_PENDING_ACTION_SWEEP_INTERVAL_MS`
  - `--pending-action-sweep-interval-ms`
- 本轮未新增 Desktop process control 能力，未新增 retry/terminate side effect endpoint，未改变 shared protocol。

## 测试结果

- `npm run test:qa:real-link`：1/1 通过。
- `npm run test:qa`：12/12 通过。
- `npm run smoke:real-link`：通过。
  - completion：pending `completed`，event `resolved`，resolution `terminate_graceful_completed`。
  - timeout：pending `expired`，result `failed`，errorCode `pending_action_timeout`，event 保持 `active`。
- `npm run build`：通过。
- `npm run test -w @notch-ai-monitor/local-manager-api`：30/30 通过。
- `node packages/local-manager-api/dist/src/bin/server.js --help | rg ...`：通过，help 包含 timeout/scheduler env 与 CLI 参数。
- `git diff --check`：通过。

## 当前服务状态

- Local Manager API：`http://127.0.0.1:4317`，PID `31141`，`/health` ok。
- Desktop Vite：`http://127.0.0.1:5174`，PID `94874`。
- 当前长期 4317 snapshot 干净：`sessions=0`、`events=0`、`pending=0`。

## 未解决问题

- 还没有真正的 packaged `.app` shell。
- 还没有 app-managed Local Manager API lifecycle。
- 还没有用户目录 persistence path 迁移。
- 还没有 signing/notarization、icon/version metadata、auto update、crash/log collection 策略。
- `test:qa:real-link` 覆盖 Desktop Browser API mode，不覆盖未来 packaged shell 内嵌 UI。

## 下一位 agent 需要知道

- P2 beta acceptance 自动化入口现在是：
  1. `npm run smoke:real-link`
  2. `npm run test:qa:real-link`
  3. `npm run test:qa`
  4. `npm run build`
- P3 最自然下一步是实现 packaging MVP：
  - 选择 Electron app shell。
  - app 启动 Local Manager API 子进程。
  - Desktop 加载内置 `apps/desktop/dist` 并连接 app-managed Manager URL。
  - persistence 移到 `~/Library/Application Support/Notch AI Monitor/`。
  - app 退出时 graceful shutdown API。
  - 增加 packaged app smoke。
- 继续保持边界：Desktop 只消费 Manager API snapshot/read-only projection；不要让 Desktop 直接操作 CLI 进程、persistence file、raw control token 或 registry 私有结构。
