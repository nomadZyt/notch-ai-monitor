import type {
  ActionRequestPayload,
  ActionRequestsResponse,
  ActionResultPayload,
  DebugScenario,
  EventStatus,
  EventType,
  ManagerSnapshot,
  PaginatedEventHistoryResponse,
  PendingActionVisibilityStatus,
} from "@notch-ai-monitor/shared";

export type ManagerSnapshotListener = (snapshot: ManagerSnapshot) => void;
export type ManagerClientErrorListener = (message: string, error?: unknown) => void;

export interface DesktopManagerClient {
  getSnapshot(): ManagerSnapshot;
  subscribe(listener: ManagerSnapshotListener): () => void;
  subscribeErrors?(listener: ManagerClientErrorListener): () => void;
  requestAction(payload: ActionRequestPayload): Promise<ActionResultPayload>;
  getEventHistory?(query?: {
    sessionId?: string;
    status?: EventStatus;
    type?: EventType;
    cursor?: string;
    limit?: number;
  }): Promise<PaginatedEventHistoryResponse>;
  getActionRequests?(query?: {
    sessionId?: string;
    eventId?: string;
    status?: PendingActionVisibilityStatus;
    cursor?: string;
    limit?: number;
  }): Promise<ActionRequestsResponse>;
  injectScenario(scenario: DebugScenario): Promise<ManagerSnapshot>;
  resetSnapshot(): Promise<ManagerSnapshot>;
  close?(): void;
}

export const EMPTY_MANAGER_SNAPSHOT: ManagerSnapshot = {
  sessions: [],
  events: [],
  activeEventIds: [],
  currentEventId: null,
  counts: {
    sessions: 0,
    activeSessions: 0,
    activeEvents: 0,
  },
  viewHints: {
    mood: "none",
    restingState: "dormant",
    shouldAutoPeek: false,
  },
};

export class ManagerClientError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "ManagerClientError";
  }
}

export function managerClientErrorMessage(error: unknown): string {
  if (error instanceof ManagerClientError) return error.message;
  if (error instanceof Error) return error.message;
  return "本地 Manager API 请求失败";
}
