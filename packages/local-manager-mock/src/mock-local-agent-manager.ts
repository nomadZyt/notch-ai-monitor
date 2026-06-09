import { buildRiskEvent, type BuildRiskEventInput } from "@notch-ai-monitor/risk-policy";
import {
  DEFAULT_EVENT_PRIORITY,
  allEventsFixture,
  buildManagerSnapshot,
  confirmEventFixture,
  enqueueEvent,
  errorEventFixture,
  fixtureSessions,
  ignoreEvent,
  nextEventId,
  replaceEvents,
  resolveEvent,
  resultEventFixture,
  riskEventFixture,
} from "@notch-ai-monitor/shared";
import type {
  Action,
  ActionRequestPayload,
  ActionResultPayload,
  ActionStyle,
  EventStatus,
  EventHistoryRecord,
  EventHistorySummary,
  EventTimelineEntry,
  EventTimelineKind,
  EventType,
  ISODateTimeString,
  ManagerSnapshot,
  NotchEvent,
  PendingActionRecord,
  PendingActionVisibilityStatus,
  Session,
} from "@notch-ai-monitor/shared";

export type ManagerClock = () => ISODateTimeString;
export type ManagerSnapshotListener = (snapshot: ManagerSnapshot) => void;

export type LooseActionInput = Partial<Action> & {
  id: string;
  label?: string;
};

export type MockNotchEventInput = Partial<Omit<NotchEvent, "actions">> &
  Pick<NotchEvent, "sessionId" | "type"> & {
    actions?: LooseActionInput[];
  };

export interface MockLocalAgentManagerOptions {
  sessions?: readonly Session[];
  events?: readonly MockNotchEventInput[];
  clock?: ManagerClock;
  pendingActionTimeoutMs?: number | null;
  processSideEffectMode?: ProcessSideEffectMode;
  processPersistence?: ProcessPersistenceStore;
  eventHistoryPersistence?: EventHistoryPersistenceStore;
  processOwnership?: readonly ProcessOwnershipInput[];
  retryLaunchProfiles?: readonly RetryLaunchProfileInput[];
  processSupervisor?: ProcessSupervisor;
}

type ActionTemplate = Action & {
  style: ActionStyle;
};

export type ProcessSideEffectMode = "mock" | "supervised";
export type ProcessActionId = "retry" | "terminate";
export type ProcessCapability = "process.retry" | "process.terminate";
export type ProcessAuditSource = "desktop-ui" | "api" | "smoke";
export type RiskReplayMode = "required" | "approved";
export type RetryRiskReplayDecision = "passed" | "blocked" | "approved_skip";

export interface RetryRiskReplayRecord {
  requestId: string;
  eventId: string;
  sessionId: string;
  launchProfileHash: string;
  commandHash: string;
  decision: RetryRiskReplayDecision;
  replayedAt: ISODateTimeString;
  riskEventId?: string;
  riskLevel?: string;
  message: string;
}

export interface ProcessPersistenceSnapshot {
  processActionAudit: readonly ProcessActionAuditRecord[];
  processOwnership: readonly ProcessOwnershipRecord[];
  retryLaunchProfiles: readonly RetryLaunchProfileRecord[];
  retryRiskReplays: readonly RetryRiskReplayRecord[];
}

export interface ProcessPersistenceStore {
  load(): ProcessPersistenceSnapshot | null | undefined;
  save(snapshot: ProcessPersistenceSnapshot): void;
}

export interface EventHistoryPersistenceSnapshot {
  events: readonly EventHistoryRecord[];
  timeline: readonly EventTimelineEntry[];
  pendingActions: readonly PendingActionRecord[];
  cursorVersion: number;
}

export interface EventHistoryPersistenceStore {
  load(): EventHistoryPersistenceSnapshot | null | undefined;
  save(snapshot: EventHistoryPersistenceSnapshot): void;
}

export interface EventHistoryQuery {
  sessionId?: string;
  status?: EventStatus;
  type?: EventType;
  cursor?: string;
  limit?: number;
}

export interface ActionRequestsQuery {
  sessionId?: string;
  eventId?: string;
  status?: PendingActionVisibilityStatus;
  cursor?: string;
  limit?: number;
}

export interface EventHistoryPage {
  history: EventHistoryRecord[];
  timeline: EventTimelineEntry[];
  nextCursor: string | null;
}

export interface ActionRequestsPage {
  actions: PendingActionRecord[];
  nextCursor: string | null;
}

export interface RetryLaunchProfileInput {
  sessionId: string;
  adapterId: string;
  cwd: string;
  command: string;
  launchProfileHash: string;
  source?: string;
  executable?: string;
  commandHash?: string;
  args?: readonly string[];
  envAllowlist?: readonly string[];
  capabilities?: readonly ProcessCapability[];
  riskReplayMode?: RiskReplayMode;
  active?: boolean;
  retryAttemptActive?: boolean;
}

export interface RetryLaunchProfileRecord extends RetryLaunchProfileInput {
  owner: "notch-manager";
  commandHash: string;
  active: boolean;
  retryAttemptActive: boolean;
  riskReplayMode: RiskReplayMode;
  capabilities: readonly ProcessCapability[];
}

export interface ProcessOwnershipInput {
  sessionId: string;
  runId: string;
  adapterId: string;
  cwd: string;
  launchProfileHash: string;
  supervisorTokenHash: string;
  pid?: number;
  processStartedAt?: ISODateTimeString;
  commandHash?: string;
  capabilities?: readonly ProcessCapability[];
  active?: boolean;
}

export interface ProcessOwnershipRecord extends ProcessOwnershipInput {
  sourceMode: "live";
  owner: "notch-manager";
  capabilities: readonly ProcessCapability[];
  active: boolean;
}

export interface ProcessActionAuditRecord {
  requestId: string;
  eventId: string;
  actionId: ProcessActionId;
  sessionId: string;
  source: ProcessAuditSource;
  requestedAt: ISODateTimeString;
  confirmedAt?: ISODateTimeString;
  decision: "accepted" | "completed" | "failed" | "rejected" | "needs_confirmation";
  reason?: string;
  process?: {
    runId: string;
    pid?: number;
    processStartedAt?: ISODateTimeString;
    cwd: string;
    launchProfileHash: string;
    supervisorTokenHash: string;
  };
  launchProfile?: {
    adapterId: string;
    cwd: string;
    launchProfileHash: string;
    commandHash: string;
    riskReplayMode: RiskReplayMode;
  };
  resultMessage: string;
  errorCode?: string;
}

export type ProcessActionCompletionStatus = Extract<ProcessSupervisorStatus, "completed" | "failed">;

export interface ProcessActionCompletionInput {
  requestId?: string;
  eventId?: string;
  sessionId: string;
  actionId: ProcessActionId;
  status: ProcessActionCompletionStatus;
  message: string;
  completedAt?: ISODateTimeString;
  target?: string;
  resolution?: string;
  reason?: string;
  errorCode?: string;
}

export interface PendingActionHeartbeatInput {
  requestId: string;
  at?: ISODateTimeString;
  timeoutMs?: number;
  message?: string;
}

export interface PendingActionExpirationInput {
  at?: ISODateTimeString;
}

export type ProcessSupervisorStatus = "accepted" | "completed" | "failed";

export interface ProcessSupervisorResult {
  status: ProcessSupervisorStatus;
  message: string;
  target?: string;
  session?: Session;
  processOwnership?: ProcessOwnershipInput;
  retryLaunchProfile?: RetryLaunchProfileInput;
  endSession?: {
    state: Extract<Session["state"], "completed" | "failed">;
    exitCode?: number;
    endReason?: string;
  };
  error?: {
    code: string;
    message: string;
  };
}

export interface RetrySupervisorRequest {
  requestId: string;
  event: NotchEvent;
  session: Session;
  launchProfile: RetryLaunchProfileRecord;
  actionId: "retry";
  input?: Record<string, unknown>;
  requestedAt: ISODateTimeString;
}

export interface ProcessSupervisorRequest {
  requestId: string;
  event: NotchEvent;
  session: Session;
  ownership: ProcessOwnershipRecord;
  actionId: ProcessActionId;
  confirmed: true;
  input?: Record<string, unknown>;
  requestedAt: ISODateTimeString;
}

export interface ProcessSupervisor {
  startRetry?(request: RetrySupervisorRequest): ProcessSupervisorResult;
  terminateGracefully(request: ProcessSupervisorRequest): ProcessSupervisorResult;
}

export const DEFAULT_PENDING_ACTION_TIMEOUT_MS = 5 * 60 * 1000;

export const DEFAULT_ACTIONS_BY_EVENT_TYPE = {
  risk: [
    {
      id: "reject",
      label: "拒绝执行",
      style: "danger",
      resolves: true,
      sideEffect: "process",
      enabled: true,
    },
    {
      id: "allow-once",
      label: "允许一次",
      style: "primary",
      resolves: true,
      requiresConfirm: true,
      sideEffect: "process",
      enabled: true,
    },
    {
      id: "locate",
      label: "定位终端",
      style: "secondary",
      resolves: false,
      sideEffect: "navigation",
      enabled: true,
    },
    {
      id: "copy",
      label: "复制命令",
      style: "secondary",
      resolves: false,
      sideEffect: "clipboard",
      enabled: true,
    },
  ],
  confirm: [
    {
      id: "approve",
      label: "批准运行",
      style: "primary",
      resolves: true,
      sideEffect: "process",
      enabled: true,
    },
    {
      id: "reject",
      label: "拒绝",
      style: "secondary",
      resolves: true,
      sideEffect: "process",
      enabled: true,
    },
    {
      id: "locate",
      label: "定位终端",
      style: "secondary",
      resolves: false,
      sideEffect: "navigation",
      enabled: true,
    },
    {
      id: "copy",
      label: "复制命令",
      style: "secondary",
      resolves: false,
      sideEffect: "clipboard",
      enabled: true,
    },
  ],
  result: [
    {
      id: "open-result",
      label: "打开结果",
      style: "primary",
      resolves: true,
      sideEffect: "navigation",
      enabled: true,
    },
    {
      id: "mark-read",
      label: "标记已读",
      style: "secondary",
      resolves: true,
      sideEffect: "none",
      enabled: true,
    },
    {
      id: "copy-summary",
      label: "复制摘要",
      style: "secondary",
      resolves: false,
      sideEffect: "clipboard",
      enabled: true,
    },
    {
      id: "locate",
      label: "定位会话",
      style: "secondary",
      resolves: false,
      sideEffect: "navigation",
      enabled: true,
    },
  ],
  error: [
    {
      id: "retry",
      label: "重试",
      style: "primary",
      resolves: true,
      sideEffect: "process",
      enabled: true,
    },
    {
      id: "view-log",
      label: "查看日志",
      style: "secondary",
      resolves: false,
      sideEffect: "navigation",
      enabled: true,
    },
    {
      id: "terminate",
      label: "终止旧服务",
      style: "danger",
      resolves: true,
      requiresConfirm: true,
      sideEffect: "process",
      enabled: true,
    },
    {
      id: "ignore",
      label: "忽略",
      style: "secondary",
      resolves: true,
      sideEffect: "none",
      enabled: true,
    },
  ],
} satisfies Record<EventType, ActionTemplate[]>;

const DEFAULT_EVENT_TITLE: Record<EventType, string> = {
  risk: "已拦截危险命令",
  confirm: "需要确认",
  result: "结果已就绪",
  error: "运行失败",
};

const DEFAULT_EVENT_SUMMARY: Record<EventType, string> = {
  risk: "检测到需要人工处理的风险事件。",
  confirm: "本地 AI 会话正在等待确认。",
  result: "本地 AI 会话产生了可查看结果。",
  error: "本地 AI 会话报告了错误。",
};

const NOOP_ACTION_IDS = new Set(["copy", "copy-summary", "locate", "view-log"]);
const IGNORED_ACTION_IDS = new Set(["reject", "ignore"]);
const CONFIRMATION_ACTION_IDS = new Set(["allow-once", "terminate"]);
const LOG_FILE_EXTENSIONS = [".log", ".txt", ".out", ".err"];
const LOG_FILE_NAMES = new Set(["stdout", "stderr", "output"]);

const FALLBACK_ACTION_DEFAULTS = {
  id: "unknown",
  label: "执行动作",
  style: "secondary",
  resolves: false,
  sideEffect: "none",
  enabled: true,
} satisfies ActionTemplate;

function defaultClock(): ISODateTimeString {
  return new Date().toISOString();
}

export function stableCommandHash(command: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < command.length; index += 1) {
    hash ^= command.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `cmd_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function cloneSession(session: Session): Session {
  return { ...session };
}

function cloneAction(action: Action): Action {
  return { ...action };
}

function cloneActionResult(result: ActionResultPayload): ActionResultPayload {
  return {
    ...result,
    ...(result.effects ? { effects: result.effects.map((effect) => ({ ...effect })) } : {}),
    ...(result.error ? { error: { ...result.error } } : {}),
  };
}

function cloneEvent(event: NotchEvent): NotchEvent {
  return {
    ...event,
    actions: event.actions.map(cloneAction),
    ...(event.evidence
      ? {
          evidence: {
            ...event.evidence,
            ...(event.evidence.affectedPaths
              ? { affectedPaths: [...event.evidence.affectedPaths] }
              : {}),
          },
        }
      : {}),
    ...(event.reasons ? { reasons: [...event.reasons] } : {}),
  };
}

function cloneProcessOwnership(record: ProcessOwnershipRecord): ProcessOwnershipRecord {
  return {
    ...record,
    capabilities: [...record.capabilities],
  };
}

function cloneRetryLaunchProfile(record: RetryLaunchProfileRecord): RetryLaunchProfileRecord {
  return {
    ...record,
    ...(record.args ? { args: [...record.args] } : {}),
    ...(record.envAllowlist ? { envAllowlist: [...record.envAllowlist] } : {}),
    capabilities: [...record.capabilities],
  };
}

function cloneProcessAudit(record: ProcessActionAuditRecord): ProcessActionAuditRecord {
  return {
    ...record,
    ...(record.confirmedAt ? { confirmedAt: record.confirmedAt } : {}),
    ...(record.reason ? { reason: record.reason } : {}),
    ...(record.errorCode ? { errorCode: record.errorCode } : {}),
    ...(record.process
      ? {
          process: {
            ...record.process,
          },
        }
      : {}),
    ...(record.launchProfile
      ? {
          launchProfile: {
            ...record.launchProfile,
          },
        }
      : {}),
  };
}

function cloneRetryRiskReplay(record: RetryRiskReplayRecord): RetryRiskReplayRecord {
  return { ...record };
}

function cloneEventHistoryRecord(record: EventHistoryRecord): EventHistoryRecord {
  return {
    ...record,
    eventSnapshot: cloneEvent(record.eventSnapshot),
    ...(record.latestAction
      ? {
          latestAction: {
            ...record.latestAction,
          },
        }
      : {}),
  };
}

function cloneTimelineEntry(entry: EventTimelineEntry): EventTimelineEntry {
  return { ...entry };
}

function clonePendingAction(record: PendingActionRecord): PendingActionRecord {
  return { ...record };
}

function cloneProcessPersistenceSnapshot(
  snapshot: ProcessPersistenceSnapshot
): ProcessPersistenceSnapshot {
  return {
    processActionAudit: snapshot.processActionAudit.map(cloneProcessAudit),
    processOwnership: (snapshot.processOwnership ?? []).map(cloneProcessOwnership),
    retryLaunchProfiles: snapshot.retryLaunchProfiles.map(cloneRetryLaunchProfile),
    retryRiskReplays: snapshot.retryRiskReplays.map(cloneRetryRiskReplay),
  };
}

function cloneEventHistoryPersistenceSnapshot(
  snapshot: EventHistoryPersistenceSnapshot
): EventHistoryPersistenceSnapshot {
  return {
    events: snapshot.events.map(cloneEventHistoryRecord),
    timeline: snapshot.timeline.map(cloneTimelineEntry),
    pendingActions: snapshot.pendingActions.map(clonePendingAction),
    cursorVersion: snapshot.cursorVersion,
  };
}

function visibilityStatusFor(resultStatus: ActionResultPayload["status"]): PendingActionVisibilityStatus {
  switch (resultStatus) {
    case "needs_confirmation":
      return "waiting_confirmation";
    case "accepted":
      return "in_progress";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "rejected":
      return "rejected";
    case "noop":
      return "noop";
  }
}

function isTerminalActionVisibility(status: PendingActionVisibilityStatus): boolean {
  return ["completed", "failed", "rejected", "noop", "expired"].includes(status);
}

function paginationOffset(cursor: string | undefined): number {
  if (!cursor) return 0;
  const parsed = Number.parseInt(cursor, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function paginationLimit(limit: number | undefined, fallback = 50): number {
  if (limit === undefined) return fallback;
  if (!Number.isFinite(limit)) return fallback;
  return Math.max(1, Math.min(100, Math.trunc(limit)));
}

function paginate<T>(
  items: readonly T[],
  cursor: string | undefined,
  limit: number | undefined
): { items: T[]; nextCursor: string | null } {
  const offset = paginationOffset(cursor);
  const pageSize = paginationLimit(limit);
  const page = items.slice(offset, offset + pageSize);
  const nextOffset = offset + page.length;
  return {
    items: page,
    nextCursor: nextOffset < items.length ? String(nextOffset) : null,
  };
}

function timestampValue(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function isoPlusMilliseconds(value: ISODateTimeString, milliseconds: number): ISODateTimeString | undefined {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return undefined;
  return new Date(parsed + milliseconds).toISOString();
}

function normalizePendingActionTimeoutMs(value: number | null | undefined): number | null {
  if (value === null) return null;
  if (value === undefined) return DEFAULT_PENDING_ACTION_TIMEOUT_MS;
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.trunc(value);
}

function eventHistoryTimestamp(record: EventHistoryRecord): number {
  return timestampValue(record.updatedAt ?? record.resolvedAt ?? record.createdAt);
}

function pendingActionTimestamp(record: PendingActionRecord): number {
  return timestampValue(record.updatedAt ?? record.createdAt);
}

function actionDefaultsFor(eventType: EventType, actionId: string): ActionTemplate {
  const eventScoped = DEFAULT_ACTIONS_BY_EVENT_TYPE[eventType].find(
    (action) => action.id === actionId
  );
  if (eventScoped) return eventScoped;

  const anyScoped = Object.values(DEFAULT_ACTIONS_BY_EVENT_TYPE)
    .flat()
    .find((action) => action.id === actionId);
  if (anyScoped) return anyScoped;

  return {
    ...FALLBACK_ACTION_DEFAULTS,
    id: actionId,
    label: actionId,
  };
}

function actionForProjection(event: NotchEvent, actionId: string): Action {
  return event.actions.find((action) => action.id === actionId) ?? actionDefaultsFor(event.type, actionId);
}

function normalizeAction(
  actionInput: LooseActionInput,
  eventType: EventType,
  riskMissingRiskLevel: boolean
): Action {
  const defaults = actionDefaultsFor(eventType, actionInput.id);
  const requiresConfirm =
    actionInput.requiresConfirm ?? defaults.requiresConfirm ?? CONFIRMATION_ACTION_IDS.has(actionInput.id);
  const disabledByRisk = riskMissingRiskLevel && actionInput.id === "allow-once";
  const normalized: Action = {
    id: actionInput.id,
    label: actionInput.label ?? defaults.label,
    style: actionInput.style ?? defaults.style,
    resolves: actionInput.resolves ?? defaults.resolves,
    sideEffect: actionInput.sideEffect ?? defaults.sideEffect,
    enabled: disabledByRisk ? false : (actionInput.enabled ?? defaults.enabled ?? true),
  };

  if (requiresConfirm) normalized.requiresConfirm = true;

  const disabledReason =
    actionInput.disabledReason ??
    (disabledByRisk ? "riskLevel is required before allow-once can run" : undefined);
  if (disabledReason) normalized.disabledReason = disabledReason;

  return normalized;
}

function defaultActionsFor(eventType: EventType): LooseActionInput[] {
  return DEFAULT_ACTIONS_BY_EVENT_TYPE[eventType].map((action) => ({ ...action }));
}

function actionResolution(actionId: string): string {
  switch (actionId) {
    case "approve":
      return "approved";
    case "allow-once":
      return "allow_once";
    case "reject":
      return "rejected";
    case "ignore":
      return "ignored";
    case "mark-read":
      return "marked_read";
    case "open-result":
      return "opened_result";
    case "retry":
      return "retried";
    case "terminate":
      return "terminated";
    default:
      return actionId;
  }
}

function completedMessage(action: Action): string {
  switch (action.id) {
    case "approve":
      return "已模拟批准运行";
    case "allow-once":
      return "已模拟允许本次执行";
    case "reject":
      return "已模拟拒绝执行";
    case "ignore":
      return "已模拟忽略事件";
    case "mark-read":
      return "已模拟标记已读";
    case "open-result":
      return "已模拟打开结果";
    case "retry":
      return "已模拟重试";
    case "terminate":
      return "已模拟终止旧服务";
    default:
      return `已模拟完成动作：${action.label}`;
  }
}

function isSafeLogTarget(value: string): boolean {
  const target = value.trim();
  if (!target || target.length > 4096) return false;
  if (/[\0\r\n]/.test(target)) return false;
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(target)) return false;
  if (target.startsWith("~")) return false;

  const segments = target.split(/[\\/]+/).filter(Boolean);
  if (segments.length === 0 || segments.includes("..")) return false;

  const fileName = segments.at(-1)?.toLowerCase() ?? "";
  return LOG_FILE_NAMES.has(fileName) || LOG_FILE_EXTENSIONS.some((extension) => fileName.endsWith(extension));
}

function safeLogTargetFor(event: NotchEvent): string | null {
  for (const candidate of event.evidence?.affectedPaths ?? []) {
    if (isSafeLogTarget(candidate)) return candidate.trim();
  }
  return null;
}

function mockedEffects(action: Action, event: NotchEvent): NonNullable<ActionResultPayload["effects"]> {
  const effect: NonNullable<ActionResultPayload["effects"]>[number] = {
    type: action.sideEffect,
    mocked: true,
  };

  const target = action.sideEffect === "clipboard" ? event.command ?? event.summary : event.sessionId;
  if (target) effect.target = target;

  return [effect];
}

function viewLogResult(
  payload: ActionRequestPayload,
  event: NotchEvent,
  action: Action,
  nextEventIdValue: string | null
): ActionResultPayload {
  const safeTarget = safeLogTargetFor(event);
  if (safeTarget) {
    return {
      requestId: payload.requestId,
      eventId: payload.eventId,
      actionId: payload.actionId,
      status: "noop",
      message: `日志位置：${safeTarget}`,
      nextEventId: nextEventIdValue,
      effects: [
        {
          type: "filesystem",
          target: safeTarget,
          mocked: false,
        },
      ],
    };
  }

  if (event.evidence?.logExcerpt) {
    return {
      requestId: payload.requestId,
      eventId: payload.eventId,
      actionId: payload.actionId,
      status: "noop",
      message: "已展示日志摘录：见事件详情中的日志",
      nextEventId: nextEventIdValue,
      effects: [
        {
          type: "navigation",
          target: `event:${event.id}#logExcerpt`,
          mocked: true,
        },
      ],
    };
  }

  return {
    requestId: payload.requestId,
    eventId: payload.eventId,
    actionId: payload.actionId,
    status: "noop",
    message: "没有可查看的日志路径或摘录",
    nextEventId: nextEventIdValue,
    effects: mockedEffects(action, event),
  };
}

const DEFAULT_PROCESS_CAPABILITIES: readonly ProcessCapability[] = [
  "process.retry",
  "process.terminate",
];

function normalizeRetryLaunchProfile(input: RetryLaunchProfileInput): RetryLaunchProfileRecord {
  return {
    ...input,
    owner: "notch-manager",
    commandHash: input.commandHash ?? stableCommandHash(input.command),
    active: input.active ?? true,
    retryAttemptActive: input.retryAttemptActive ?? false,
    riskReplayMode: input.riskReplayMode ?? "required",
    capabilities: [...(input.capabilities ?? ["process.retry"])],
    ...(input.args ? { args: [...input.args] } : {}),
    ...(input.envAllowlist ? { envAllowlist: [...input.envAllowlist] } : {}),
  };
}

function normalizeProcessOwnership(input: ProcessOwnershipInput): ProcessOwnershipRecord {
  return {
    ...input,
    sourceMode: "live",
    owner: "notch-manager",
    active: input.active ?? true,
    capabilities: [...(input.capabilities ?? DEFAULT_PROCESS_CAPABILITIES)],
  };
}

function inputString(payload: ActionRequestPayload, key: string): string | undefined {
  const value = payload.input?.[key];
  return typeof value === "string" ? value : undefined;
}

function processAuditSource(payload: ActionRequestPayload): ProcessAuditSource {
  if (inputString(payload, "source") === "smoke") return "smoke";
  return payload.uiContext ? "desktop-ui" : "api";
}

function processAuditSnapshot(
  ownership: ProcessOwnershipRecord
): NonNullable<ProcessActionAuditRecord["process"]> {
  return {
    runId: ownership.runId,
    ...(ownership.pid !== undefined ? { pid: ownership.pid } : {}),
    ...(ownership.processStartedAt ? { processStartedAt: ownership.processStartedAt } : {}),
    cwd: ownership.cwd,
    launchProfileHash: ownership.launchProfileHash,
    supervisorTokenHash: ownership.supervisorTokenHash,
  };
}

function retryLaunchProfileAuditSnapshot(
  profile: RetryLaunchProfileRecord
): NonNullable<ProcessActionAuditRecord["launchProfile"]> {
  return {
    adapterId: profile.adapterId,
    cwd: profile.cwd,
    launchProfileHash: profile.launchProfileHash,
    commandHash: profile.commandHash,
    riskReplayMode: profile.riskReplayMode,
  };
}

function rejectedProcessResult(
  payload: ActionRequestPayload,
  event: NotchEvent,
  action: Action,
  nextEventIdValue: string | null,
  code: string,
  message: string
): ActionResultPayload {
  return {
    requestId: payload.requestId,
    eventId: payload.eventId,
    actionId: payload.actionId,
    status: "rejected",
    message,
    nextEventId: nextEventIdValue,
    effects: mockedEffects(action, event),
    error: {
      code,
      message,
    },
  };
}

function processOwnershipMismatch(
  payload: ActionRequestPayload,
  ownership: ProcessOwnershipRecord
): { code: string; message: string } | null {
  const expectedSessionId = inputString(payload, "expectedSessionId");
  if (expectedSessionId && expectedSessionId !== ownership.sessionId) {
    return {
      code: "process_ownership_mismatch",
      message: "确认目标与当前会话不匹配",
    };
  }

  const expectedRunId = inputString(payload, "expectedRunId");
  if (expectedRunId && expectedRunId !== ownership.runId) {
    return {
      code: "process_ownership_mismatch",
      message: "确认目标与当前运行不匹配",
    };
  }

  const expectedLaunchProfileHash = inputString(payload, "expectedLaunchProfileHash");
  if (expectedLaunchProfileHash && expectedLaunchProfileHash !== ownership.launchProfileHash) {
    return {
      code: "process_ownership_mismatch",
      message: "确认目标与当前启动配置不匹配",
    };
  }

  return null;
}

function retryLaunchProfileMismatch(
  payload: ActionRequestPayload,
  profile: RetryLaunchProfileRecord
): { code: string; message: string } | null {
  const expectedSessionId = inputString(payload, "expectedSessionId");
  if (expectedSessionId && expectedSessionId !== profile.sessionId) {
    return {
      code: "retry_launch_profile_mismatch",
      message: "重试目标与当前会话不匹配",
    };
  }

  const expectedLaunchProfileHash = inputString(payload, "expectedLaunchProfileHash");
  if (expectedLaunchProfileHash && expectedLaunchProfileHash !== profile.launchProfileHash) {
    return {
      code: "retry_launch_profile_mismatch",
      message: "重试目标与启动配置不匹配",
    };
  }

  return null;
}

function defaultProcessActionCompletionResolution(actionId: ProcessActionId): string {
  return actionId === "retry" ? "retry_started" : "terminate_graceful_completed";
}

function cloneSnapshot(snapshot: ManagerSnapshot): ManagerSnapshot {
  return {
    ...snapshot,
    sessions: snapshot.sessions.map(cloneSession),
    events: snapshot.events.map(cloneEvent),
    activeEventIds: [...snapshot.activeEventIds],
    counts: { ...snapshot.counts },
    viewHints: { ...snapshot.viewHints },
    ...(snapshot.pendingActions
      ? { pendingActions: snapshot.pendingActions.map(clonePendingAction) }
      : {}),
    ...(snapshot.historySummary ? { historySummary: { ...snapshot.historySummary } } : {}),
  };
}

export class MockLocalAgentManager {
  private readonly clock: ManagerClock;
  private readonly processSideEffectMode: ProcessSideEffectMode;
  private readonly processPersistence: ProcessPersistenceStore | undefined;
  private readonly eventHistoryPersistence: EventHistoryPersistenceStore | undefined;
  private readonly processSupervisor: ProcessSupervisor | undefined;
  private readonly pendingActionTimeoutMs: number | null;
  private readonly listeners = new Set<ManagerSnapshotListener>();
  private readonly processOwnership = new Map<string, ProcessOwnershipRecord>();
  private readonly retryLaunchProfiles = new Map<string, RetryLaunchProfileRecord>();
  private readonly processActionResults = new Map<string, ActionResultPayload>();
  private readonly processActionAudit: ProcessActionAuditRecord[] = [];
  private readonly retryRiskReplays: RetryRiskReplayRecord[] = [];
  private readonly eventHistory: EventHistoryRecord[] = [];
  private readonly eventTimeline: EventTimelineEntry[] = [];
  private readonly pendingActions: PendingActionRecord[] = [];
  private sessions = new Map<string, Session>();
  private events: NotchEvent[] = [];
  private generatedEventCount = 0;
  private eventHistoryCursorVersion = 0;

  constructor(options: MockLocalAgentManagerOptions = {}) {
    this.clock = options.clock ?? defaultClock;
    this.processSideEffectMode = options.processSideEffectMode ?? "mock";
    this.processPersistence = options.processPersistence;
    this.eventHistoryPersistence = options.eventHistoryPersistence;
    this.processSupervisor = options.processSupervisor;
    this.pendingActionTimeoutMs = normalizePendingActionTimeoutMs(options.pendingActionTimeoutMs);
    this.hydrateProcessPersistence();
    const hydratedEventHistory = this.hydrateEventHistoryPersistence();

    for (const session of options.sessions ?? []) {
      this.sessions.set(session.id, cloneSession(session));
    }

    for (const ownership of options.processOwnership ?? []) {
      this.registerProcessOwnership(ownership);
    }

    for (const profile of options.retryLaunchProfiles ?? []) {
      this.registerRetryLaunchProfile(profile);
    }

    if (options.events) {
      const normalized = options.events.map((event) => this.normalizeEvent(event));
      this.events = replaceEvents(normalized).events.map(cloneEvent);
      if (!hydratedEventHistory) {
        this.rebuildEventHistoryFromCurrentEvents("manager", "Initial event loaded");
      }
    }
  }

  registerProcessOwnership(input: ProcessOwnershipInput): ProcessOwnershipRecord {
    const record = normalizeProcessOwnership(input);
    this.processOwnership.set(record.sessionId, cloneProcessOwnership(record));
    this.persistProcessState();
    return cloneProcessOwnership(record);
  }

  getProcessOwnership(sessionId: string): ProcessOwnershipRecord | null {
    const record = this.processOwnership.get(sessionId);
    return record ? cloneProcessOwnership(record) : null;
  }

  registerRetryLaunchProfile(input: RetryLaunchProfileInput): RetryLaunchProfileRecord {
    const record = normalizeRetryLaunchProfile(input);
    this.retryLaunchProfiles.set(record.sessionId, cloneRetryLaunchProfile(record));
    this.persistProcessState();
    return cloneRetryLaunchProfile(record);
  }

  getRetryLaunchProfile(sessionId: string): RetryLaunchProfileRecord | null {
    const record = this.retryLaunchProfiles.get(sessionId);
    return record ? cloneRetryLaunchProfile(record) : null;
  }

  getProcessActionAuditRecords(): ProcessActionAuditRecord[] {
    return this.processActionAudit.map(cloneProcessAudit);
  }

  getRetryRiskReplayRecords(): RetryRiskReplayRecord[] {
    return this.retryRiskReplays.map(cloneRetryRiskReplay);
  }

  getEventHistory(query: EventHistoryQuery = {}): EventHistoryPage {
    const filtered = this.eventHistory
      .filter((record) => !query.sessionId || record.sessionId === query.sessionId)
      .filter((record) => !query.status || record.status === query.status)
      .filter((record) => !query.type || record.type === query.type)
      .sort((left, right) => {
        const timeDelta = eventHistoryTimestamp(right) - eventHistoryTimestamp(left);
        if (timeDelta !== 0) return timeDelta;
        return right.eventId.localeCompare(left.eventId);
      });
    const page = paginate(filtered, query.cursor, query.limit);
    const visibleEventIds = new Set(page.items.map((record) => record.eventId));
    const timeline = this.eventTimeline
      .filter((entry) => visibleEventIds.has(entry.eventId))
      .sort((left, right) => timestampValue(right.at) - timestampValue(left.at))
      .map(cloneTimelineEntry);

    return {
      history: page.items.map(cloneEventHistoryRecord),
      timeline,
      nextCursor: page.nextCursor,
    };
  }

  getPendingActions(query: ActionRequestsQuery = {}): ActionRequestsPage {
    const filtered = this.pendingActions
      .filter((record) => !query.sessionId || record.sessionId === query.sessionId)
      .filter((record) => !query.eventId || record.eventId === query.eventId)
      .filter((record) => !query.status || record.status === query.status)
      .sort((left, right) => {
        const timeDelta = pendingActionTimestamp(right) - pendingActionTimestamp(left);
        if (timeDelta !== 0) return timeDelta;
        return right.requestId.localeCompare(left.requestId);
      });
    const page = paginate(filtered, query.cursor, query.limit);

    return {
      actions: page.items.map(clonePendingAction),
      nextCursor: page.nextCursor,
    };
  }

  heartbeatPendingAction(input: PendingActionHeartbeatInput): PendingActionRecord | null {
    const index = this.pendingActions.findIndex(
      (record) => record.requestId === input.requestId && record.status === "in_progress"
    );
    if (index < 0) return null;

    const timeoutMs =
      input.timeoutMs !== undefined
        ? normalizePendingActionTimeoutMs(input.timeoutMs)
        : this.pendingActionTimeoutMs;
    if (timeoutMs === null) return null;

    const at = input.at ?? this.clock();
    const expiresAt = isoPlusMilliseconds(at, timeoutMs);
    if (!expiresAt) return null;

    const next: PendingActionRecord = {
      ...this.pendingActions[index],
      updatedAt: at,
      expiresAt,
      ...(input.message ? { message: input.message } : {}),
    };
    this.pendingActions[index] = next;
    this.persistEventHistoryState();
    this.emitSnapshot();
    return clonePendingAction(next);
  }

  expirePendingActions(input: PendingActionExpirationInput = {}): PendingActionRecord[] {
    const at = input.at ?? this.clock();
    const now = timestampValue(at);
    if (now <= 0) return [];

    const expired: PendingActionRecord[] = [];
    let processStateChanged = false;

    for (let index = 0; index < this.pendingActions.length; index += 1) {
      const record = this.pendingActions[index];
      if (record.status !== "in_progress" || !record.expiresAt) continue;
      const expiresAt = timestampValue(record.expiresAt);
      if (expiresAt <= 0 || expiresAt > now) continue;

      const event = this.events.find((item) => item.id === record.eventId);
      const message = "动作等待完成超时，尚未收到可信完成信号";
      const errorMessage = `${record.label} did not complete before ${record.expiresAt}`;
      const target = record.targetSummary ?? `session:${record.sessionId}#pending-action-timeout`;
      const next: PendingActionRecord = {
        ...record,
        status: "expired",
        resultStatus: "failed",
        message,
        updatedAt: at,
        completedAt: at,
        errorCode: "pending_action_timeout",
        errorMessage,
        targetSummary: target,
      };
      this.pendingActions[index] = next;
      expired.push(clonePendingAction(next));

      const result: ActionResultPayload = {
        requestId: record.requestId,
        eventId: record.eventId,
        actionId: record.actionId,
        status: "failed",
        message,
        nextEventId: nextEventId(this.events),
        effects: [
          {
            type: "process",
            target,
            mocked: record.mocked,
          },
        ],
        error: {
          code: "pending_action_timeout",
          message: errorMessage,
        },
      };
      this.processActionResults.set(record.requestId, cloneActionResult(result));

      if (event) {
        this.updateHistoryLatestAction(event, result, at);
        this.appendTimelineEntry({
          event,
          kind: "action_completed_async",
          at,
          source: record.source === "desktop-ui" ? "ui" : record.source === "smoke" ? "debug" : "manager",
          title: record.label,
          message,
          requestId: record.requestId,
          actionId: record.actionId,
          toStatus: "failed",
          errorCode: "pending_action_timeout",
          target,
        });
      }

      if (record.actionId === "retry" || record.actionId === "terminate") {
        const acceptedAudit = this.processActionAudit.find(
          (item) => item.requestId === record.requestId && item.decision === "accepted"
        );
        const hasTerminalAudit = this.processActionAudit.some(
          (item) =>
            item.requestId === record.requestId &&
            (item.decision === "completed" || item.decision === "failed")
        );
        if (acceptedAudit && !hasTerminalAudit) {
          this.processActionAudit.push({
            requestId: record.requestId,
            eventId: record.eventId,
            actionId: record.actionId,
            sessionId: record.sessionId,
            source: acceptedAudit.source,
            requestedAt: at,
            ...(acceptedAudit.confirmedAt ? { confirmedAt: acceptedAudit.confirmedAt } : {}),
            decision: "failed",
            reason: errorMessage,
            ...(acceptedAudit.process ? { process: { ...acceptedAudit.process } } : {}),
            ...(acceptedAudit.launchProfile ? { launchProfile: { ...acceptedAudit.launchProfile } } : {}),
            resultMessage: message,
            errorCode: "pending_action_timeout",
          });
          processStateChanged = true;
        }
      }
    }

    if (expired.length === 0) return [];
    if (processStateChanged) this.persistProcessState();
    this.persistEventHistoryState();
    this.emitSnapshot();
    return expired;
  }

  completeAcceptedProcessAction(input: ProcessActionCompletionInput): ActionResultPayload | null {
    const acceptedAudit = [...this.processActionAudit]
      .reverse()
      .find(
        (record) =>
          record.decision === "accepted" &&
          record.sessionId === input.sessionId &&
          record.actionId === input.actionId &&
          (!input.requestId || record.requestId === input.requestId) &&
          (!input.eventId || record.eventId === input.eventId)
      );
    if (!acceptedAudit) return null;

    const event = this.events.find((item) => item.id === acceptedAudit.eventId);
    if (!event) return null;

    const requestId = input.requestId ?? acceptedAudit.requestId;
    const existingPending = this.pendingActions.find(
      (record) =>
        record.requestId === requestId &&
        record.eventId === event.id &&
        record.sessionId === input.sessionId &&
        record.actionId === input.actionId
    );
    if (existingPending && isTerminalActionVisibility(existingPending.status)) {
      const replay = this.processActionResults.get(requestId);
      return replay ? cloneActionResult(replay) : null;
    }

    const completedAt = input.completedAt ?? this.clock();
    const resolution = input.resolution ?? defaultProcessActionCompletionResolution(input.actionId);
    let updateNextEventId = nextEventId(this.events);
    let resolvedEventStatus: EventStatus | undefined;

    if (input.status === "completed" && event.status === "active") {
      const update = resolveEvent(this.events, event.id, {
        at: completedAt,
        resolution,
      });
      this.events = update.events.map(cloneEvent);
      const updatedEvent = update.updatedEvent ?? this.events.find((item) => item.id === event.id);
      if (updatedEvent) {
        this.recordEventProjection({
          event: updatedEvent,
          kind: "event_status_changed",
          source: "manager",
          title: updatedEvent.title,
          message: input.message,
          fromStatus: event.status,
          toStatus: "resolved",
        });
      }
      updateNextEventId = update.nextEventId;
      resolvedEventStatus = "resolved";
    }

    const result: ActionResultPayload = {
      requestId,
      eventId: event.id,
      actionId: input.actionId,
      status: input.status,
      message: input.message,
      ...(input.status === "completed" ? { resolution } : {}),
      ...(resolvedEventStatus ? { resolvedEventStatus } : {}),
      nextEventId: updateNextEventId,
      effects: [
        {
          type: "process",
          target:
            input.target ??
            `session:${input.sessionId}#${
              input.status === "completed" ? resolution : `${input.actionId}-failed`
            }`,
          mocked: false,
        },
      ],
      ...(input.status === "failed"
        ? {
            error: {
              code: input.errorCode ?? "process_action_async_failed",
              message: input.reason ?? input.message,
            },
          }
        : {}),
    };

    this.processActionResults.set(requestId, cloneActionResult(result));
    const ownership = this.processOwnership.get(input.sessionId);
    this.processActionAudit.push({
      requestId,
      eventId: event.id,
      actionId: input.actionId,
      sessionId: input.sessionId,
      source: acceptedAudit.source,
      requestedAt: completedAt,
      ...(acceptedAudit.confirmedAt ? { confirmedAt: acceptedAudit.confirmedAt } : {}),
      decision: input.status,
      ...(input.reason ? { reason: input.reason } : {}),
      ...(ownership
        ? { process: processAuditSnapshot(ownership) }
        : acceptedAudit.process
          ? { process: { ...acceptedAudit.process } }
          : {}),
      ...(acceptedAudit.launchProfile ? { launchProfile: { ...acceptedAudit.launchProfile } } : {}),
      resultMessage: input.message,
      ...(input.errorCode ? { errorCode: input.errorCode } : {}),
    });
    this.persistProcessState();
    this.recordPendingActionResult({
      result,
      event: this.events.find((item) => item.id === event.id) ?? event,
      action: actionForProjection(event, input.actionId),
      source: acceptedAudit.source,
      at: completedAt,
      timelineKind: "action_completed_async",
    });
    this.emitSnapshot();
    return cloneActionResult(result);
  }

  upsertSession(session: Session): Session {
    const nextSession = cloneSession(session);
    this.sessions.set(nextSession.id, nextSession);
    this.emitSnapshot();
    return cloneSession(nextSession);
  }

  endSession(
    sessionId: string,
    state: Extract<Session["state"], "completed" | "failed">,
    metadata: { exitCode?: number; endReason?: string } = {}
  ): Session | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const nextSession: Session = {
      ...session,
      state,
      lastActiveAt: this.clock(),
    };
    if (metadata.exitCode !== undefined) nextSession.exitCode = metadata.exitCode;
    if (metadata.endReason) nextSession.endReason = metadata.endReason;
    this.sessions.set(sessionId, nextSession);
    for (const event of this.events.filter((item) => item.sessionId === sessionId)) {
      this.appendTimelineEntry({
        event,
        kind: "session_state_changed",
        source: "manager",
        title: nextSession.name,
        message: metadata.endReason ?? `Session ${state}`,
        fromStatus: session.state,
        toStatus: state,
      });
    }
    this.persistEventHistoryState();
    this.emitSnapshot();
    return cloneSession(nextSession);
  }

  ingestEvent(event: MockNotchEventInput): NotchEvent {
    const knownEventIds = new Set(this.events.map((item) => item.id));
    const normalized = this.normalizeEvent(event);
    const update = enqueueEvent(this.events, normalized);
    this.events = update.events.map(cloneEvent);
    const projectedEvent = update.updatedEvent ?? normalized;
    this.recordEventProjection({
      event: projectedEvent,
      kind: knownEventIds.has(projectedEvent.id) ? "event_updated" : "event_created",
      source: "cli",
      title: projectedEvent.title,
      message: knownEventIds.has(projectedEvent.id) ? "Event updated" : "Event created",
      toStatus: projectedEvent.status,
    });
    this.emitSnapshot();
    return cloneEvent(projectedEvent);
  }

  injectScenario(scenario: "idle" | "waiting" | "result" | "error" | "risk" | "all"): ManagerSnapshot {
    this.sessions = new Map(fixtureSessions.map((session) => [session.id, cloneSession(session)]));

    const scenarioEvents: readonly MockNotchEventInput[] =
      scenario === "idle"
        ? []
        : scenario === "waiting"
          ? [confirmEventFixture]
          : scenario === "result"
            ? [resultEventFixture]
            : scenario === "error"
              ? [errorEventFixture]
              : scenario === "risk"
                ? [riskEventFixture]
                : allEventsFixture;

    const normalized = scenarioEvents.map((event) => this.normalizeEvent(event));
    this.events = replaceEvents(normalized).events.map(cloneEvent);
    this.rebuildEventHistoryFromCurrentEvents("debug", `Debug scenario ${scenario}`);
    this.emitSnapshot();
    return this.getSnapshot();
  }

  reset(): ManagerSnapshot {
    this.sessions.clear();
    this.events = [];
    this.processOwnership.clear();
    this.retryLaunchProfiles.clear();
    this.processActionResults.clear();
    this.processActionAudit.length = 0;
    this.retryRiskReplays.length = 0;
    this.eventHistory.length = 0;
    this.eventTimeline.length = 0;
    this.pendingActions.length = 0;
    this.eventHistoryCursorVersion = 0;
    this.generatedEventCount = 0;
    this.persistProcessState();
    this.persistEventHistoryState();
    this.emitSnapshot();
    return this.getSnapshot();
  }

  private hydrateProcessPersistence(): void {
    const snapshot = this.processPersistence?.load();
    if (!snapshot) return;

    for (const ownership of snapshot.processOwnership ?? []) {
      const normalized = normalizeProcessOwnership(ownership);
      this.processOwnership.set(normalized.sessionId, cloneProcessOwnership(normalized));
    }

    for (const profile of snapshot.retryLaunchProfiles) {
      const normalized = normalizeRetryLaunchProfile(profile);
      this.retryLaunchProfiles.set(normalized.sessionId, cloneRetryLaunchProfile(normalized));
    }

    this.processActionAudit.push(...snapshot.processActionAudit.map(cloneProcessAudit));
    this.retryRiskReplays.push(...snapshot.retryRiskReplays.map(cloneRetryRiskReplay));
  }

  private hydrateEventHistoryPersistence(): boolean {
    const snapshot = this.eventHistoryPersistence?.load();
    if (!snapshot) return false;

    const cloned = cloneEventHistoryPersistenceSnapshot(snapshot);
    this.eventHistory.push(...cloned.events.map(cloneEventHistoryRecord));
    this.eventTimeline.push(...cloned.timeline.map(cloneTimelineEntry));
    this.pendingActions.push(...cloned.pendingActions.map(clonePendingAction));
    this.eventHistoryCursorVersion = cloned.cursorVersion;
    return true;
  }

  private processPersistenceSnapshot(): ProcessPersistenceSnapshot {
    return {
      processActionAudit: this.processActionAudit.map(cloneProcessAudit),
      processOwnership: [...this.processOwnership.values()].map(cloneProcessOwnership),
      retryLaunchProfiles: [...this.retryLaunchProfiles.values()].map(cloneRetryLaunchProfile),
      retryRiskReplays: this.retryRiskReplays.map(cloneRetryRiskReplay),
    };
  }

  private persistProcessState(): void {
    this.processPersistence?.save(this.processPersistenceSnapshot());
  }

  private eventHistoryPersistenceSnapshot(): EventHistoryPersistenceSnapshot {
    return {
      events: this.eventHistory.map(cloneEventHistoryRecord),
      timeline: this.eventTimeline.map(cloneTimelineEntry),
      pendingActions: this.pendingActions.map(clonePendingAction),
      cursorVersion: this.eventHistoryCursorVersion,
    };
  }

  private persistEventHistoryState(): void {
    this.eventHistoryPersistence?.save(this.eventHistoryPersistenceSnapshot());
  }

  private historySummary(): EventHistorySummary {
    return {
      totalEvents: this.eventHistory.length,
      resolvedEvents: this.eventHistory.filter((record) => record.status === "resolved").length,
      ignoredEvents: this.eventHistory.filter((record) => record.status === "ignored").length,
      expiredEvents: this.eventHistory.filter((record) => record.status === "expired").length,
      failedActions: this.pendingActions.filter((record) => record.status === "failed").length,
      inProgressActions: this.pendingActions.filter((record) => record.status === "in_progress").length,
    };
  }

  private nextTimelineId(kind: EventTimelineKind, eventId: string): string {
    this.eventHistoryCursorVersion += 1;
    return `timeline_${this.eventHistoryCursorVersion.toString().padStart(6, "0")}_${kind}_${eventId}`;
  }

  private upsertEventHistoryRecord(event: NotchEvent): void {
    const existingIndex = this.eventHistory.findIndex((record) => record.eventId === event.id);
    const existing = existingIndex >= 0 ? this.eventHistory[existingIndex] : undefined;
    const record: EventHistoryRecord = {
      historyId: existing?.historyId ?? event.id,
      eventId: event.id,
      sessionId: event.sessionId,
      type: event.type,
      status: event.status,
      title: event.title,
      summary: event.summary,
      priority: event.priority,
      source: event.source,
      createdAt: event.createdAt,
      ...(event.updatedAt ? { updatedAt: event.updatedAt } : {}),
      ...(event.resolvedAt ? { resolvedAt: event.resolvedAt } : {}),
      ...(event.resolution ? { resolution: event.resolution } : {}),
      ...(event.commandHash ? { commandHash: event.commandHash } : {}),
      ...(event.errorKey ? { errorKey: event.errorKey } : {}),
      ...(event.occurrenceCount !== undefined ? { occurrenceCount: event.occurrenceCount } : {}),
      eventSnapshot: cloneEvent(event),
      ...(existing?.latestAction ? { latestAction: { ...existing.latestAction } } : {}),
    };

    if (existingIndex >= 0) {
      this.eventHistory[existingIndex] = record;
    } else {
      this.eventHistory.push(record);
    }
  }

  private appendTimelineEntry(input: {
    event: NotchEvent;
    kind: EventTimelineKind;
    at?: ISODateTimeString;
    source: EventTimelineEntry["source"];
    title: string;
    message: string;
    requestId?: string;
    actionId?: string;
    fromStatus?: EventTimelineEntry["fromStatus"];
    toStatus?: EventTimelineEntry["toStatus"];
    errorCode?: string;
    target?: string;
  }): void {
    const at = input.at ?? this.clock();
    this.eventTimeline.push({
      id: this.nextTimelineId(input.kind, input.event.id),
      eventId: input.event.id,
      sessionId: input.event.sessionId,
      kind: input.kind,
      at,
      source: input.source,
      title: input.title,
      message: input.message,
      ...(input.requestId ? { requestId: input.requestId } : {}),
      ...(input.actionId ? { actionId: input.actionId } : {}),
      ...(input.fromStatus ? { fromStatus: input.fromStatus } : {}),
      ...(input.toStatus ? { toStatus: input.toStatus } : {}),
      ...(input.errorCode ? { errorCode: input.errorCode } : {}),
      ...(input.target ? { target: input.target } : {}),
    });
  }

  private recordEventProjection(input: {
    event: NotchEvent;
    kind: EventTimelineKind;
    source: EventTimelineEntry["source"];
    title: string;
    message: string;
    fromStatus?: EventTimelineEntry["fromStatus"];
    toStatus?: EventTimelineEntry["toStatus"];
  }): void {
    this.upsertEventHistoryRecord(input.event);
    this.appendTimelineEntry({
      event: input.event,
      kind: input.kind,
      source: input.source,
      title: input.title,
      message: input.message,
      ...(input.fromStatus ? { fromStatus: input.fromStatus } : {}),
      ...(input.toStatus ? { toStatus: input.toStatus } : {}),
    });
    this.persistEventHistoryState();
  }

  private rebuildEventHistoryFromCurrentEvents(
    source: EventTimelineEntry["source"],
    message: string
  ): void {
    this.eventHistory.length = 0;
    this.eventTimeline.length = 0;
    this.pendingActions.length = 0;
    this.eventHistoryCursorVersion = 0;
    for (const event of this.events) {
      this.upsertEventHistoryRecord(event);
      this.appendTimelineEntry({
        event,
        kind: "event_created",
        at: event.createdAt,
        source,
        title: event.title,
        message,
        toStatus: event.status,
      });
    }
    this.persistEventHistoryState();
  }

  private updateHistoryLatestAction(
    event: NotchEvent,
    result: ActionResultPayload,
    at: ISODateTimeString
  ): void {
    const historyIndex = this.eventHistory.findIndex((item) => item.eventId === event.id);
    if (historyIndex < 0) {
      this.upsertEventHistoryRecord(event);
      this.updateHistoryLatestAction(event, result, at);
      return;
    }

    this.eventHistory[historyIndex] = {
      ...this.eventHistory[historyIndex],
      latestAction: {
        requestId: result.requestId,
        actionId: result.actionId,
        status: result.status,
        message: result.message,
        updatedAt: at,
      },
    };
  }

  private recordPendingActionResult(input: {
    result: ActionResultPayload;
    event: NotchEvent;
    action: Action;
    source: ProcessAuditSource;
    at?: ISODateTimeString;
    timelineKind?: Extract<EventTimelineKind, "action_result" | "action_completed_async">;
  }): void {
    const at = input.at ?? this.clock();
    const status = visibilityStatusFor(input.result.status);
    if (status !== "waiting_confirmation") {
      this.removeSupersededWaitingConfirmation({
        eventId: input.event.id,
        actionId: input.action.id,
        requestId: input.result.requestId,
      });
    }
    const existingIndex = this.pendingActions.findIndex(
      (record) => record.requestId === input.result.requestId
    );
    const existing = existingIndex >= 0 ? this.pendingActions[existingIndex] : undefined;
    const target = input.result.effects?.find((effect) => effect.target)?.target;
    const expiresAt =
      status === "in_progress" && this.pendingActionTimeoutMs !== null
        ? isoPlusMilliseconds(at, this.pendingActionTimeoutMs)
        : undefined;
    const record: PendingActionRecord = {
      requestId: input.result.requestId,
      eventId: input.event.id,
      sessionId: input.event.sessionId,
      actionId: input.action.id,
      label: input.action.label,
      status,
      resultStatus: input.result.status,
      message: input.result.message,
      createdAt: existing?.createdAt ?? at,
      updatedAt: at,
      ...(isTerminalActionVisibility(status) ? { completedAt: at } : {}),
      ...(expiresAt ? { expiresAt } : {}),
      source: existing?.source ?? input.source,
      mocked: input.result.effects?.every((effect) => effect.mocked) ?? true,
      ...(input.result.resolution ? { resolution: input.result.resolution } : {}),
      ...(input.result.error?.code ? { errorCode: input.result.error.code } : {}),
      ...(input.result.error?.message ? { errorMessage: input.result.error.message } : {}),
      ...(target ? { targetSummary: target } : {}),
      ...(input.action.requiresConfirm ? { requiresConfirmation: true } : {}),
    };

    if (existingIndex >= 0) {
      this.pendingActions[existingIndex] = record;
    } else {
      this.pendingActions.push(record);
    }

    const historyIndex = this.eventHistory.findIndex((item) => item.eventId === input.event.id);
    if (historyIndex >= 0) {
      this.eventHistory[historyIndex] = {
        ...this.eventHistory[historyIndex],
        latestAction: {
          requestId: input.result.requestId,
          actionId: input.action.id,
          status: input.result.status,
          message: input.result.message,
          updatedAt: at,
        },
      };
    } else {
      this.upsertEventHistoryRecord(input.event);
      this.recordPendingActionResult(input);
      return;
    }

    this.appendTimelineEntry({
      event: input.event,
      kind: input.timelineKind ?? "action_result",
      at,
      source: input.source === "desktop-ui" ? "ui" : input.source === "smoke" ? "debug" : "manager",
      title: input.action.label,
      message: input.result.message,
      requestId: input.result.requestId,
      actionId: input.action.id,
      toStatus: input.result.status,
      ...(input.result.error?.code ? { errorCode: input.result.error.code } : {}),
      ...(target ? { target } : {}),
    });
    this.persistEventHistoryState();
  }

  private removeSupersededWaitingConfirmation(input: {
    eventId: string;
    actionId: string;
    requestId: string;
  }): void {
    for (let index = this.pendingActions.length - 1; index >= 0; index -= 1) {
      const record = this.pendingActions[index];
      if (
        record.status === "waiting_confirmation" &&
        record.eventId === input.eventId &&
        record.actionId === input.actionId &&
        record.requestId !== input.requestId
      ) {
        this.pendingActions.splice(index, 1);
      }
    }
  }

  private rememberProcessActionResult(result: ActionResultPayload): ActionResultPayload {
    this.processActionResults.set(result.requestId, cloneActionResult(result));
    const event = this.events.find((item) => item.id === result.eventId);
    if (event) {
      const action = actionForProjection(event, result.actionId);
      const audit = [...this.processActionAudit]
        .reverse()
        .find((record) => record.requestId === result.requestId);
      this.recordPendingActionResult({
        result,
        event,
        action,
        source: audit?.source ?? "api",
      });
    }
    return cloneActionResult(result);
  }

  private finalizeActionResult(
    payload: ActionRequestPayload,
    event: NotchEvent,
    action: Action,
    result: ActionResultPayload,
    options: { at?: ISODateTimeString } = {}
  ): ActionResultPayload {
    this.recordPendingActionResult({
      result,
      event: this.events.find((item) => item.id === event.id) ?? event,
      action,
      source: processAuditSource(payload),
      ...(options.at ? { at: options.at } : {}),
    });
    return cloneActionResult(result);
  }

  private recordProcessActionAudit(input: {
    payload: ActionRequestPayload;
    event: NotchEvent;
    actionId: ProcessActionId;
    decision: ProcessActionAuditRecord["decision"];
    message: string;
    ownership?: ProcessOwnershipRecord | null;
    launchProfile?: RetryLaunchProfileRecord | null;
    confirmedAt?: ISODateTimeString;
    reason?: string;
    errorCode?: string;
  }): void {
    this.processActionAudit.push({
      requestId: input.payload.requestId,
      eventId: input.payload.eventId,
      actionId: input.actionId,
      sessionId: input.event.sessionId,
      source: processAuditSource(input.payload),
      requestedAt: this.clock(),
      ...(input.confirmedAt ? { confirmedAt: input.confirmedAt } : {}),
      decision: input.decision,
      ...(input.reason ? { reason: input.reason } : {}),
      ...(input.ownership ? { process: processAuditSnapshot(input.ownership) } : {}),
      ...(input.launchProfile
        ? { launchProfile: retryLaunchProfileAuditSnapshot(input.launchProfile) }
        : {}),
      resultMessage: input.message,
      ...(input.errorCode ? { errorCode: input.errorCode } : {}),
    });
    this.persistProcessState();
  }

  private recordRetryRiskReplay(record: RetryRiskReplayRecord): void {
    this.retryRiskReplays.push(cloneRetryRiskReplay(record));
    this.persistProcessState();
  }

  private confirmationRequiredProcessResult(
    payload: ActionRequestPayload,
    event: NotchEvent,
    action: Action
  ): ActionResultPayload {
    const result: ActionResultPayload = {
      requestId: payload.requestId,
      eventId: payload.eventId,
      actionId: payload.actionId,
      status: "needs_confirmation",
      message: "该动作需要二次确认",
      nextEventId: nextEventId(this.events),
      effects: mockedEffects(action, event),
    };
    this.recordProcessActionAudit({
      payload,
      event,
      actionId: "terminate",
      decision: "needs_confirmation",
      message: result.message,
    });
    return this.rememberProcessActionResult(result);
  }

  private validateRetryLaunchProfile(
    payload: ActionRequestPayload,
    event: NotchEvent,
    action: Action,
    session: Session | undefined,
    profile: RetryLaunchProfileRecord | undefined
  ): ActionResultPayload | null {
    const nextEventIdValue = nextEventId(this.events);
    if (event.type !== "error") {
      return rejectedProcessResult(
        payload,
        event,
        action,
        nextEventIdValue,
        "retry_event_type_invalid",
        "只有错误事件可以重试"
      );
    }

    if (!session) {
      return rejectedProcessResult(
        payload,
        event,
        action,
        nextEventIdValue,
        "session_not_found",
        "会话不存在，无法重试"
      );
    }

    if (session.sourceMode !== "live") {
      return rejectedProcessResult(
        payload,
        event,
        action,
        nextEventIdValue,
        "retry_source_not_live",
        "只有 Manager 托管的 live 会话可以重试"
      );
    }

    if (!profile) {
      return rejectedProcessResult(
        payload,
        event,
        action,
        nextEventIdValue,
        "retry_launch_profile_not_found",
        "没有可审计的重试启动配置"
      );
    }

    if (profile.owner !== "notch-manager" || !profile.active) {
      return rejectedProcessResult(
        payload,
        event,
        action,
        nextEventIdValue,
        "retry_launch_profile_inactive",
        "重试启动配置不可用"
      );
    }

    if (profile.sessionId !== event.sessionId || profile.sessionId !== session.id) {
      return rejectedProcessResult(
        payload,
        event,
        action,
        nextEventIdValue,
        "retry_launch_profile_mismatch",
        "重试启动配置与事件会话不匹配"
      );
    }

    if (session.cwd && session.cwd !== profile.cwd) {
      return rejectedProcessResult(
        payload,
        event,
        action,
        nextEventIdValue,
        "retry_launch_profile_mismatch",
        "重试启动配置与会话目录不匹配"
      );
    }

    if (event.commandHash && event.commandHash !== profile.commandHash) {
      return rejectedProcessResult(
        payload,
        event,
        action,
        nextEventIdValue,
        "retry_launch_profile_mismatch",
        "重试启动配置与错误事件命令不匹配"
      );
    }

    if (!profile.capabilities.includes("process.retry")) {
      return rejectedProcessResult(
        payload,
        event,
        action,
        nextEventIdValue,
        "process_capability_unavailable",
        "当前启动配置不允许重试"
      );
    }

    if (profile.retryAttemptActive) {
      return rejectedProcessResult(
        payload,
        event,
        action,
        nextEventIdValue,
        "retry_attempt_already_active",
        "已有重试尝试正在运行"
      );
    }

    const inputMismatch = retryLaunchProfileMismatch(payload, profile);
    if (inputMismatch) {
      return rejectedProcessResult(
        payload,
        event,
        action,
        nextEventIdValue,
        inputMismatch.code,
        inputMismatch.message
      );
    }

    if (!this.processSupervisor?.startRetry) {
      return rejectedProcessResult(
        payload,
        event,
        action,
        nextEventIdValue,
        "retry_supervisor_unavailable",
        "没有可用的受控 retry supervisor"
      );
    }

    return null;
  }

  private replayRetryRiskPolicy(
    payload: ActionRequestPayload,
    event: NotchEvent,
    action: Action,
    profile: RetryLaunchProfileRecord
  ): ActionResultPayload | null {
    const replayedAt = this.clock();
    if (profile.riskReplayMode === "approved") {
      this.recordRetryRiskReplay({
        requestId: payload.requestId,
        eventId: event.id,
        sessionId: event.sessionId,
        launchProfileHash: profile.launchProfileHash,
        commandHash: profile.commandHash,
        decision: "approved_skip",
        replayedAt,
        message: "Retry risk replay skipped because profile is marked approved",
      });
      return null;
    }

    const riskEvent = buildRiskEvent({
      id: `evt_risk_retry_${profile.commandHash.slice("cmd_".length)}`,
      command: profile.command,
      commandHash: profile.commandHash,
      sessionId: event.sessionId,
      source: profile.source ?? event.source,
      createdAt: replayedAt,
      updatedAt: replayedAt,
      cwd: profile.cwd,
      origin: "Retry risk replay before supervised retry",
    });
    if (!riskEvent) {
      this.recordRetryRiskReplay({
        requestId: payload.requestId,
        eventId: event.id,
        sessionId: event.sessionId,
        launchProfileHash: profile.launchProfileHash,
        commandHash: profile.commandHash,
        decision: "passed",
        replayedAt,
        message: "Retry risk replay passed",
      });
      return null;
    }

    const update = enqueueEvent(this.events, riskEvent);
    this.events = update.events.map(cloneEvent);
    const projectedRiskEvent = update.updatedEvent ?? riskEvent;
    this.recordEventProjection({
      event: projectedRiskEvent,
      kind: "event_created",
      source: "manager",
      title: projectedRiskEvent.title,
      message: "Retry risk replay produced an active risk event",
      toStatus: projectedRiskEvent.status,
    });
    this.emitSnapshot();

    const error = {
      code: "retry_risk_replay_required",
      message: "Risk policy replay produced an active risk event before retry",
    };
    const result: ActionResultPayload = {
      requestId: payload.requestId,
      eventId: payload.eventId,
      actionId: payload.actionId,
      status: "rejected",
      message: "重试命令需要先处理风险确认",
      nextEventId: update.nextEventId,
      effects: [
        {
          type: "navigation",
          target: `event:${riskEvent.id}`,
          mocked: true,
        },
      ],
      error,
    };

    this.recordRetryRiskReplay({
      requestId: payload.requestId,
      eventId: event.id,
      sessionId: event.sessionId,
      launchProfileHash: profile.launchProfileHash,
      commandHash: profile.commandHash,
      decision: "blocked",
      replayedAt,
      riskEventId: riskEvent.id,
      ...(riskEvent.evidence?.riskLevel ? { riskLevel: riskEvent.evidence.riskLevel } : {}),
      message: result.message,
    });

    this.recordProcessActionAudit({
      payload,
      event,
      actionId: "retry",
      decision: "rejected",
      message: result.message,
      launchProfile: profile,
      reason: error.message,
      errorCode: error.code,
    });

    return this.rememberProcessActionResult(result);
  }

  private requestSupervisedRetry(
    payload: ActionRequestPayload,
    event: NotchEvent,
    action: Action
  ): ActionResultPayload {
    const session = this.sessions.get(event.sessionId);
    const profile = this.retryLaunchProfiles.get(event.sessionId);
    const rejected = this.validateRetryLaunchProfile(payload, event, action, session, profile);
    if (rejected) {
      this.recordProcessActionAudit({
        payload,
        event,
        actionId: "retry",
        decision: "rejected",
        message: rejected.message,
        ...(profile ? { launchProfile: profile } : {}),
        ...(rejected.error?.message ? { reason: rejected.error.message } : {}),
        ...(rejected.error?.code ? { errorCode: rejected.error.code } : {}),
      });
      return this.rememberProcessActionResult(rejected);
    }

    if (!session || !profile || !this.processSupervisor?.startRetry) {
      throw new Error("Supervised retry validation returned ok without required retry context");
    }

    const riskReplayResult = this.replayRetryRiskPolicy(payload, event, action, profile);
    if (riskReplayResult) return riskReplayResult;

    const requestedAt = this.clock();
    const supervisorResult = this.processSupervisor.startRetry({
      requestId: payload.requestId,
      event,
      session: cloneSession(session),
      launchProfile: cloneRetryLaunchProfile(profile),
      actionId: "retry",
      ...(payload.input ? { input: { ...payload.input } } : {}),
      requestedAt,
    });

    if (supervisorResult.session) {
      this.upsertSession(supervisorResult.session);
    }
    if (supervisorResult.retryLaunchProfile) {
      this.registerRetryLaunchProfile(supervisorResult.retryLaunchProfile);
    }
    if (supervisorResult.processOwnership) {
      this.registerProcessOwnership(supervisorResult.processOwnership);
    }

    const nextProfile = {
      ...profile,
      retryAttemptActive: supervisorResult.status === "accepted" || supervisorResult.status === "completed",
    };
    this.retryLaunchProfiles.set(profile.sessionId, cloneRetryLaunchProfile(nextProfile));
    this.persistProcessState();

    let updateNextEventId = nextEventId(this.events);
    let resolvedEventStatus: EventStatus | undefined;
    let resolution: string | undefined;

    if (supervisorResult.status === "completed") {
      const update = resolveEvent(this.events, event.id, {
        at: this.clock(),
        resolution: "retry_started",
      });
      this.events = update.events.map(cloneEvent);
      const updatedEvent = update.updatedEvent ?? this.events.find((item) => item.id === event.id);
      if (updatedEvent) {
        this.recordEventProjection({
          event: updatedEvent,
          kind: "event_status_changed",
          source: "manager",
          title: updatedEvent.title,
          message: supervisorResult.message,
          fromStatus: event.status,
          toStatus: "resolved",
        });
      }
      this.emitSnapshot();
      updateNextEventId = update.nextEventId;
      resolvedEventStatus = "resolved";
      resolution = "retry_started";
    }

    const result: ActionResultPayload = {
      requestId: payload.requestId,
      eventId: payload.eventId,
      actionId: payload.actionId,
      status: supervisorResult.status,
      message: supervisorResult.message,
      ...(resolution ? { resolution } : {}),
      ...(resolvedEventStatus ? { resolvedEventStatus } : {}),
      nextEventId: updateNextEventId,
      effects: [
        {
          type: "process",
          target: supervisorResult.target ?? `session:${event.sessionId}#retry-start-requested`,
          mocked: false,
        },
      ],
      ...(supervisorResult.error ? { error: { ...supervisorResult.error } } : {}),
    };

    this.recordProcessActionAudit({
      payload,
      event,
      actionId: "retry",
      decision: supervisorResult.status,
      message: supervisorResult.message,
      launchProfile: profile,
      ...(supervisorResult.error?.message ? { reason: supervisorResult.error.message } : {}),
      ...(supervisorResult.error?.code ? { errorCode: supervisorResult.error.code } : {}),
    });

    return this.rememberProcessActionResult(result);
  }

  private validateTerminateOwnership(
    payload: ActionRequestPayload,
    event: NotchEvent,
    action: Action,
    session: Session | undefined,
    ownership: ProcessOwnershipRecord | undefined
  ): ActionResultPayload | null {
    const nextEventIdValue = nextEventId(this.events);
    if (!session) {
      return rejectedProcessResult(
        payload,
        event,
        action,
        nextEventIdValue,
        "session_not_found",
        "会话不存在，无法终止"
      );
    }

    if (!ownership) {
      return rejectedProcessResult(
        payload,
        event,
        action,
        nextEventIdValue,
        "process_ownership_not_found",
        "没有可审计的进程归属记录，无法终止"
      );
    }

    if (session.sourceMode !== "live" || ownership.sourceMode !== "live") {
      return rejectedProcessResult(
        payload,
        event,
        action,
        nextEventIdValue,
        "process_source_not_live",
        "只有 Manager 托管的 live 会话可以执行终止"
      );
    }

    if (ownership.owner !== "notch-manager" || !ownership.active) {
      return rejectedProcessResult(
        payload,
        event,
        action,
        nextEventIdValue,
        "process_ownership_inactive",
        "进程归属记录不可用，无法终止"
      );
    }

    if (ownership.sessionId !== event.sessionId || ownership.sessionId !== session.id) {
      return rejectedProcessResult(
        payload,
        event,
        action,
        nextEventIdValue,
        "process_ownership_mismatch",
        "进程归属记录与事件会话不匹配"
      );
    }

    if (session.cwd && session.cwd !== ownership.cwd) {
      return rejectedProcessResult(
        payload,
        event,
        action,
        nextEventIdValue,
        "process_ownership_mismatch",
        "进程归属记录与会话目录不匹配"
      );
    }

    if (
      session.processId !== undefined &&
      ownership.pid !== undefined &&
      session.processId !== ownership.pid
    ) {
      return rejectedProcessResult(
        payload,
        event,
        action,
        nextEventIdValue,
        "process_ownership_mismatch",
        "进程归属记录与会话进程不匹配"
      );
    }

    if (!ownership.capabilities.includes("process.terminate")) {
      return rejectedProcessResult(
        payload,
        event,
        action,
        nextEventIdValue,
        "process_capability_unavailable",
        "当前进程归属不允许执行终止"
      );
    }

    const inputMismatch = processOwnershipMismatch(payload, ownership);
    if (inputMismatch) {
      return rejectedProcessResult(
        payload,
        event,
        action,
        nextEventIdValue,
        inputMismatch.code,
        inputMismatch.message
      );
    }

    if (!this.processSupervisor) {
      return rejectedProcessResult(
        payload,
        event,
        action,
        nextEventIdValue,
        "process_supervisor_unavailable",
        "没有可用的受控进程 supervisor"
      );
    }

    return null;
  }

  private requestSupervisedTerminate(
    payload: ActionRequestPayload,
    event: NotchEvent,
    action: Action
  ): ActionResultPayload {
    const session = this.sessions.get(event.sessionId);
    const ownership = this.processOwnership.get(event.sessionId);
    const rejected = this.validateTerminateOwnership(payload, event, action, session, ownership);
    if (rejected) {
      this.recordProcessActionAudit({
        payload,
        event,
        actionId: "terminate",
        decision: "rejected",
        message: rejected.message,
        ...(ownership ? { ownership } : {}),
        confirmedAt: this.clock(),
        ...(rejected.error?.message ? { reason: rejected.error.message } : {}),
        ...(rejected.error?.code ? { errorCode: rejected.error.code } : {}),
      });
      return this.rememberProcessActionResult(rejected);
    }

    if (!session || !ownership || !this.processSupervisor) {
      throw new Error("Supervised terminate validation returned ok without required process context");
    }

    const requestedAt = this.clock();
    const supervisorResult = this.processSupervisor.terminateGracefully({
      requestId: payload.requestId,
      event,
      session: cloneSession(session),
      ownership: cloneProcessOwnership(ownership),
      actionId: "terminate",
      confirmed: true,
      ...(payload.input ? { input: { ...payload.input } } : {}),
      requestedAt,
    });

    if (supervisorResult.endSession) {
      this.endSession(event.sessionId, supervisorResult.endSession.state, {
        ...(supervisorResult.endSession.exitCode !== undefined
          ? { exitCode: supervisorResult.endSession.exitCode }
          : {}),
        ...(supervisorResult.endSession.endReason
          ? { endReason: supervisorResult.endSession.endReason }
          : {}),
      });
    }

    let updateNextEventId = nextEventId(this.events);
    let resolvedEventStatus: EventStatus | undefined;
    let resolution: string | undefined;

    if (supervisorResult.status === "completed") {
      const update = resolveEvent(this.events, event.id, {
        at: this.clock(),
        resolution: "terminate_graceful_completed",
      });
      this.events = update.events.map(cloneEvent);
      const updatedEvent = update.updatedEvent ?? this.events.find((item) => item.id === event.id);
      if (updatedEvent) {
        this.recordEventProjection({
          event: updatedEvent,
          kind: "event_status_changed",
          source: "manager",
          title: updatedEvent.title,
          message: supervisorResult.message,
          fromStatus: event.status,
          toStatus: "resolved",
        });
      }
      this.emitSnapshot();
      updateNextEventId = update.nextEventId;
      resolvedEventStatus = "resolved";
      resolution = "terminate_graceful_completed";
    }

    const result: ActionResultPayload = {
      requestId: payload.requestId,
      eventId: payload.eventId,
      actionId: payload.actionId,
      status: supervisorResult.status,
      message: supervisorResult.message,
      ...(resolution ? { resolution } : {}),
      ...(resolvedEventStatus ? { resolvedEventStatus } : {}),
      nextEventId: updateNextEventId,
      effects: [
        {
          type: "process",
          target: supervisorResult.target ?? `session:${event.sessionId}#terminate`,
          mocked: false,
        },
      ],
      ...(supervisorResult.error ? { error: { ...supervisorResult.error } } : {}),
    };

    this.recordProcessActionAudit({
      payload,
      event,
      actionId: "terminate",
      decision: supervisorResult.status,
      message: supervisorResult.message,
      ownership,
      confirmedAt: requestedAt,
      ...(supervisorResult.error?.message ? { reason: supervisorResult.error.message } : {}),
      ...(supervisorResult.error?.code ? { errorCode: supervisorResult.error.code } : {}),
    });

    return this.rememberProcessActionResult(result);
  }

  requestAction(payload: ActionRequestPayload): ActionResultPayload {
    const replayedProcessResult = this.processActionResults.get(payload.requestId);
    if (replayedProcessResult) return cloneActionResult(replayedProcessResult);

    const event = this.events.find((item) => item.id === payload.eventId);
    if (!event) {
      return {
        requestId: payload.requestId,
        eventId: payload.eventId,
        actionId: payload.actionId,
        status: "rejected",
        message: "事件不存在或已不可用",
        error: {
          code: "event_not_found",
          message: `No event found for ${payload.eventId}`,
        },
      };
    }

    const action = event.actions.find((item) => item.id === payload.actionId);
    if (!action) {
      return {
        requestId: payload.requestId,
        eventId: payload.eventId,
        actionId: payload.actionId,
        status: "rejected",
        message: "动作不存在",
        nextEventId: nextEventId(this.events),
        error: {
          code: "action_not_found",
          message: `No action ${payload.actionId} for event ${payload.eventId}`,
        },
      };
    }

    if (event.status !== "active") {
      return this.finalizeActionResult(payload, event, action, {
        requestId: payload.requestId,
        eventId: payload.eventId,
        actionId: payload.actionId,
        status: "rejected",
        message: "事件已经不在 active 状态",
        nextEventId: nextEventId(this.events),
        error: {
          code: "event_not_active",
          message: `Event ${payload.eventId} is ${event.status}`,
        },
      });
    }

    if (event.type === "risk" && action.id === "allow-once" && !event.evidence?.riskLevel) {
      return this.finalizeActionResult(payload, event, action, {
        requestId: payload.requestId,
        eventId: payload.eventId,
        actionId: payload.actionId,
        status: "failed",
        message: "风险等级缺失，不能允许执行",
        nextEventId: nextEventId(this.events),
        effects: mockedEffects(action, event),
        error: {
          code: "risk_level_required",
          message: "riskLevel is required before allow-once can run",
        },
      });
    }

    if (!action.enabled) {
      return this.finalizeActionResult(payload, event, action, {
        requestId: payload.requestId,
        eventId: payload.eventId,
        actionId: payload.actionId,
        status: "rejected",
        message: action.disabledReason ?? "动作当前不可用",
        nextEventId: nextEventId(this.events),
        error: {
          code: "action_disabled",
          message: action.disabledReason ?? `Action ${action.id} is disabled`,
        },
      });
    }

    if (
      this.processSideEffectMode === "supervised" &&
      action.id === "terminate" &&
      action.requiresConfirm &&
      payload.confirmed !== true
    ) {
      return this.confirmationRequiredProcessResult(payload, event, action);
    }

    if (action.requiresConfirm && payload.confirmed !== true) {
      return this.finalizeActionResult(payload, event, action, {
        requestId: payload.requestId,
        eventId: payload.eventId,
        actionId: payload.actionId,
        status: "needs_confirmation",
        message: "该动作需要二次确认",
        nextEventId: nextEventId(this.events),
        effects: mockedEffects(action, event),
      });
    }

    if (action.id === "view-log") {
      return this.finalizeActionResult(
        payload,
        event,
        action,
        viewLogResult(payload, event, action, nextEventId(this.events))
      );
    }

    if (this.processSideEffectMode === "supervised" && action.id === "retry") {
      return this.requestSupervisedRetry(payload, event, action);
    }

    if (this.processSideEffectMode === "supervised" && action.id === "terminate") {
      return this.requestSupervisedTerminate(payload, event, action);
    }

    if (NOOP_ACTION_IDS.has(action.id) || !action.resolves) {
      return this.finalizeActionResult(payload, event, action, {
        requestId: payload.requestId,
        eventId: payload.eventId,
        actionId: payload.actionId,
        status: "noop",
        message: `已模拟动作：${action.label}`,
        nextEventId: nextEventId(this.events),
        effects: mockedEffects(action, event),
      });
    }

    const at = this.clock();
    const resolvedEventStatus: EventStatus = IGNORED_ACTION_IDS.has(action.id) ? "ignored" : "resolved";
    const update =
      resolvedEventStatus === "ignored"
        ? ignoreEvent(this.events, event.id, {
            at,
            resolution: actionResolution(action.id),
          })
        : resolveEvent(this.events, event.id, {
            at,
            resolution: actionResolution(action.id),
          });

    this.events = update.events.map(cloneEvent);
    const updatedEvent = update.updatedEvent ?? this.events.find((item) => item.id === event.id);
    if (updatedEvent) {
      this.recordEventProjection({
        event: updatedEvent,
        kind: "event_status_changed",
        source: "manager",
        title: updatedEvent.title,
        message: completedMessage(action),
        fromStatus: event.status,
        toStatus: resolvedEventStatus,
      });
    }
    this.emitSnapshot();

    return this.finalizeActionResult(payload, event, action, {
      requestId: payload.requestId,
      eventId: payload.eventId,
      actionId: payload.actionId,
      status: "completed",
      message: completedMessage(action),
      resolution: actionResolution(action.id),
      resolvedEventStatus,
      nextEventId: update.nextEventId,
      effects: mockedEffects(action, event),
    }, { at });
  }

  getSnapshot(): ManagerSnapshot {
    return cloneSnapshot({
      ...buildManagerSnapshot([...this.sessions.values()], this.events),
      pendingActions: this.pendingActions.map(clonePendingAction),
      historySummary: this.historySummary(),
    });
  }

  subscribe(listener: ManagerSnapshotListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private normalizeEvent(event: MockNotchEventInput): NotchEvent {
    const createdAt = event.createdAt ?? this.clock();
    const updatedAt = event.updatedAt ?? createdAt;
    if (event.type === "confirm" && event.command) {
      const riskInput: BuildRiskEventInput = {
        command: event.command,
        sessionId: event.sessionId,
        source: event.source ?? "mock-local-manager",
        createdAt,
        updatedAt,
        origin: event.evidence?.origin ?? "AI generated command, waiting for approval",
      };
      const sessionCwd = this.sessions.get(event.sessionId)?.cwd;
      if (event.commandHash) riskInput.commandHash = event.commandHash;
      if (sessionCwd) riskInput.cwd = sessionCwd;

      const riskEvent = buildRiskEvent(riskInput);

      if (riskEvent) return riskEvent;
    }

    const commandHash = event.commandHash ?? (event.command ? stableCommandHash(event.command) : undefined);
    const riskMissingRiskLevel = event.type === "risk" && !event.evidence?.riskLevel;
    const actions = (event.actions && event.actions.length > 0
      ? event.actions
      : defaultActionsFor(event.type)
    ).map((action) => normalizeAction(action, event.type, riskMissingRiskLevel));

    this.generatedEventCount += event.id ? 0 : 1;
    const normalized: NotchEvent = {
      id: event.id ?? `evt_${event.type}_${this.generatedEventCount}`,
      sessionId: event.sessionId,
      type: event.type,
      priority: event.priority ?? DEFAULT_EVENT_PRIORITY[event.type],
      status: event.status ?? "active",
      title: event.title ?? DEFAULT_EVENT_TITLE[event.type],
      summary: event.summary ?? DEFAULT_EVENT_SUMMARY[event.type],
      source: event.source ?? "mock-local-manager",
      createdAt,
      actions,
    };

    normalized.updatedAt = updatedAt;

    if (event.command) normalized.command = event.command;
    if (commandHash) normalized.commandHash = commandHash;
    if (event.evidence) {
      normalized.evidence = {
        ...event.evidence,
        ...(event.evidence.affectedPaths ? { affectedPaths: [...event.evidence.affectedPaths] } : {}),
      };
    }
    if (event.reasons) normalized.reasons = [...event.reasons];
    if (event.resolvedAt) normalized.resolvedAt = event.resolvedAt;
    if (event.resolution) normalized.resolution = event.resolution;
    if (event.occurrenceCount !== undefined) normalized.occurrenceCount = event.occurrenceCount;
    if (event.errorKey) normalized.errorKey = event.errorKey;

    return normalized;
  }

  private emitSnapshot(): void {
    const snapshot = this.getSnapshot();
    for (const listener of [...this.listeners]) {
      listener(snapshot);
    }
  }
}

export function createMockLocalAgentManager(
  options?: MockLocalAgentManagerOptions
): MockLocalAgentManager {
  return new MockLocalAgentManager(options);
}
