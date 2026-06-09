# Main Agent Handoff: P2 Repeatable Real Link Smoke

日期：2026-06-09  
阶段：P2 beta hardening  
主线：可重复 real-link QA smoke + dev/test pending timeout override

## 本次目标

把上一轮手工真实链路 smoke 封装成 repo 内可重复脚本，并决定是否增加 dev/test-only `pendingActionTimeoutMs` opt-in 配置。

目标链路：

1. real CLI adapter / `notch-run` registration
2. action request
3. pending action projection
4. graceful completion
5. scheduler-driven timeout

## 已完成内容

- Local Manager API 新增 `pendingActionTimeoutMs?: number | null` option。
- server bin 新增：
  - `NOTCH_PENDING_ACTION_TIMEOUT_MS`
  - `--pending-action-timeout-ms`
- timeout override 只用于 dev/test opt-in：
  - unset：Manager 默认 5 分钟
  - `0`：关闭 pending action timeout deadline
  - 正整数：覆盖 pending action deadline
- 新增 `scripts/real-link-beta-smoke.mjs`：
  - 默认启动临时 Local Manager API，端口 0 自动分配。
  - 临时 API 使用 supervised side effects、短 pending timeout、短 scheduler interval。
  - completion smoke：`notch-run` long child -> unconfirmed terminate -> confirmed terminate -> accepted pending -> child graceful exit -> pending completed/event resolved。
  - timeout smoke：`notch-run` long child -> confirmed terminate -> accepted pending -> scheduler natural expiry -> pending expired/event remains active -> late session ended does not overwrite expired state。
- root 新增 script：

```bash
npm run smoke:real-link
```

## 修改 / 新增文件

- `packages/local-manager-api/src/local-manager-api.ts`
  - 新增 `pendingActionTimeoutMs?: number | null` option 并传入 `createMockLocalAgentManager()`。
- `packages/local-manager-api/src/bin/server.ts`
  - 新增 env/CLI 解析。
  - 启动日志显示 pending action timeout 使用 `default` / `off` / `Nms`。
- `packages/local-manager-api/tests/local-manager-api.test.mjs`
  - 新增测试覆盖短 timeout deadline 和 scheduler expiry。
- `scripts/real-link-beta-smoke.mjs`
  - 新增可重复真实链路 QA 脚本。
- `package.json`
  - 新增 `smoke:real-link`。
- `docs/contracts/local-manager-api.md`
- `docs/contracts/internal-scheduler-sse-p2.md`
- `docs/contracts/event-history-pending-actions-p2.md`
- `docs/contracts/retry-terminate-p2.md`
- `docs/handoffs/main-agent-context-checkpoint-p2.md`
- `docs/handoffs/main-agent-repeatable-real-link-smoke-p2.md`

## 关键决策

- 选择实现 dev/test-only `pendingActionTimeoutMs` opt-in。
- 不把 timeout override 做成 Desktop 能力；Desktop 仍只读 Manager API projection。
- QA 脚本默认启动临时 API，避免污染长期 4317。
- timeout smoke 使用 scheduler 自然过期，不再依赖 debug sweep 推进 `at`。
- 长期 4317 保持 beta 默认 timeout，不使用短 timeout。

## 暴露接口 / 配置

新增 Local Manager API option：

```ts
pendingActionTimeoutMs?: number | null;
```

新增 env/CLI：

```bash
NOTCH_PENDING_ACTION_TIMEOUT_MS=1200
--pending-action-timeout-ms 1200
```

可与 scheduler 组合：

```bash
NOTCH_PENDING_ACTION_TIMEOUT_MS=1200 \
NOTCH_PENDING_ACTION_SWEEP_INTERVAL_MS=200 \
  npm run serve -w @notch-ai-monitor/local-manager-api
```

## 测试结果

- `npm run test -w @notch-ai-monitor/local-manager-api`：30/30 通过。
- `npm run smoke:real-link`：通过。
  - 临时 API：`http://127.0.0.1:64414`
  - completion：`completed`, event `resolved`, resolution `terminate_graceful_completed`
  - timeout：`expired`, resultStatus `failed`, errorCode `pending_action_timeout`, event `active`
- `npm run build`：通过。
- `npm run test:qa`：12/12 通过。
- `git diff --check`：通过。

## 当前运行态

- 长期 Local Manager API 已用最新 dist 重启：
  - URL：`http://127.0.0.1:4317`
  - PID：`31141`
  - 参数：`--process-side-effects supervised --event-history-persistence-file /tmp/notch-event-history-p2.json --pending-action-sweep-interval-ms 30000`
  - pending action timeout：`default`
  - snapshot：干净，sessions=0，activeEvents=0，pendingActions=0
- Desktop Vite 仍在：
  - URL：`http://127.0.0.1:5174`
  - PID：`94874`

## 未解决问题

- `smoke:real-link` 目前是 Node script，不是 Playwright Browser QA；它验证 Manager/API/adapter runtime 链路，不验证 Desktop UI。
- timeout override 是否应该进入正式 beta docs / CLI help 仍可后续再做产品化措辞。
- 若未来要支持 per-action timeout，例如 retry 和 terminate 不同 deadline，需要另开合同；本轮只做 global dev/test override。

## 下一位 agent 需要知道

- 想跑真实链路回归时直接执行：

```bash
npm run smoke:real-link
```

- 想对长期 4317 手动开启短 timeout，可以显式传：

```bash
npm run serve -w @notch-ai-monitor/local-manager-api -- \
  --host 127.0.0.1 \
  --port 4317 \
  --process-side-effects supervised \
  --pending-action-timeout-ms 1200 \
  --pending-action-sweep-interval-ms 200
```

- 长期服务默认不建议开启短 timeout，除非正在做 QA。
