import type {
  EventStatus,
  EventType,
  ISODateTimeString,
  Mood,
  PanelState,
  RestingShellState,
  SessionState,
  SideEffect,
  SourceMode,
  ToolKind,
} from "../models/primitives.js";
import type { NotchEvent } from "../models/event.js";
import type { Session } from "../models/session.js";

export type NotchProtocolEvent =
  | "notch.session.upserted"
  | "notch.session.ended"
  | "notch.event.created"
  | "notch.event.updated"
  | "notch.snapshot.updated"
  | "notch.action.requested"
  | "notch.action.result"
  | "notch.debug.injected";

export interface ProtocolSource {
  kind: "cli" | "manager" | "ui" | "debug";
  tool?: ToolKind;
  sessionId?: string;
  processId?: number;
  name?: string;
  sourceMode?: SourceMode;
}

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

export type SessionUpsertedEnvelope = ProtocolEnvelope<
  "notch.session.upserted",
  { session: Session }
>;

export type SessionEndedEnvelope = ProtocolEnvelope<
  "notch.session.ended",
  {
    sessionId: string;
    state: Extract<SessionState, "completed" | "failed">;
    exitCode?: number;
    reason?: string;
  }
>;

export type EventCreatedEnvelope = ProtocolEnvelope<
  "notch.event.created",
  { event: NotchEvent }
>;

export type EventUpdatedEnvelope = ProtocolEnvelope<
  "notch.event.updated",
  {
    eventId: string;
    patch: Partial<
      Pick<
        NotchEvent,
        "status" | "updatedAt" | "resolvedAt" | "resolution" | "occurrenceCount"
      >
    >;
    nextEventId: string | null;
  }
>;

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
    restingState: RestingShellState;
    shouldAutoPeek: boolean;
  };
  pendingActions?: PendingActionRecord[];
  historySummary?: EventHistorySummary;
}

export type SnapshotUpdatedEnvelope = ProtocolEnvelope<
  "notch.snapshot.updated",
  { snapshot: ManagerSnapshot }
>;

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

export type DebugScenario = "idle" | "waiting" | "result" | "error" | "risk" | "all";

export type DebugInjectedEnvelope = ProtocolEnvelope<
  "notch.debug.injected",
  {
    scenario: DebugScenario;
    sessions?: Session[];
    events?: NotchEvent[];
  }
>;

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

export interface EventHistorySummary {
  totalEvents: number;
  resolvedEvents: number;
  ignoredEvents: number;
  expiredEvents: number;
  failedActions: number;
  inProgressActions: number;
}

export interface EventHistoryRecord {
  historyId: string;
  eventId: string;
  sessionId: string;
  type: EventType;
  status: EventStatus;
  title: string;
  summary: string;
  priority: number;
  source: string;
  createdAt: ISODateTimeString;
  updatedAt?: ISODateTimeString;
  resolvedAt?: ISODateTimeString;
  resolution?: string;
  commandHash?: string;
  errorKey?: string;
  occurrenceCount?: number;
  eventSnapshot: NotchEvent;
  latestAction?: {
    requestId: string;
    actionId: string;
    status: ActionResultStatus;
    message: string;
    updatedAt: ISODateTimeString;
  };
}

export type EventTimelineKind =
  | "event_created"
  | "event_updated"
  | "event_deduped"
  | "event_status_changed"
  | "action_requested"
  | "action_result"
  | "action_completed_async"
  | "session_state_changed";

export interface EventTimelineEntry {
  id: string;
  eventId: string;
  sessionId: string;
  kind: EventTimelineKind;
  at: ISODateTimeString;
  source: ProtocolSource["kind"];
  title: string;
  message: string;
  requestId?: string;
  actionId?: string;
  fromStatus?: EventStatus | ActionResultStatus | SessionState;
  toStatus?: EventStatus | ActionResultStatus | SessionState;
  errorCode?: string;
  target?: string;
}

export type PendingActionVisibilityStatus =
  | "waiting_confirmation"
  | "queued"
  | "in_progress"
  | "completed"
  | "failed"
  | "rejected"
  | "noop"
  | "expired";

export interface PendingActionRecord {
  requestId: string;
  eventId: string;
  sessionId: string;
  actionId: string;
  label: string;
  status: PendingActionVisibilityStatus;
  resultStatus: ActionResultStatus;
  message: string;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
  completedAt?: ISODateTimeString;
  expiresAt?: ISODateTimeString;
  source: "desktop-ui" | "api" | "smoke";
  mocked: boolean;
  resolution?: string;
  errorCode?: string;
  errorMessage?: string;
  targetSummary?: string;
  requiresConfirmation?: boolean;
}

export interface PaginatedEventHistoryResponse {
  ok: true;
  history: EventHistoryRecord[];
  timeline?: EventTimelineEntry[];
  nextCursor: string | null;
  snapshot: ManagerSnapshot;
}

export interface ActionRequestsResponse {
  ok: true;
  actions: PendingActionRecord[];
  nextCursor: string | null;
  snapshot: ManagerSnapshot;
}
