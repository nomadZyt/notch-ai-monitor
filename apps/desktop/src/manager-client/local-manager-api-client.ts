import type {
  ActionRequestPayload,
  ActionRequestsResponse,
  ActionResultPayload,
  DebugScenario,
  ManagerSnapshot,
  PaginatedEventHistoryResponse,
  ProtocolEnvelope,
  ProtocolSource,
} from "@notch-ai-monitor/shared";
import {
  EMPTY_MANAGER_SNAPSHOT,
  ManagerClientError,
  type DesktopManagerClient,
  type ManagerClientErrorListener,
  type ManagerSnapshotListener,
} from "./types";

export const DEFAULT_LOCAL_MANAGER_API_URL = "http://127.0.0.1:4317";

interface LocalManagerApiClientOptions {
  baseUrl?: string;
  clientName?: string;
  clock?: () => string;
}

interface SnapshotResponse {
  ok: true;
  snapshot: ManagerSnapshot;
}

interface EnvelopeResponse {
  ok: true;
  event: string;
  result?: unknown;
  snapshot: ManagerSnapshot;
}

interface ResetResponse {
  ok: true;
  event: "notch.debug.reset";
  snapshot: ManagerSnapshot;
}

type ProjectionQuery = Record<string, string | number | undefined>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneSnapshot(snapshot: ManagerSnapshot): ManagerSnapshot {
  return {
    ...snapshot,
    sessions: snapshot.sessions.map((session) => ({ ...session })),
    events: snapshot.events.map((event) => ({
      ...event,
      actions: event.actions.map((action) => ({ ...action })),
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
    })),
    activeEventIds: [...snapshot.activeEventIds],
    counts: { ...snapshot.counts },
    viewHints: { ...snapshot.viewHints },
    ...(snapshot.pendingActions ? { pendingActions: snapshot.pendingActions.map((record) => ({ ...record })) } : {}),
    ...(snapshot.historySummary ? { historySummary: { ...snapshot.historySummary } } : {}),
  };
}

function responseErrorMessage(body: unknown, fallback: string): string {
  if (isRecord(body) && body.ok === false && isRecord(body.error)) {
    const message = body.error.message;
    return typeof message === "string" && message.length > 0 ? `${fallback}：${message}` : fallback;
  }
  return fallback;
}

function assertSnapshot(value: unknown, context: string): ManagerSnapshot {
  if (!isRecord(value) || !Array.isArray(value.sessions) || !Array.isArray(value.events)) {
    throw new ManagerClientError(`${context} 返回的 snapshot 格式不正确`);
  }

  return value as unknown as ManagerSnapshot;
}

function assertActionResultPayload(value: unknown): ActionResultPayload {
  if (
    !isRecord(value) ||
    typeof value.requestId !== "string" ||
    typeof value.eventId !== "string" ||
    typeof value.actionId !== "string" ||
    typeof value.status !== "string" ||
    typeof value.message !== "string"
  ) {
    throw new ManagerClientError("本地 Manager API 返回的 action result 格式不正确");
  }

  return value as unknown as ActionResultPayload;
}

export class LocalManagerApiClient implements DesktopManagerClient {
  private readonly baseUrl: string;
  private readonly clientName: string;
  private readonly clock: () => string;
  private readonly listeners = new Set<ManagerSnapshotListener>();
  private readonly errorListeners = new Set<ManagerClientErrorListener>();
  private snapshot = cloneSnapshot(EMPTY_MANAGER_SNAPSHOT);
  private eventSource: EventSource | null = null;
  private messageCount = 0;
  private reportedSseError = false;

  constructor(options: LocalManagerApiClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? DEFAULT_LOCAL_MANAGER_API_URL;
    this.clientName = options.clientName ?? "notch-desktop";
    this.clock = options.clock ?? (() => new Date().toISOString());
  }

  async init(): Promise<ManagerSnapshot> {
    try {
      const snapshot = await this.fetchSnapshot();
      this.setSnapshot(snapshot);
      this.openEventStream();
      return this.getSnapshot();
    } catch (error) {
      const wrapped = this.wrapError(error, `无法连接本地 Manager API (${this.baseUrl})`);
      this.emitError(wrapped.message, wrapped);
      throw wrapped;
    }
  }

  getSnapshot(): ManagerSnapshot {
    return cloneSnapshot(this.snapshot);
  }

  subscribe(listener: ManagerSnapshotListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  subscribeErrors(listener: ManagerClientErrorListener): () => void {
    this.errorListeners.add(listener);
    return () => {
      this.errorListeners.delete(listener);
    };
  }

  async requestAction(payload: ActionRequestPayload): Promise<ActionResultPayload> {
    const envelope = this.createEnvelope("notch.action.requested", payload, {
      kind: "ui",
      name: this.clientName,
    });
    envelope.correlationId = payload.requestId;

    const response = await this.postEnvelope(envelope, "发送操作请求失败");
    this.setSnapshot(response.snapshot);

    const result = isRecord(response.result) ? response.result.envelope : undefined;
    const resultEnvelope = isRecord(result) ? result : undefined;
    if (resultEnvelope?.event !== "notch.action.result") {
      throw new ManagerClientError("本地 Manager API 没有返回 action result envelope");
    }

    return assertActionResultPayload(resultEnvelope.payload);
  }

  async getEventHistory(
    query: Parameters<NonNullable<DesktopManagerClient["getEventHistory"]>>[0] = {}
  ): Promise<PaginatedEventHistoryResponse> {
    const response = await fetch(this.urlWithQuery("/v1/event-history", query), {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });
    const body = (await response.json().catch(() => undefined)) as unknown;

    if (!response.ok || !isRecord(body) || body.ok !== true || !Array.isArray(body.history)) {
      throw new ManagerClientError(
        responseErrorMessage(body, `读取事件历史失败 (${response.status})`)
      );
    }

    const historyResponse = body as unknown as PaginatedEventHistoryResponse;
    historyResponse.snapshot = assertSnapshot(historyResponse.snapshot, "GET /v1/event-history");
    return historyResponse;
  }

  async getActionRequests(
    query: Parameters<NonNullable<DesktopManagerClient["getActionRequests"]>>[0] = {}
  ): Promise<ActionRequestsResponse> {
    const response = await fetch(this.urlWithQuery("/v1/action-requests", query), {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });
    const body = (await response.json().catch(() => undefined)) as unknown;

    if (!response.ok || !isRecord(body) || body.ok !== true || !Array.isArray(body.actions)) {
      throw new ManagerClientError(
        responseErrorMessage(body, `读取动作状态失败 (${response.status})`)
      );
    }

    const actionResponse = body as unknown as ActionRequestsResponse;
    actionResponse.snapshot = assertSnapshot(actionResponse.snapshot, "GET /v1/action-requests");
    return actionResponse;
  }

  async injectScenario(scenario: DebugScenario): Promise<ManagerSnapshot> {
    const envelope = this.createEnvelope(
      "notch.debug.injected",
      { scenario },
      {
        kind: "debug",
        name: this.clientName,
      }
    );
    const response = await this.postEnvelope(envelope, "注入调试场景失败");
    this.setSnapshot(response.snapshot);
    return this.getSnapshot();
  }

  async resetSnapshot(): Promise<ManagerSnapshot> {
    const response = await fetch(this.url("/v1/debug/reset"), {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
    });
    const body = (await response.json().catch(() => undefined)) as unknown;

    if (!response.ok || !isRecord(body) || body.ok !== true) {
      throw new ManagerClientError(responseErrorMessage(body, `清空本地 Manager 快照失败 (${response.status})`));
    }

    const resetResponse = body as unknown as ResetResponse;
    resetResponse.snapshot = assertSnapshot(resetResponse.snapshot, "POST /v1/debug/reset");
    this.setSnapshot(resetResponse.snapshot);
    return this.getSnapshot();
  }

  close(): void {
    this.eventSource?.close();
    this.eventSource = null;
  }

  private async fetchSnapshot(): Promise<ManagerSnapshot> {
    const response = await fetch(this.url("/v1/snapshot"), {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });
    const body = (await response.json().catch(() => undefined)) as unknown;

    if (!response.ok || !isRecord(body) || body.ok !== true) {
      throw new ManagerClientError(
        responseErrorMessage(body, `GET /v1/snapshot failed with ${response.status}`)
      );
    }

    const snapshotResponse = body as unknown as SnapshotResponse;
    return assertSnapshot(snapshotResponse.snapshot, "GET /v1/snapshot");
  }

  private async postEnvelope(
    envelope: ProtocolEnvelope<string, unknown>,
    context: string
  ): Promise<EnvelopeResponse> {
    const response = await fetch(this.url("/v1/envelopes"), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(envelope),
    });
    const body = (await response.json().catch(() => undefined)) as unknown;

    if (!response.ok || !isRecord(body) || body.ok !== true) {
      throw new ManagerClientError(responseErrorMessage(body, `${context} (${response.status})`));
    }

    const envelopeResponse = body as unknown as EnvelopeResponse;
    envelopeResponse.snapshot = assertSnapshot(envelopeResponse.snapshot, "POST /v1/envelopes");
    return envelopeResponse;
  }

  private openEventStream(): void {
    if (!("EventSource" in window)) {
      this.emitError("当前浏览器不支持 EventSource，无法订阅本地 Manager 事件流");
      return;
    }

    this.close();
    const eventSource = new EventSource(this.url("/v1/events"));
    this.eventSource = eventSource;
    this.reportedSseError = false;

    eventSource.addEventListener("notch.snapshot.updated", (event) => {
      try {
        const envelope = JSON.parse(event.data as string) as unknown;
        const payload = isRecord(envelope) ? envelope.payload : undefined;
        const snapshot = isRecord(payload) ? payload.snapshot : undefined;
        this.setSnapshot(assertSnapshot(snapshot, "SSE notch.snapshot.updated"));
      } catch (error) {
        this.emitError("本地 Manager 事件流数据格式不正确", error);
      }
    });

    eventSource.onerror = () => {
      if (this.reportedSseError) return;
      this.reportedSseError = true;
      this.emitError("本地 Manager 事件流连接中断，界面会保留最近一次快照");
    };
  }

  private setSnapshot(snapshot: ManagerSnapshot): void {
    this.snapshot = cloneSnapshot(snapshot);
    const next = this.getSnapshot();
    for (const listener of [...this.listeners]) {
      listener(next);
    }
  }

  private emitError(message: string, error?: unknown): void {
    for (const listener of [...this.errorListeners]) {
      listener(message, error);
    }
  }

  private createEnvelope<TEvent extends string, TPayload>(
    event: TEvent,
    payload: TPayload,
    source: ProtocolSource
  ): ProtocolEnvelope<TEvent, TPayload> {
    this.messageCount += 1;
    return {
      protocol: "notch-ai-monitor",
      version: 1,
      id: `ui_msg_${this.messageCount.toString().padStart(4, "0")}`,
      event,
      ts: this.clock(),
      source,
      payload,
    };
  }

  private url(path: string): string {
    return new URL(path, this.baseUrl.endsWith("/") ? this.baseUrl : `${this.baseUrl}/`).href;
  }

  private urlWithQuery(path: string, query: ProjectionQuery): string {
    const url = new URL(path, this.baseUrl.endsWith("/") ? this.baseUrl : `${this.baseUrl}/`);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
    return url.href;
  }

  private wrapError(error: unknown, context: string): ManagerClientError {
    if (error instanceof ManagerClientError) {
      return new ManagerClientError(`${context}：${error.message}`, error);
    }
    if (error instanceof Error) {
      return new ManagerClientError(`${context}：${error.message}`, error);
    }
    return new ManagerClientError(context, error);
  }
}
