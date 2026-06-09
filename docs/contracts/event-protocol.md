# Notch AI Monitor P0 事件协议契约

版本：v0.1  
日期：2026-06-06  
适用阶段：P0 技术 Spike  
目标：让 CLI/mock adapter、Local Agent Manager、UI、ActionRouter 使用同一套 TypeScript shape 和 JSON envelope。

## 1. 命名约定

P0 统一使用 `notch.*` 事件名：

- `notch.session.upserted`
- `notch.session.ended`
- `notch.event.created`
- `notch.event.updated`
- `notch.snapshot.updated`
- `notch.action.requested`
- `notch.action.result`
- `notch.debug.injected`

PRD 中出现的 `ai_monitor.event_created` 可作为历史别名，由 adapter 归一化成 `notch.event.created`。P0 业务代码不要同时分叉两套命名。

## 2. 基础 TypeScript 类型

```ts
export type ISODateTimeString = string;

export type ToolKind = "claude" | "codex" | "qwen" | "custom";
export type SourceMode = "mock" | "fixture" | "wrapper" | "scan" | "live";
export type SessionState =
  | "idle"
  | "running"
  | "waiting"
  | "blocked"
  | "completed"
  | "failed";

export type EventType = "risk" | "confirm" | "result" | "error";
export type EventStatus = "active" | "resolved" | "ignored" | "expired";
export type RiskLevel = "low" | "medium" | "high" | "critical";

export type ActionStyle = "primary" | "danger" | "secondary";
export type SideEffect =
  | "none"
  | "clipboard"
  | "process"
  | "filesystem"
  | "navigation";

export type Mood = "none" | "waiting" | "happy" | "sad" | "angry";
export type ShellState = "dormant" | "glance" | "peek" | "expanded";
export type PanelState = "none" | "sessions" | "action";
```

## 3. Protocol envelope

所有跨边界消息都使用 envelope。Transport 可以是 Tauri event、WebSocket、localhost JSON POST、stdin/stdout marker，但 payload shape 不变。

```ts
export interface ProtocolEnvelope<TEvent extends string, TPayload> {
  protocol: "notch-ai-monitor";
  version: 1;
  id: string;
  event: TEvent;
  ts: ISODateTimeString;
  source: ProtocolSource;
  correlationId?: string;
  payload: TPayload;
}

export interface ProtocolSource {
  kind: "cli" | "manager" | "ui" | "debug";
  tool?: ToolKind;
  sessionId?: string;
  processId?: number;
  name?: string;
  sourceMode?: SourceMode;
}
```

`correlationId` 用于把 `notch.action.requested` 和 `notch.action.result` 串起来。UI 发起 action 时必须提供 request id，manager 回包时写入同一个 `correlationId`。

`sourceMode` 描述 session 或 protocol source 的来源可信度：

| sourceMode | 含义 |
| --- | --- |
| `mock` | 内存 mock manager 生成 |
| `fixture` | fixture / demo / emit smoke 数据 |
| `wrapper` | 通过 adapter wrapper 包裹的 child process 输出 |
| `scan` | 进程扫描发现的 session |
| `live` | Notch 显式启动或接入的真实 CLI 会话 |

## 4. Entity shape

### 4.1 Session

```ts
export interface Session {
  id: string;
  tool: ToolKind;
  name: string;
  mark: string;
  source: string;
  sourceMode?: SourceMode;
  project?: string;
  cwd?: string;
  processId?: number;
  windowId?: string;
  tabId?: string;
  state: SessionState;
  since: ISODateTimeString;
  lastActiveAt?: ISODateTimeString;
  exitCode?: number;
  endReason?: string;
  muted: boolean;
}
```

P0 fixture 可以使用 `"since": "2026-06-06T11:42:00+08:00"` 这类 ISO 字符串。展示层需要“刚刚”“2 分钟前”时自行格式化。
`exitCode` / `endReason` 由 Manager 在 ingest `notch.session.ended` 时持久化；envelope payload 的 `reason` 对应 session 上的 `endReason`。
Real adapter 约定：普通非零退出使用 `reason: "exitCode:<code>"`，signal 结束使用 `reason: "signal:<signal>"`。

### 4.2 Evidence

```ts
export interface Evidence {
  reason: string;
  impact?: string;
  origin: string;
  rollback?: string;
  affectedPaths?: string[];
  riskLevel?: RiskLevel;
  logExcerpt?: string;
}
```

条件要求：

- `risk`、`confirm`、`error` 必须有 `evidence`。
- `risk` 必须有 `impact`、`rollback`、`riskLevel`。
- `error` 应尽量有 `logExcerpt`。

### 4.3 Action

```ts
export interface Action {
  id: string;
  label: string;
  style?: ActionStyle;
  resolves: boolean;
  requiresConfirm?: boolean;
  sideEffect: SideEffect;
  enabled: boolean;
  disabledReason?: string;
}
```

P0 默认 action id：

| event type | action id |
| --- | --- |
| `risk` | `reject`、`allow-once`、`locate`、`copy` |
| `confirm` | `approve`、`reject`、`locate`、`copy` |
| `result` | `open-result`、`mark-read`、`copy-summary`、`locate` |
| `error` | `retry`、`view-log`、`terminate`、`ignore` |

`allow-once` 和 `terminate` 在 P0 必须设置 `requiresConfirm: true`。

### 4.4 Event

```ts
export interface NotchEvent {
  id: string;
  sessionId: string;
  type: EventType;
  priority: number;
  status: EventStatus;
  title: string;
  summary: string;
  command?: string;
  commandHash?: string;
  source: string;
  createdAt: ISODateTimeString;
  updatedAt?: ISODateTimeString;
  evidence?: Evidence;
  reasons?: string[];
  actions: Action[];
  resolvedAt?: ISODateTimeString;
  resolution?: string;
  occurrenceCount?: number;
  errorKey?: string;
}
```

## 5. CLI -> Manager

### 5.1 Session upsert

```ts
export type SessionUpsertedEnvelope = ProtocolEnvelope<
  "notch.session.upserted",
  { session: Session }
>;
```

示例：

```json
{
  "protocol": "notch-ai-monitor",
  "version": 1,
  "id": "msg_001",
  "event": "notch.session.upserted",
  "ts": "2026-06-06T11:42:00+08:00",
  "source": { "kind": "cli", "tool": "qwen", "processId": 43120 },
  "payload": {
    "session": {
      "id": "sess_qwen_001",
      "tool": "qwen",
      "name": "Qwen CLI",
      "mark": "QW",
      "source": "Terminal",
      "project": "autoXhs",
      "cwd": "/Users/example/autoXhs",
      "processId": 43120,
      "state": "waiting",
      "since": "2026-06-06T11:42:00+08:00",
      "muted": false
    }
  }
}
```

### 5.2 Event created

```ts
export type EventCreatedEnvelope = ProtocolEnvelope<
  "notch.event.created",
  { event: NotchEvent }
>;
```

示例：

```json
{
  "protocol": "notch-ai-monitor",
  "version": 1,
  "id": "msg_002",
  "event": "notch.event.created",
  "ts": "2026-06-06T11:42:10+08:00",
  "source": { "kind": "cli", "tool": "qwen", "sessionId": "sess_qwen_001" },
  "payload": {
    "event": {
      "id": "evt_confirm_001",
      "sessionId": "sess_qwen_001",
      "type": "confirm",
      "priority": 80,
      "status": "active",
      "title": "需要确认",
      "summary": "Qwen 想运行草稿整理脚本。",
      "command": "python scripts/prepare_xhs_batch.py --drafts ./drafts --limit 6",
      "commandHash": "cmd_9c812f",
      "source": "Terminal · autoXhs",
      "createdAt": "2026-06-06T11:42:10+08:00",
      "evidence": {
        "reason": "命令会读取本地 drafts 目录并生成批处理输出。",
        "impact": "./drafts、./outputs/xhs-batch",
        "origin": "AI 生成，等待用户批准",
        "rollback": "输出目录可删除，不影响源文件"
      },
      "actions": [
        {
          "id": "approve",
          "label": "批准运行",
          "style": "primary",
          "resolves": true,
          "sideEffect": "process",
          "enabled": true
        },
        {
          "id": "reject",
          "label": "拒绝",
          "style": "secondary",
          "resolves": true,
          "sideEffect": "process",
          "enabled": true
        }
      ]
    }
  }
}
```

### 5.3 Session ended

```ts
export type SessionEndedEnvelope = ProtocolEnvelope<
  "notch.session.ended",
  {
    sessionId: string;
    state: Extract<SessionState, "completed" | "failed">;
    exitCode?: number;
    reason?: string;
  }
>;
```

Manager ingest 后会将 `exitCode` 写入 `Session.exitCode`，将 `reason` 写入 `Session.endReason`。
当前推荐 reason 格式：

- `exitCode:<code>`：child process 以非零退出码结束。
- `signal:<signal>`：child process 被 signal 结束。

## 6. Manager -> UI

### 6.1 Snapshot updated

Manager 每次 session、event、action result 变化后广播 snapshot。UI 以 snapshot 为真值重新渲染。

```ts
export interface ManagerSnapshot {
  sessions: Session[];
  events: NotchEvent[];
  activeEventIds: string[];
  currentEventId: string | null;
  counts: {
    sessions: number;
    activeSessions: number;
    activeEvents: number;
  };
  viewHints: {
    mood: Mood;
    restingState: Exclude<ShellState, "expanded">;
    shouldAutoPeek: boolean;
  };
}

export type SnapshotUpdatedEnvelope = ProtocolEnvelope<
  "notch.snapshot.updated",
  { snapshot: ManagerSnapshot }
>;
```

`currentEventId` 是 manager 按队列规则算出的最高优先级事件。UI 可以因用户分页临时选择其他 event，但当该 event 不再 active 时必须回落到 snapshot 的 `currentEventId`。

### 6.2 Event updated

```ts
export type EventUpdatedEnvelope = ProtocolEnvelope<
  "notch.event.updated",
  {
    eventId: string;
    patch: Partial<Pick<NotchEvent, "status" | "updatedAt" | "resolvedAt" | "resolution" | "occurrenceCount">>;
    nextEventId: string | null;
  }
>;
```

P0 可以只发 snapshot，不单独发 event updated。若两者都发，UI 以最新 snapshot 为准。

## 7. UI -> Manager

### 7.1 Action requested

```ts
export interface ActionRequestPayload {
  requestId: string;
  eventId: string;
  actionId: string;
  confirmed?: boolean;
  input?: Record<string, unknown>;
  uiContext?: {
    selectedEventId?: string;
    panel?: PanelState;
  };
}

export type ActionRequestedEnvelope = ProtocolEnvelope<
  "notch.action.requested",
  ActionRequestPayload
>;
```

示例：

```json
{
  "protocol": "notch-ai-monitor",
  "version": 1,
  "id": "msg_ui_001",
  "event": "notch.action.requested",
  "ts": "2026-06-06T11:43:00+08:00",
  "source": { "kind": "ui", "name": "notch-ui" },
  "correlationId": "req_allow_once_001",
  "payload": {
    "requestId": "req_allow_once_001",
    "eventId": "evt_risk_001",
    "actionId": "allow-once",
    "confirmed": true,
    "uiContext": {
      "selectedEventId": "evt_risk_001",
      "panel": "action"
    }
  }
}
```

### 7.2 Debug injected

DebugHarness 可以注入 fixture，但正式入口不得暴露该能力。

```ts
export type DebugInjectedEnvelope = ProtocolEnvelope<
  "notch.debug.injected",
  {
    scenario: "idle" | "waiting" | "result" | "error" | "risk" | "all";
    sessions?: Session[];
    events?: NotchEvent[];
  }
>;
```

## 8. Action result

`notch.action.result` 由 Manager 发给 UI，也可由 Manager 回写给对应 CLI/mock adapter。
P1 action side effect 的安全边界见 `docs/contracts/action-side-effects-p1.md`。

```ts
export type ActionResultStatus =
  | "accepted"
  | "completed"
  | "failed"
  | "rejected"
  | "noop"
  | "needs_confirmation";

export interface ActionResultPayload {
  requestId: string;
  eventId: string;
  actionId: string;
  status: ActionResultStatus;
  message: string;
  resolution?: string;
  resolvedEventStatus?: EventStatus;
  nextEventId?: string | null;
  effects?: Array<{
    type: SideEffect;
    target?: string;
    mocked: boolean;
  }>;
  error?: {
    code: string;
    message: string;
  };
}

export type ActionResultEnvelope = ProtocolEnvelope<
  "notch.action.result",
  ActionResultPayload
>;
```

状态含义：

| status | 含义 | EventQueue 处理 |
| --- | --- | --- |
| `accepted` | manager 已接受请求，可能还会异步完成 | 不一定 resolve |
| `completed` | action 成功完成 | 如 action.resolves，则设为 `resolved` |
| `failed` | action 执行失败 | 保持 active，可生成 error |
| `rejected` | 请求不合法或 action 禁止执行 | 保持 active |
| `noop` | mock 或只反馈，不改变状态 | 保持 active |
| `needs_confirmation` | 缺少二次确认 | 保持 active，UI 展示确认 |

示例：

```json
{
  "protocol": "notch-ai-monitor",
  "version": 1,
  "id": "msg_mgr_010",
  "event": "notch.action.result",
  "ts": "2026-06-06T11:43:01+08:00",
  "source": { "kind": "manager", "name": "local-agent-manager" },
  "correlationId": "req_allow_once_001",
  "payload": {
    "requestId": "req_allow_once_001",
    "eventId": "evt_risk_001",
    "actionId": "allow-once",
    "status": "completed",
    "message": "已允许本次执行",
    "resolution": "允许一次",
    "resolvedEventStatus": "resolved",
    "nextEventId": "evt_confirm_001",
    "effects": [
      {
        "type": "process",
        "target": "sess_qwen_001",
        "mocked": true
      }
    ]
  }
}
```

## 9. Priority 和 view hint 规则

```ts
export const DEFAULT_EVENT_PRIORITY: Record<EventType, number> = {
  risk: 100,
  confirm: 80,
  error: 70,
  result: 55,
};

export const MOOD_BY_EVENT_TYPE: Record<EventType, Mood> = {
  risk: "angry",
  confirm: "waiting",
  result: "happy",
  error: "sad",
};
```

派生规则：

```ts
export function moodForEvent(event: NotchEvent | null): Mood {
  if (!event) return "none";
  return MOOD_BY_EVENT_TYPE[event.type];
}

export function restingStateForMood(mood: Mood): Exclude<ShellState, "expanded"> {
  if (mood === "none") return "dormant";
  if (mood === "angry") return "peek";
  return "glance";
}
```

## 10. P0 normalization rules

Manager 接收外部 event 时必须补齐：

- `status` 默认 `active`。
- `priority` 缺失时按 type 默认值。
- `actions` 缺失时按 type 补默认动作。
- `createdAt` 缺失时用 manager 当前时间。
- `commandHash` 缺失且有 `command` 时生成稳定 hash。
- `risk` 缺 `riskLevel` 时不得允许 `allow-once` enabled。
- action 缺 `sideEffect` 时按 action id 补默认 sideEffect。
- action 缺 `enabled` 时默认为 `true`。

## 11. Transport 建议

P0 transport 优先级：

1. Tauri command/event，适合桌面 spike。
2. WebSocket，适合 Web UI + mock manager。
3. localhost JSON POST，适合最小 mock server。
4. stdin/stdout marker，适合未来 CLI adapter。

无论选择哪种 transport，都必须传 envelope，不直接传裸 payload。

## 12. 最小测试矩阵

| 场景 | 输入 | 期望 |
| --- | --- | --- |
| risk 注入 | `notch.event.created` type `risk` | snapshot current 为 risk，mood angry，resting peek |
| confirm 注入 | type `confirm` | priority 80，mood waiting，resting glance |
| result 注入 | type `result` | priority 55，mood happy，resting glance |
| error 注入 | type `error` | priority 70，mood sad，resting glance |
| 排序 | risk + confirm + error + result | current risk，activeEventIds 按优先级 |
| resolve | `notch.action.requested` resolves action | action result completed，event resolved，nextEventId 更新 |
| 缺二次确认 | `allow-once` confirmed false | action result needs_confirmation，event 保持 active |
| 无副作用 action | `copy` | action result noop，event 保持 active |
