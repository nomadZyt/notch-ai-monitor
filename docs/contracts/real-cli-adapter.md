# Notch AI Monitor P1.7 Real CLI Adapter Contract

日期：2026-06-07  
实现包：`@notch-ai-monitor/cli-adapter-real`  
阶段：P1.7 真实 CLI adapter wrapper + source mode + smoke presets + session lifecycle

## 1. 范围

`cli-adapter-real` 把真实来源的进程或输出文本翻译成 P0/P1 protocol envelope，并发送到 Local Manager API：

- `notch.session.upserted`
- `notch.session.ended`
- `notch.event.created`

目标是让 UI 继续只消费 Manager API 的 snapshot/SSE，不直接接触 CLI、app 或终端输出。

本阶段不做：

- 不执行 adapter 自行推断、分类或生成的命令；`wrapper` 只运行 `--` 后用户显式提供的 child command。
- 不注入 TTY、不 attach 已打开终端、不读取 shell 历史。
- 不写文件、不写剪贴板、不终止进程。
- 不修改 desktop 或 manager 的消费模型。

## 2. Source Profiles

| profile | tool | name | mark | source |
| --- | --- | --- | --- | --- |
| `codex-cli` | `codex` | `Codex CLI` | `CX` | `Terminal` |
| `claude-code-cli` | `claude` | `Claude Code CLI` | `CL` | `Terminal` |
| `qwen-cli` | `qwen` | `Qwen CLI` | `QW` | `Terminal` |
| `cursor-app` | `custom` | `Cursor` | `CU` | `Cursor App` |
| `codex-app` | `codex` | `Codex App` | `CX` | `Codex App` |
| `custom` | `custom` | `Custom CLI` | `AI` | `Terminal` |

`custom` 支持用 CLI 参数覆盖 `--name`、`--mark`、`--source`。

## 3. Source Mode

P1.4 起 session 和 protocol source 可以携带 `sourceMode`，用于让 UI 区分“演示/fixture 数据”和“真实接入数据”。

| mode | 默认来源 | UI 含义 |
| --- | --- | --- |
| `fixture` | `emit` | 测试/演示事件 |
| `scan` | `scan` | 只扫描到进程 session，尚未读取输出 |
| `wrapper` | `wrapper` | adapter 包裹 child process 的输出 |
| `live` | `stdin`、`notch-run` | 用户显式启动或接入的真实 CLI 输出 |
| `mock` | mock manager | 内存 mock |

所有 adapter modes 都支持显式覆盖：

```sh
npm run send -w @notch-ai-monitor/cli-adapter-real -- wrapper \
  --source-mode live \
  --profile claude-code-cli \
  -- claude --version
```

## 4. Parser Support Matrix

`stdin` 和 `wrapper` 逐行读取输出时调用 `createEventFromLine(line, session, profile)`。P1.3 起该函数使用 profile-aware parsing：先按 profile 尝试专项 parser，无法识别时再 fallback 到原有 generic classifier。

| profile | dedicated parser | supported signals | fallback |
| --- | --- | --- | --- |
| `codex-cli` | supported | proposed/suggested/run/executing/requesting approval command -> `confirm`; completed/done/result/success -> `result`; error/failed/exception/fatal -> `error` | generic classifier |
| `claude-code-cli` | supported | Bash/tool use/command needing approval/permission required/proceed prompt -> `confirm`; task completed/done/result ready/success -> `result`; error/failed/traceback/permission denied -> `error` | generic classifier |
| `qwen-cli` | deferred | first version only keeps profile, scan discovery, and generic fallback compatibility | generic classifier only |
| `cursor-app` | none | no app-specific parser in P1.3 | generic classifier only |
| `codex-app` | none | no app-specific parser in P1.3 | generic classifier only |
| `custom` | none | user-provided text only | generic classifier only |

公开分类接口：

- `classifyOutputLine(line)`：保持 P1.2 generic 行为兼容。
- `classifyOutputLineForProfile(line, profileOrId)`：P1.3 新增，按 profile 先走 Codex/Claude 专项 parser，再 fallback 到 generic。Qwen 暂不新增专项 parser。

## 5. Modes

默认 API 地址：

```sh
http://127.0.0.1:4317
```

也可以通过 `--url` 或 `NOTCH_LOCAL_MANAGER_URL` 指定。

### 5.1 scan

```sh
npm run send -w @notch-ai-monitor/cli-adapter-real -- scan --url http://127.0.0.1:4317
```

`scan` 调用 Node built-in `child_process.execFile` 执行 `ps -axo pid=,command=`，发现正在运行的 Cursor、Codex App、`codex`、`claude`、`qwen` 进程。每个命中的进程会生成一个 session，并发送 `notch.session.upserted`。

为了避免 Electron/Chromium helper 噪声污染 Session Hub，P1.1 只上报 Cursor/Codex App 的主进程；renderer、GPU、network service、crashpad、extension host、Codex `app-server` 等内部 helper 不会上报为独立 session。CLI profile 只匹配实际 `codex`、`claude`、`qwen` 命令进程。

限制：

- `scan` 只做 process/session discovery。
- 已打开终端窗口里的事件内容不会自动被读取。
- 要产生 `confirm`、`error`、`result` 事件，需要使用 `stdin`、`emit`、`wrapper`，或后续新增 TTY/tool hook。

### 5.2 stdin

```sh
some-real-tool 2>&1 | npm run send -w @notch-ai-monitor/cli-adapter-real -- stdin --profile codex-cli
```

启动后先发送 `notch.session.upserted`。随后逐行读取 stdin：

- 对 `codex-cli` / `claude-code-cli`，先使用专项 parser 识别代表性 CLI 输出。
- Qwen first version 只保留 `qwen-cli` profile、scan discovery 和 generic fallback，不做专项 parser。
- 高风险命令或待批准语义 -> `confirm`
- `error`、`failed`、`exception`、`traceback` 等 -> `error`
- `done`、`completed`、`success`、`result ready` 等 -> `result`
- 其他普通输出忽略

adapter 只读取文本并发 envelope，不执行 stdin 中的命令。

### 5.3 emit

```sh
npm run send -w @notch-ai-monitor/cli-adapter-real -- emit \
  --profile claude-code-cli \
  --type confirm \
  --command "rm -rf ./drafts && git clean -fd"
```

`emit` 用于测试和 demo。它会先发送 session upsert，再按参数发送一个 `notch.event.created`。

支持参数：

- `--profile codex-cli|claude-code-cli|qwen-cli|cursor-app|codex-app|custom`
- `--source-mode mock|fixture|wrapper|scan|live`
- `--type confirm|error|result|risk`
- `--command "<command>"`
- `--summary "<summary>"`
- `--title "<title>"`
- `--session-id "<id>"`
- `--cwd "<path>"`
- `--project "<name>"`
- `--pid <number>`

### 5.4 wrapper

```sh
npm run send -w @notch-ai-monitor/cli-adapter-real -- wrapper \
  --profile claude-code-cli \
  -- claude --version
```

显式指定 child process cwd：

```sh
npm run send -w @notch-ai-monitor/cli-adapter-real -- wrapper \
  --profile claude-code-cli \
  --cwd /Users/example/project \
  -- node -e "console.log('Result ready: generated report')"
```

`wrapper` 会先发送 `notch.session.upserted`，再用 Node built-in `child_process.spawn` 启动 `--` 后的 child command。`--` 后的所有参数都只属于 child process，不再由 adapter 解析。

运行行为：

- `--cwd <path>` 同时作为 child process cwd 和 session cwd；未传时使用 adapter 当前 cwd。
- `--stdio capture|inherit` 控制 child stdio；默认 `capture`。
- `capture`：child stdin 继承当前 terminal；stdout/stderr 由 adapter pipe 捕获、原样转发，并逐行调用 `createEventFromLine` / classifier。
- `inherit`：child stdin/stdout/stderr 全部继承当前 terminal，适合 `codex`/`claude` 这类交互式 CLI；adapter 不读取输出、不解析事件。
- P2.4 起，child process 启动后会向 Local Manager API `POST /v1/process/registrations` 登记 launch profile 和 process ownership。
- `capture` 模式解析到 `confirm`、`error`、`result` 时发送 `notch.event.created`。
- child 退出后发送 `notch.session.ended`，让 Manager snapshot 中 session state 变为 `completed` 或 `failed`。
- 普通非零退出会在 `notch.session.ended.payload.reason` 中写入 `exitCode:<code>`；signal 结束会写入 `signal:<signal>`。
- child 退出后 stdout 输出 wrapper summary JSON，包含 stdio mode、session id、cwd、child command、child pid、exit code、signal、process registration 摘要、发送事件类型和 manager response 摘要。
- 如果 child exit code 非 0，adapter 的 `process.exitCode` 设置为同样 code。

交互式 CLI 推荐：

```sh
npm run run -w @notch-ai-monitor/cli-adapter-real -- \
  --profile codex-cli \
  --stdio inherit \
  -- codex

npm run run -w @notch-ai-monitor/cli-adapter-real -- \
  --profile claude-code-cli \
  --stdio inherit \
  -- claude
```

P1.7 的 `inherit` 模式只负责真实 CLI 生命周期：session upsert、child process 运行、session ended。因为 adapter 不读取 inherited stdout/stderr，本模式不会自动生成 `notch.event.created`；要验证 UI event 闭环仍使用默认 `capture` smoke。

安全限制：

- child command 必须放在 `--` 后；没有 child command 会报错。
- adapter 不会执行 classifier 提取出的 command，也不会执行 manager/risk-policy 返回的 action。
- `spawn` 使用 `shell: false`，不会把 adapter 参数拼成 shell string。
- `wrapper` 不读取 shell history、不 attach 既有 TTY、不自动发现或接管已运行的 CLI。
- process registration 只登记 metadata，不执行 `retry` / `terminate`，也不让 Desktop 直接操作 child process。

### 5.5 notch-run

`notch-run` 是 P1.4 推荐的第一版真实 CLI 启动入口。它复用 `wrapper` 实现，但默认 `sourceMode` 为 `live`：

```sh
npm run run -w @notch-ai-monitor/cli-adapter-real -- \
  --profile codex-cli \
  -- codex
```

等价安装后的 bin：

```sh
notch-run --profile claude-code-cli -- claude
```

约束：

- `notch-run` 只启动 `--` 后显式传入的命令。
- 不 attach 已打开终端，不读取 shell history。
- 如果只是做 smoke fixture，请继续用 `wrapper` 或 `emit`，不要把演示输出标成 `live`。

### 5.6 notch-run-smoke

`notch-run-smoke` 是 P1.5 的可重复验收入口。它要求 Local Manager API 已运行。

默认 preset 是 `node-result`，用于验证完整 event 链路：

1. `GET /health`
2. `POST /v1/debug/reset`
3. `notch-run --source-mode live` 默认 child command
4. `GET /v1/snapshot`
5. 断言 snapshot 中存在 `sourceMode: "live"` 的 session 和 active event

根目录脚本：

```sh
npm run smoke:notch-run
```

P1.6 起新增低风险真实 CLI preset，用于验证本机真实 CLI 可被 wrapper 启动并登记为 `sourceMode: "live"` session：

```sh
npm run smoke:codex
npm run smoke:claude
```

这两个 preset 分别执行：

| preset | profile | child command | expect type |
| --- | --- | --- | --- |
| `node-result` | `codex-cli` | Node 输出 `Completed: notch-run live smoke` | `result` |
| `codex-version` | `codex-cli` | `codex --version` | `none` |
| `claude-version` | `claude-code-cli` | `claude --version` | `none` |

`codex-version` / `claude-version` 是 session-only smoke：版本号输出通常不包含 `completed/result/error/confirm` 等可解析事件信号，因此只断言 API snapshot 中存在 live session，不要求 active event。要验证 UI event 闭环，仍使用 `npm run smoke:notch-run`。

adapter 包内脚本：

```sh
npm run smoke:live -w @notch-ai-monitor/cli-adapter-real -- \
  --url http://127.0.0.1:4317 \
  --profile codex-cli
```

也可以传入真实 child command：

```sh
npm run smoke:live -w @notch-ai-monitor/cli-adapter-real -- \
  --url http://127.0.0.1:4317 \
  --profile claude-code-cli \
  --expect-type result \
  -- claude --version
```

参数：

- `--preset node-result|codex-version|claude-version`：默认 `node-result`
- `--url <manager-url>`：默认 `NOTCH_LOCAL_MANAGER_URL` 或 `http://127.0.0.1:4317`
- `--profile <profile>`：默认 `codex-cli`
- `--cwd <path>`：默认当前工作目录
- `--expect-type confirm|result|error|none`：默认由 preset 决定
- `--no-reset`：不先清空 manager snapshot

## 6. P2.4 Process Registration

`wrapper` / `notch-run` 在 `notch.session.upserted` 后启动 child process，并向 Local Manager API 内部 endpoint 登记：

```http
POST /v1/process/registrations
```

登记 payload 示例：

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

边界：

- 该 endpoint 不是 shared protocol envelope；Desktop 不调用。
- `executable + args` 是 P2.4b real retry supervisor 的安全启动输入；`command` 只是 launch profile 的展示/审计字符串，不由 Desktop 提供，也不会由 Manager 直接当 shell string 执行。
- `commandHash`、`launchProfileHash`、`runId`、`supervisorTokenHash` 由 adapter 按 child command、cwd、session、pid 和启动时间生成，用于后续目标回显和 ownership 校验。
- P2.4c 起，`wrapper` / `notch-run` 会绑定 `http://127.0.0.1:<random>/v1/control/terminate-gracefully`，并把 endpoint 与一次性 bearer token 登记给 Manager。
- raw `controlToken` 只用于本 runtime 的 Manager -> adapter control request；adapter 不把 token 输出到 summary。
- control request 必须同时匹配 token、session id、run id 和 launch profile hash，才会对 wrapper 自己持有的 child handle 发出 graceful stop request。
- 登记失败不会终止 child process；wrapper summary 会报告 `processRegistration.status: "failed"`。
- 登记成功只让 Manager 拥有后续 retry/graceful terminate 所需上下文；真实 side effect 仍必须经过 P2.2/P2.2b 的 Manager 校验、risk replay、确认和 supervisor 边界。

## 7. Envelope Shape

Session upsert payload 使用现有 `Session` shape：

```json
{
  "protocol": "notch-ai-monitor",
  "version": 1,
  "event": "notch.session.upserted",
  "source": {
    "kind": "cli",
    "tool": "claude",
    "sessionId": "sess_real_claude_code_cli_12345",
    "processId": 12345,
    "name": "Claude Code CLI",
    "sourceMode": "live"
  },
  "payload": {
    "session": {
      "id": "sess_real_claude_code_cli_12345",
      "tool": "claude",
      "name": "Claude Code CLI",
      "mark": "CL",
      "source": "Terminal",
      "sourceMode": "live",
      "state": "running",
      "muted": false
    }
  }
}
```

Event created payload 发送 manager 可 ingest 的 event input。adapter 会提供 `id`、`sessionId`、`type`、`title`、`summary`、`source`、`createdAt`，并按事件类型补充 `command` 或 `evidence`。manager 继续负责补齐 priority/status/actions，并由 risk-policy 升级危险 confirm。

Session ended payload 用于 child process 生命周期收尾：

```json
{
  "protocol": "notch-ai-monitor",
  "version": 1,
  "event": "notch.session.ended",
  "source": {
    "kind": "cli",
    "tool": "codex",
    "sessionId": "sess_real_codex_cli_wrapper_12345",
    "name": "Codex CLI",
    "sourceMode": "live"
  },
  "payload": {
    "sessionId": "sess_real_codex_cli_wrapper_12345",
    "state": "completed",
    "exitCode": 0
  }
}
```

Manager API 会将已有 session 更新为 `completed` 或 `failed`；如果 session 不存在，返回 `session_not_found`。
失败退出示例中，payload 会保持同一 shape，只增加已有可选字段：

```json
{
  "payload": {
    "sessionId": "sess_real_codex_cli_wrapper_12345",
    "state": "failed",
    "exitCode": 7,
    "reason": "exitCode:7"
  }
}
```

## 8. 后续接入点

P1.7 之后可继续扩展：

- TTY attach：对已打开终端建立可观察输出通道。
- 工具专用 hook：接入 Codex、Claude Code、Qwen 或 Cursor 的结构化事件来源。
- 更精细的命令提取：按工具输出格式提取 command、cwd、affected paths。
- Qwen 专项 parser：P1.3 first version 明确暂缓；后续如用户需要，再基于真实 fixture 增补。
