# Notch AI Monitor P1 Local Manager API Contract

日期：2026-06-06
阶段：P1 第一个真实接入点
实现包：`@notch-ai-monitor/local-manager-api`

## 1. 范围

本地管理 API 是 P1 的最小 localhost transport。它只包装 P0 的 `MockLocalAgentManager`，用于测试 CLI/mock adapter -> manager -> snapshot/SSE 的闭环。

本 API 不做：

- 真实 Claude/Codex/Qwen adapter。
- 真实命令执行、文件删除、进程终止或剪贴板写入。
- Tauri IPC、终端窗口定位或持久化数据库。
- UI 源码改造。

## 2. 启动方式

构建后启动默认服务：

```sh
npm run build -w @notch-ai-monitor/local-manager-api
npm run serve -w @notch-ai-monitor/local-manager-api -- --host 127.0.0.1 --port 4317
```

等价 bin：

```sh
npx notch-local-manager-api --host 127.0.0.1 --port 4317
```

默认地址是 `http://127.0.0.1:4317`。

P2.3 可选 process persistence：

```sh
NOTCH_PROCESS_PERSISTENCE_FILE=.notch/process-state.json \
  npm run serve -w @notch-ai-monitor/local-manager-api

npx notch-local-manager-api \
  --host 127.0.0.1 \
  --port 4317 \
  --process-persistence-file .notch/process-state.json
```

P2 event history / pending action projection persistence：

```sh
NOTCH_EVENT_HISTORY_PERSISTENCE_FILE=.notch/event-history.json \
  npm run serve -w @notch-ai-monitor/local-manager-api

npx notch-local-manager-api \
  --host 127.0.0.1 \
  --port 4317 \
  --event-history-persistence-file .notch/event-history.json
```

P2.4b 可选真实 process supervisor：

```sh
NOTCH_PROCESS_SIDE_EFFECT_MODE=supervised \
  npm run serve -w @notch-ai-monitor/local-manager-api

npx notch-local-manager-api \
  --host 127.0.0.1 \
  --port 4317 \
  --process-side-effects supervised
```

说明：

- process persistence 和 event history persistence 都默认不启用，避免测试和开发启动时自动落盘。
- 两类 persistence file 都只由 Local Manager API/Manager 读写；Desktop 不直接读取或写入文件。
- process persistence 当前持久化内容包括 process ownership、process action audit、retry launch profile 和 retry risk replay result。
- event history persistence 当前持久化内容包括 event history records、timeline entries、pending action projection 和 cursorVersion。
- 两类 persistence contract 是不同 logical sections；即便未来共用一个 JSON 文件，也不能让 Desktop 读取文件原文。
- process side effects 默认是 `mock`；只有显式 `supervised` 时才启用本地真实 supervisor。
- P2.4b supervisor 只重启已登记 `executable + args` 的 launch profile，不解析 `command` shell string。
- P2.4b graceful terminate 只作用于当前 supervisor 自己启动并持有 child handle 的进程；不会按 registration PID 直接终止外部进程。

P2 internal pending action scheduler：

```sh
NOTCH_PENDING_ACTION_SWEEP_INTERVAL_MS=30000 \
  npm run serve -w @notch-ai-monitor/local-manager-api

npx notch-local-manager-api \
  --host 127.0.0.1 \
  --port 4317 \
  --pending-action-sweep-interval-ms 30000
```

说明：

- 该 scheduler 已在 Local Manager API runtime 中实现，设计见 `docs/contracts/internal-scheduler-sse-p2.md`。
- scheduler 默认关闭，必须显式配置后才定时调用 Manager `expirePendingActions()`。
- `undefined` / unset / `0` 关闭；正整数毫秒值开启。beta 建议值仍是 `30000`。
- server listen 成功后会先运行一次 startup sweep，用于恢复 event history persistence 中 stale `in_progress` pending action。
- `LocalManagerApiServer.close()` 会清理 scheduler timer。
- scheduler 不调用 retry/terminate，不调用 supervisor，不按 PID 操作进程。

P2 dev/test pending action timeout override：

```sh
NOTCH_PENDING_ACTION_TIMEOUT_MS=1200 \
NOTCH_PENDING_ACTION_SWEEP_INTERVAL_MS=200 \
  npm run serve -w @notch-ai-monitor/local-manager-api

npx notch-local-manager-api \
  --host 127.0.0.1 \
  --port 4317 \
  --pending-action-timeout-ms 1200 \
  --pending-action-sweep-interval-ms 200
```

说明：

- `pendingActionTimeoutMs` / `NOTCH_PENDING_ACTION_TIMEOUT_MS` / `--pending-action-timeout-ms` 是 dev/test opt-in，用于缩短 pending action deadline，方便 beta smoke 和 deterministic QA。
- unset 时仍使用 Manager 默认 5 分钟；`0` 会关闭 pending action timeout deadline。
- 该配置只影响 Manager 写入 `expiresAt` 的时间，不新增 action endpoint，不触发 retry/terminate，不调用 supervisor，不让 Desktop 获得任何新的进程控制能力。
- 可重复真实链路 QA 使用 `npm run smoke:real-link`：脚本会启动临时 Local Manager API、启用短 timeout + scheduler，并用 real CLI adapter / `notch-run` 验证 completion 与 timeout projection。

## 3. Endpoints

### `GET /health`

返回服务状态。

响应：

```json
{
  "ok": true,
  "status": "ok",
  "service": "local-manager-api",
  "protocol": "notch-ai-monitor",
  "version": 1
}
```

### `GET /v1/snapshot`

返回当前 manager snapshot。

响应：

```json
{
  "ok": true,
  "snapshot": {
    "sessions": [],
    "events": [],
    "activeEventIds": [],
    "currentEventId": null,
    "counts": {
      "sessions": 0,
      "activeSessions": 0,
      "activeEvents": 0
    },
    "viewHints": {
      "mood": "none",
      "restingState": "dormant",
      "shouldAutoPeek": false
    }
  }
}
```

P2 event history / pending action visibility 合同见 `docs/contracts/event-history-pending-actions-p2.md`。当前 runtime 已实现首个只读 projection 切片，由 Manager 在 snapshot 中提供：

```ts
interface ManagerSnapshot {
  pendingActions?: PendingActionRecord[];
  historySummary?: {
    totalEvents: number;
    resolvedEvents: number;
    ignoredEvents: number;
    expiredEvents: number;
    failedActions: number;
    inProgressActions: number;
  };
}
```

这些 projection 只能由 Manager 从 event lifecycle、action result/replay、P2.4d async completion 和内部 audit 派生。Desktop 不读取 process persistence、action audit、control registry 或 raw adapter token。

### `GET /v1/event-history`

P2 read-only event history endpoint。

推荐 query：

```http
GET /v1/event-history?sessionId=&status=&type=&cursor=&limit=
```

响应必须返回 Manager projection，而不是持久化文件原文：

```ts
interface PaginatedEventHistoryResponse {
  ok: true;
  history: EventHistoryRecord[];
  timeline?: EventTimelineEntry[];
  nextCursor: string | null;
  snapshot: ManagerSnapshot;
}
```

约束：

- 只读，不触发 retry、terminate、view-log 或任何 process side effect。
- 必须支持分页；Desktop 不应一次拉取无限历史。
- history 可包含 active/resolved/ignored/expired 事件，但 active queue 仍以 `snapshot.activeEventIds` 为真值。
- timeline 中不得暴露 raw control endpoint、bearer token、supervisor token 或 process persistence file path。

### `GET /v1/action-requests`

P2 read-only pending action visibility endpoint。

推荐 query：

```http
GET /v1/action-requests?sessionId=&eventId=&status=&cursor=&limit=
```

响应：

```ts
interface ActionRequestsResponse {
  ok: true;
  actions: PendingActionRecord[];
  nextCursor: string | null;
  snapshot: ManagerSnapshot;
}
```

约束：

- `accepted` action 在 UI projection 中显示为 `in_progress`，直到 P2.4d completion 写成 `completed` 或 `failed`。
- `needs_confirmation` 只表示等待用户确认，不表示 side effect 已执行。
- 同一 `requestId` replay 只能更新同一条 visible action record，不能生成重复 pending action。
- 同一 `eventId + actionId` 的后续 confirmed / failed / completed / rejected / noop projection 会 supersede 旧的 `waiting_confirmation` projection，避免 Desktop 同时显示“等待确认”和“正在处理/已过期”。
- failed completion 必须对用户可见，但 event 默认保持 active，除非 Manager 有可靠完成证据。
- P2 timeout sweep 后 `expired` pending action 必须只作为只读状态展示；同 requestId replay result 为 `failed`，Desktop 不因此获得新的 retry/terminate 权限。

### `POST /v1/envelopes`

接受 `docs/contracts/event-protocol.md` 中的 protocol envelope。P1 支持：

- `notch.session.upserted`
- `notch.session.ended`
- `notch.event.created`
- `notch.action.requested`
- `notch.debug.injected`

基础 envelope：

```json
{
  "protocol": "notch-ai-monitor",
  "version": 1,
  "id": "msg_001",
  "event": "notch.event.created",
  "ts": "2026-06-06T12:00:00+08:00",
  "source": {
    "kind": "cli",
    "tool": "qwen",
    "sessionId": "sess_mock_cli_001",
    "sourceMode": "fixture"
  },
  "payload": {
    "event": {
      "id": "evt_confirm_001",
      "sessionId": "sess_mock_cli_001",
      "type": "confirm",
      "title": "需要确认",
      "summary": "Mock CLI 请求运行清理命令。",
      "source": "Terminal",
      "createdAt": "2026-06-06T12:00:00+08:00",
      "command": "rm -rf ~/Documents/xhs-drafts/* && git clean -fd"
    }
  }
}
```

成功响应：

```json
{
  "ok": true,
  "event": "notch.event.created",
  "result": {
    "event": {
      "id": "evt_risk_...",
      "type": "risk"
    }
  },
  "snapshot": {
    "currentEventId": "evt_risk_...",
    "viewHints": {
      "mood": "angry",
      "restingState": "peek",
      "shouldAutoPeek": true
    }
  }
}
```

说明：

- API 对 `notch.event.created` 调用 `MockLocalAgentManager.ingestEvent(...)`。
- 如果输入是 `type: "confirm"` 且 command 命中 P0 `RiskScanner`，manager 会把事件升级为 `type: "risk"`。
- `notch.action.requested` 会同步返回一个 `notch.action.result` envelope，`correlationId` 继承请求 envelope 的 `correlationId`，没有时使用 `payload.requestId`。
- P2.4d 中 `notch.session.ended` 还会桥接到本地 supervisor pending action registry：如果同一 session 有已 accepted 的 graceful terminate，Manager 会自动把原 active event resolve 为 `terminate_graceful_completed`。
- P1 action side effects 必须遵循 `docs/contracts/action-side-effects-p1.md`；本地 Manager 不直接执行真实进程控制。
- `notch.debug.injected` 支持 scenario：`idle`、`waiting`、`result`、`error`、`risk`、`all`。

### `POST /v1/process/registrations`

P2.4 内部登记入口。`cli-adapter-real` 的 `wrapper` / `notch-run` 在启动 child process 后调用该 endpoint，让 Manager 记录 retry launch profile 和 process ownership。它不属于 shared protocol envelope，也不由 Desktop 调用。

请求示例：

```json
{
  "sessionId": "sess_real_codex_cli_wrapper_001",
  "runId": "run_1234abcd",
  "adapterId": "cli-adapter-real:codex-cli",
  "cwd": "/Users/example/project",
  "command": "codex --version",
  "executable": "codex",
  "args": ["--version"],
  "launchProfileHash": "launch_1234abcd",
  "supervisorTokenHash": "supervisor_1234abcd",
  "commandHash": "cmd_1234abcd",
  "pid": 43172,
  "processStartedAt": "2026-06-08T12:00:00+08:00",
  "source": "Terminal",
  "capabilities": ["process.retry", "process.terminate"],
  "riskReplayMode": "required",
  "controlEndpoint": "http://127.0.0.1:54321/v1/control/terminate-gracefully",
  "controlToken": "opaque-one-runtime-token"
}
```

校验与行为：

- `sessionId` 必须已经通过 `notch.session.upserted` 存在于 Manager snapshot。
- 只接受 `sourceMode: "live"` 或 `sourceMode: "wrapper"` 的 session；真实 `retry` / `terminate` side effect 后续仍只会按 P2.2 合同校验 live session。
- Manager 写入 `registerRetryLaunchProfile(...)` 和 `registerProcessOwnership(...)`，并复用 P2.3 `ProcessPersistenceStore`。
- endpoint 只登记 metadata，不启动 retry、不终止进程、不读取文件。
- Desktop 不直接调用该 endpoint，也不直接读取持久化文件。
- P2.4b 中 `executable` 是真实 retry supervisor 的安全启动入口；`command` 仍只用于展示、审计和 risk replay。
- P2.4c 中 `controlEndpoint` / `controlToken` 是 wrapper/notch-run adapter 控制通道；`controlEndpoint` 必须是 `http://127.0.0.1/...`。
- `controlToken` 只进入 Local Manager API 的内存 supervisor registry，不进入 `ProcessPersistenceStore`，不返回给 Desktop。
- 通过 adapter control channel terminate 时，Manager 仍先做 P2.2 ownership/capability/confirmation 校验，然后向 adapter endpoint 发送 graceful stop request。
- P2.4d 中 adapter control endpoint 的 202/200 只表示 stop request 被接受；Manager 等待后续 `notch.session.ended` 才自动 resolve event。
- P2.4d 中 adapter control HTTP 4xx/5xx、`ok:false`、`status:"failed"` / `status:"rejected"` 或网络错误会写入 failed action result/audit，原 event 保持 active。

响应：

```json
{
  "ok": true,
  "event": "notch.process.registered",
  "result": {
    "registration": {
      "sessionId": "sess_real_codex_cli_wrapper_001",
      "runId": "run_1234abcd",
      "launchProfileHash": "launch_1234abcd",
      "commandHash": "cmd_1234abcd",
      "capabilities": ["process.retry", "process.terminate"]
    }
  },
  "snapshot": {}
}
```

### `POST /v1/debug/reset`

开发/验收入口，用于清空当前内存 manager 的 sessions 和 events，并广播新的空 snapshot。

```sh
curl -X POST http://127.0.0.1:4317/v1/debug/reset
```

响应：

```json
{
  "ok": true,
  "event": "notch.debug.reset",
  "snapshot": {
    "sessions": [],
    "events": [],
    "activeEventIds": [],
    "currentEventId": null
  }
}
```

该 endpoint 不走 protocol envelope，后续正式产品形态可替换为 Tauri IPC 或 dev-only 命令。

### `POST /v1/debug/expire-pending-actions`

开发/验收入口，用于显式触发 Manager-owned pending action timeout sweep。该 endpoint 只更新 event history / pending action projection 与同 `requestId` replay result，不触发 retry/terminate 真实 side effect，不读取 process persistence/control token，也不提供给 Desktop 作为产品功能。

internal scheduler 已实现，并调用同一个 Manager sweep method；debug endpoint 继续只作为 deterministic QA 工具。

请求体可为空；也可传入 `at` 覆盖 sweep 时间，便于测试。

```sh
curl -X POST http://127.0.0.1:4317/v1/debug/expire-pending-actions \
  -H 'Content-Type: application/json' \
  -d '{"at":"2026-06-06T12:05:01+08:00"}'
```

响应：

```json
{
  "ok": true,
  "event": "notch.debug.pending-actions.expired",
  "expiredActions": [],
  "snapshot": {}
}
```

输入校验：

- `at` 省略时使用 Manager 当前时钟。
- `at` 如提供，必须是非空且可解析的 ISO date string。
- 非 `POST` 方法返回 `405 method_not_allowed`。

### `GET /v1/events`

SSE stream。manager snapshot 更新时推送：

```text
event: notch.snapshot.updated
data: {"protocol":"notch-ai-monitor","version":1,"id":"api_msg_0001","event":"notch.snapshot.updated","ts":"2026-06-06T12:00:00+08:00","source":{"kind":"manager","name":"local-manager-api"},"payload":{"snapshot":{...}}}
```

UI 或测试应以 `data` 中的 `payload.snapshot` 为真值。

P2 internal scheduler 第一阶段仍复用该 SSE：pending action 自动过期后，Manager snapshot emission 会广播 `notch.snapshot.updated`。如果后续需要局部刷新 hint，再按 `docs/contracts/internal-scheduler-sse-p2.md` 设计新增 `notch.history.updated`。

## 4. JSON 错误

错误响应统一为：

```json
{
  "ok": false,
  "error": {
    "code": "invalid_envelope",
    "message": "Envelope event is required."
  }
}
```

常见状态码：

| 状态码 | 场景 |
| --- | --- |
| `400` | 空 body、非法 JSON、非法 envelope、非法 payload |
| `404` | 未知路径 |
| `405` | 已知路径使用了错误 method |
| `413` | JSON body 超过 1 MiB |
| `422` | envelope event 尚未支持 |
| `500` | API 内部错误 |

## 5. Mock CLI Sender

实现包：`@notch-ai-monitor/cli-adapter-mock`

构建：

```sh
npm run build -w @notch-ai-monitor/cli-adapter-mock
```

发送危险 confirm command：

```sh
npm run send -w @notch-ai-monitor/cli-adapter-mock -- risky-confirm --url http://127.0.0.1:4317
```

可用 scenario：

| scenario | 行为 |
| --- | --- |
| `session` | 只发送 `notch.session.upserted` |
| `confirm` | session upsert + 安全 confirm command |
| `risky-confirm` | session upsert + `rm -rf ~/Documents/xhs-drafts/* && git clean -fd` confirm command |
| `risk` | session upsert + 直接 risk 示例 |
| `result` | session upsert + result 示例 |
| `error` | session upsert + error 示例 |
| `all` | session upsert + confirm/risky-confirm/risk/result/error 示例 |

环境变量：

- `NOTCH_LOCAL_MANAGER_URL`：默认 sender 目标，默认 `http://127.0.0.1:4317`。

## 6. P1 测试入口

轻量 Node 测试：

```sh
npm test
```

单包测试：

```sh
npm run test -w @notch-ai-monitor/local-manager-api
npm run test -w @notch-ai-monitor/cli-adapter-mock
```

这些测试会启动临时 port `0` 的 HTTP server，并在测试结束后关闭，不依赖长期运行服务。
