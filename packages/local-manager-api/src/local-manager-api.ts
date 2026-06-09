import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { URL } from "node:url";

import {
  createMockLocalAgentManager,
  type MockLocalAgentManager,
  type MockNotchEventInput,
  type ProcessCapability,
  type ProcessSideEffectMode,
  type ProcessSupervisor,
  type RiskReplayMode,
} from "@notch-ai-monitor/local-manager-mock";
import type {
  ActionRequestPayload,
  ActionResultPayload,
  ActionRequestsResponse,
  DebugScenario,
  EventStatus,
  EventType,
  ManagerSnapshot,
  PaginatedEventHistoryResponse,
  PendingActionRecord,
  PendingActionVisibilityStatus,
  ProtocolEnvelope,
  ProtocolSource,
  Session,
} from "@notch-ai-monitor/shared";
import { JsonFileProcessPersistenceStore } from "./process-persistence-store.js";
import { JsonFileEventHistoryPersistenceStore } from "./event-history-persistence-store.js";
import { LocalProcessSupervisor } from "./local-process-supervisor.js";

const MAX_JSON_BYTES = 1024 * 1024;
const PROTOCOL_NAME = "notch-ai-monitor";
const PROCESS_REGISTRATION_EVENT = "notch.process.registered";
const PROCESS_REGISTRATION_PATH = "/v1/process/registrations";
const EVENT_HISTORY_PATH = "/v1/event-history";
const ACTION_REQUESTS_PATH = "/v1/action-requests";
const DEBUG_EXPIRE_PENDING_ACTIONS_PATH = "/v1/debug/expire-pending-actions";
const PROCESS_CAPABILITIES = new Set<ProcessCapability>([
  "process.retry",
  "process.terminate",
]);
const RISK_REPLAY_MODES = new Set<RiskReplayMode>(["required", "approved"]);
const EVENT_STATUSES = new Set<EventStatus>(["active", "resolved", "ignored", "expired"]);
const EVENT_TYPES = new Set<EventType>(["risk", "confirm", "result", "error"]);
const PENDING_ACTION_STATUSES = new Set<PendingActionVisibilityStatus>([
  "waiting_confirmation",
  "queued",
  "in_progress",
  "completed",
  "failed",
  "rejected",
  "noop",
  "expired",
]);
const SUPPORTED_DEBUG_SCENARIOS = new Set<DebugScenario>([
  "idle",
  "waiting",
  "result",
  "error",
  "risk",
  "all",
]);

export interface LocalManagerApiOptions {
  manager?: MockLocalAgentManager;
  clock?: () => string;
  logger?: LocalManagerApiLogger;
  serviceName?: string;
  processPersistenceFile?: string;
  eventHistoryPersistenceFile?: string;
  pendingActionTimeoutMs?: number | null;
  pendingActionSweepIntervalMs?: number | null;
  processSideEffectMode?: ProcessSideEffectMode;
  processSupervisor?: ProcessSupervisor;
}

export interface LocalManagerApiListenResult {
  host: string;
  port: number;
  url: string;
}

export interface LocalManagerApiLogger {
  info(message: string, details?: Record<string, unknown>): void;
  warn(message: string, details?: Record<string, unknown>): void;
  error(message: string, details?: Record<string, unknown>): void;
}

export interface EnvelopeIngestionResponse {
  ok: true;
  event: string;
  result?: unknown;
  snapshot: ManagerSnapshot;
}

export interface JsonErrorResponse {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface DebugExpirePendingActionsResponse {
  ok: true;
  event: "notch.debug.pending-actions.expired";
  expiredActions: PendingActionRecord[];
  snapshot: ManagerSnapshot;
}

type JsonResponse =
  | EnvelopeIngestionResponse
  | DebugExpirePendingActionsResponse
  | JsonErrorResponse
  | PaginatedEventHistoryResponse
  | ActionRequestsResponse
  | Record<string, unknown>;
type SseClient = ServerResponse;

class ApiHttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiHttpError";
    this.status = status;
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, code: string, message: string): Record<string, unknown> {
  if (!isRecord(value)) throw new ApiHttpError(400, code, message);
  return value;
}

function requireString(
  record: Record<string, unknown>,
  key: string,
  code: string,
  message: string
): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new ApiHttpError(400, code, message);
  }
  return value;
}

function optionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function optionalQueryString(url: URL, key: string): string | undefined {
  const value = url.searchParams.get(key);
  return value && value.length > 0 ? value : undefined;
}

function optionalQueryLimit(url: URL): number | undefined {
  const value = optionalQueryString(url, "limit");
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new ApiHttpError(400, "invalid_query", "limit must be a positive integer.");
  }
  return Math.min(100, parsed);
}

function optionalEventStatus(url: URL): EventStatus | undefined {
  const value = optionalQueryString(url, "status");
  if (!value) return undefined;
  if (!EVENT_STATUSES.has(value as EventStatus)) {
    throw new ApiHttpError(400, "invalid_query", "status is not a supported event status.");
  }
  return value as EventStatus;
}

function optionalEventType(url: URL): EventType | undefined {
  const value = optionalQueryString(url, "type");
  if (!value) return undefined;
  if (!EVENT_TYPES.has(value as EventType)) {
    throw new ApiHttpError(400, "invalid_query", "type is not a supported event type.");
  }
  return value as EventType;
}

function optionalPendingActionStatus(url: URL): PendingActionVisibilityStatus | undefined {
  const value = optionalQueryString(url, "status");
  if (!value) return undefined;
  if (!PENDING_ACTION_STATUSES.has(value as PendingActionVisibilityStatus)) {
    throw new ApiHttpError(400, "invalid_query", "status is not a supported action request status.");
  }
  return value as PendingActionVisibilityStatus;
}

function optionalNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionalStringArray(record: Record<string, unknown>, key: string): string[] | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new ApiHttpError(400, "invalid_process_registration", `${key} must be an array of strings.`);
  }
  if (!value.every((item) => typeof item === "string")) {
    throw new ApiHttpError(400, "invalid_process_registration", `${key} must be an array of strings.`);
  }
  return value.map((item) => item as string);
}

function processCapabilitiesFrom(value: unknown): ProcessCapability[] {
  if (value === undefined) return ["process.retry", "process.terminate"];
  if (!Array.isArray(value)) {
    throw new ApiHttpError(400, "invalid_process_registration", "capabilities must be an array.");
  }
  const capabilities: ProcessCapability[] = [];
  for (const item of value) {
    if (!PROCESS_CAPABILITIES.has(item as ProcessCapability)) {
      throw new ApiHttpError(400, "invalid_process_registration", "capabilities contains an unsupported value.");
    }
    if (!capabilities.includes(item as ProcessCapability)) {
      capabilities.push(item as ProcessCapability);
    }
  }
  return capabilities;
}

function riskReplayModeFrom(value: unknown): RiskReplayMode {
  if (value === undefined) return "required";
  if (!RISK_REPLAY_MODES.has(value as RiskReplayMode)) {
    throw new ApiHttpError(400, "invalid_process_registration", "riskReplayMode is invalid.");
  }
  return value as RiskReplayMode;
}

function validateLocalControlEndpoint(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ApiHttpError(400, "invalid_process_registration", "controlEndpoint must be a valid URL.");
  }
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1") {
    throw new ApiHttpError(
      400,
      "invalid_process_registration",
      "controlEndpoint must use http://127.0.0.1."
    );
  }
  return url.href;
}

function validateEnvelope(input: unknown): ProtocolEnvelope<string, unknown> {
  const envelope = requireRecord(input, "invalid_envelope", "Request body must be a protocol envelope.");
  if (envelope.protocol !== PROTOCOL_NAME) {
    throw new ApiHttpError(400, "invalid_protocol", "Envelope protocol must be notch-ai-monitor.");
  }
  if (envelope.version !== 1) {
    throw new ApiHttpError(400, "unsupported_version", "Envelope version must be 1.");
  }

  requireString(envelope, "id", "invalid_envelope", "Envelope id is required.");
  requireString(envelope, "event", "invalid_envelope", "Envelope event is required.");
  requireString(envelope, "ts", "invalid_envelope", "Envelope ts is required.");

  const source = requireRecord(envelope.source, "invalid_envelope", "Envelope source is required.");
  const sourceKind = source.kind;
  if (!["cli", "manager", "ui", "debug"].includes(String(sourceKind))) {
    throw new ApiHttpError(400, "invalid_envelope", "Envelope source.kind is invalid.");
  }
  if (!("payload" in envelope)) {
    throw new ApiHttpError(400, "invalid_envelope", "Envelope payload is required.");
  }

  return envelope as unknown as ProtocolEnvelope<string, unknown>;
}

function writeJson(res: ServerResponse, status: number, body: JsonResponse): void {
  res.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;
    if (totalBytes > MAX_JSON_BYTES) {
      throw new ApiHttpError(413, "body_too_large", "JSON body is larger than 1 MiB.");
    }
    chunks.push(buffer);
  }

  const text = Buffer.concat(chunks).toString("utf8");
  if (text.trim().length === 0) {
    throw new ApiHttpError(400, "empty_body", "Request body must contain JSON.");
  }

  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to parse JSON.";
    throw new ApiHttpError(400, "invalid_json", "Request body is not valid JSON.", message);
  }
}

async function readOptionalJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;
    if (totalBytes > MAX_JSON_BYTES) {
      throw new ApiHttpError(413, "body_too_large", "JSON body is larger than 1 MiB.");
    }
    chunks.push(buffer);
  }

  const text = Buffer.concat(chunks).toString("utf8");
  if (text.trim().length === 0) return {};

  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to parse JSON.";
    throw new ApiHttpError(400, "invalid_json", "Request body is not valid JSON.", message);
  }
}

function getPortFromAddress(address: ReturnType<Server["address"]>): number {
  if (!address || typeof address === "string") return 0;
  return address.port;
}

const NOOP_LOGGER: LocalManagerApiLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

function normalizePendingActionSweepIntervalMs(value: number | null | undefined): number | null {
  if (value === undefined || value === null || value === 0) return null;
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("pendingActionSweepIntervalMs must be a non-negative finite number.");
  }
  return value;
}

export class LocalManagerApiServer {
  readonly manager: MockLocalAgentManager;
  readonly server: Server;

  private readonly clock: () => string;
  private readonly logger: LocalManagerApiLogger;
  private readonly serviceName: string;
  private readonly pendingActionSweepIntervalMs: number | null;
  private readonly processSupervisor: ProcessSupervisor | undefined;
  private readonly unsubscribeManager: () => void;
  private readonly sseClients = new Set<SseClient>();
  private pendingActionSweepTimer: ReturnType<typeof setInterval> | null = null;
  private messageCount = 0;
  private listening = false;

  constructor(options: LocalManagerApiOptions = {}) {
    this.clock = options.clock ?? (() => new Date().toISOString());
    this.logger = options.logger ?? NOOP_LOGGER;
    this.serviceName = options.serviceName ?? "local-manager-api";
    this.pendingActionSweepIntervalMs = normalizePendingActionSweepIntervalMs(
      options.pendingActionSweepIntervalMs
    );
    const processSideEffectMode = options.processSideEffectMode ?? "mock";
    const processPersistence = options.processPersistenceFile
      ? new JsonFileProcessPersistenceStore(options.processPersistenceFile)
      : undefined;
    const eventHistoryPersistence = options.eventHistoryPersistenceFile
      ? new JsonFileEventHistoryPersistenceStore(options.eventHistoryPersistenceFile)
      : undefined;
    this.processSupervisor =
      options.processSupervisor ??
      (processSideEffectMode === "supervised"
        ? new LocalProcessSupervisor({
            clock: this.clock,
            onSessionEnded: (sessionId, end) => {
              this.completeSessionEnd(sessionId, end.state, {
                ...(end.exitCode !== undefined ? { exitCode: end.exitCode } : {}),
                ...(end.endReason ? { endReason: end.endReason } : {}),
              });
            },
            onProcessActionCompleted: (completion) => {
              this.manager.completeAcceptedProcessAction(completion);
            },
          })
        : undefined);
    this.manager =
      options.manager ??
      createMockLocalAgentManager({
        clock: this.clock,
        ...(options.pendingActionTimeoutMs !== undefined
          ? { pendingActionTimeoutMs: options.pendingActionTimeoutMs }
          : {}),
        processSideEffectMode,
        ...(this.processSupervisor ? { processSupervisor: this.processSupervisor } : {}),
        ...(processPersistence ? { processPersistence } : {}),
        ...(eventHistoryPersistence ? { eventHistoryPersistence } : {}),
      });
    this.unsubscribeManager = this.manager.subscribe((snapshot) => this.broadcastSnapshot(snapshot));
    this.server = createServer((req, res) => {
      void this.handle(req, res);
    });
  }

  listen(port = 4317, host = "127.0.0.1"): Promise<LocalManagerApiListenResult> {
    return new Promise((resolve, reject) => {
      const onError = (error: Error): void => {
        this.server.off("listening", onListening);
        reject(error);
      };
      const onListening = (): void => {
        this.server.off("error", onError);
        this.listening = true;
        this.startPendingActionSweepScheduler();
        const actualPort = getPortFromAddress(this.server.address());
        resolve({
          host,
          port: actualPort,
          url: `http://${host}:${actualPort}`,
        });
      };

      this.server.once("error", onError);
      this.server.once("listening", onListening);
      this.server.listen(port, host);
    });
  }

  close(): Promise<void> {
    this.stopPendingActionSweepScheduler();
    this.unsubscribeManager();
    if (this.processSupervisor instanceof LocalProcessSupervisor) {
      this.processSupervisor.close();
    }
    for (const client of this.sseClients) {
      client.end();
    }
    this.sseClients.clear();
    this.server.closeIdleConnections();
    this.server.closeAllConnections();

    if (!this.listening) return Promise.resolve();

    return new Promise((resolve, reject) => {
      this.server.close((error) => {
        this.listening = false;
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  private startPendingActionSweepScheduler(): void {
    if (this.pendingActionSweepIntervalMs === null || this.pendingActionSweepTimer) return;
    this.runPendingActionSweep();
    this.pendingActionSweepTimer = setInterval(() => {
      this.runPendingActionSweep();
    }, this.pendingActionSweepIntervalMs);
  }

  private stopPendingActionSweepScheduler(): void {
    if (!this.pendingActionSweepTimer) return;
    clearInterval(this.pendingActionSweepTimer);
    this.pendingActionSweepTimer = null;
  }

  private runPendingActionSweep(): PendingActionRecord[] {
    return this.manager.expirePendingActions({ at: this.clock() });
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      if (req.method === "OPTIONS") {
        writeJson(res, 204, {});
        return;
      }

      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (req.method === "GET" && url.pathname === "/health") {
        writeJson(res, 200, {
          ok: true,
          status: "ok",
          service: this.serviceName,
          protocol: PROTOCOL_NAME,
          version: 1,
        });
        return;
      }

      if (req.method === "GET" && url.pathname === "/v1/snapshot") {
        writeJson(res, 200, {
          ok: true,
          snapshot: this.manager.getSnapshot(),
        });
        return;
      }

      if (req.method === "GET" && url.pathname === EVENT_HISTORY_PATH) {
        writeJson(res, 200, this.eventHistoryResponse(url));
        return;
      }

      if (req.method === "GET" && url.pathname === ACTION_REQUESTS_PATH) {
        writeJson(res, 200, this.actionRequestsResponse(url));
        return;
      }

      if (req.method === "GET" && url.pathname === "/v1/events") {
        this.openSse(req, res);
        return;
      }

      if (req.method === "POST" && url.pathname === "/v1/envelopes") {
        const body = await readJsonBody(req);
        const envelope = validateEnvelope(body);
        const response = this.ingestEnvelope(envelope);
        writeJson(res, 200, response);
        return;
      }

      if (req.method === "POST" && url.pathname === PROCESS_REGISTRATION_PATH) {
        const body = await readJsonBody(req);
        const response = this.registerProcess(body);
        writeJson(res, 200, response);
        return;
      }

      if (req.method === "POST" && url.pathname === "/v1/debug/reset") {
        const snapshot = this.manager.reset();
        writeJson(res, 200, {
          ok: true,
          event: "notch.debug.reset",
          snapshot,
        });
        return;
      }

      if (req.method === "POST" && url.pathname === DEBUG_EXPIRE_PENDING_ACTIONS_PATH) {
        const body = await readOptionalJsonBody(req);
        writeJson(res, 200, this.expirePendingActionsResponse(body));
        return;
      }

      if (
        url.pathname === "/health" ||
        url.pathname === "/v1/snapshot" ||
        url.pathname === EVENT_HISTORY_PATH ||
        url.pathname === ACTION_REQUESTS_PATH ||
        url.pathname === "/v1/events"
      ) {
        throw new ApiHttpError(405, "method_not_allowed", `Method ${req.method ?? "UNKNOWN"} is not allowed.`);
      }
      if (
        url.pathname === "/v1/envelopes" ||
        url.pathname === PROCESS_REGISTRATION_PATH ||
        url.pathname === "/v1/debug/reset" ||
        url.pathname === DEBUG_EXPIRE_PENDING_ACTIONS_PATH
      ) {
        throw new ApiHttpError(405, "method_not_allowed", `Method ${req.method ?? "UNKNOWN"} is not allowed.`);
      }

      throw new ApiHttpError(404, "not_found", `No route for ${req.method ?? "UNKNOWN"} ${url.pathname}.`);
    } catch (error) {
      this.logRequestFailure(req, error);
      this.writeError(res, error);
    }
  }

  private logRequestFailure(req: IncomingMessage, error: unknown): void {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname !== PROCESS_REGISTRATION_PATH) return;

    const code = error instanceof ApiHttpError ? error.code : "internal_error";
    const message = error instanceof Error ? error.message : "Unknown adapter registration failure.";
    this.logger.warn("adapter registration failed", {
      method: req.method ?? "UNKNOWN",
      path: url.pathname,
      code,
      message,
    });
  }

  private eventHistoryResponse(url: URL): PaginatedEventHistoryResponse {
    const sessionId = optionalQueryString(url, "sessionId");
    const status = optionalEventStatus(url);
    const type = optionalEventType(url);
    const cursor = optionalQueryString(url, "cursor");
    const limit = optionalQueryLimit(url);
    const page = this.manager.getEventHistory({
      ...(sessionId ? { sessionId } : {}),
      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
      ...(cursor ? { cursor } : {}),
      ...(limit !== undefined ? { limit } : {}),
    });

    return {
      ok: true,
      history: page.history,
      timeline: page.timeline,
      nextCursor: page.nextCursor,
      snapshot: this.manager.getSnapshot(),
    };
  }

  private actionRequestsResponse(url: URL): ActionRequestsResponse {
    const sessionId = optionalQueryString(url, "sessionId");
    const eventId = optionalQueryString(url, "eventId");
    const status = optionalPendingActionStatus(url);
    const cursor = optionalQueryString(url, "cursor");
    const limit = optionalQueryLimit(url);
    const page = this.manager.getPendingActions({
      ...(sessionId ? { sessionId } : {}),
      ...(eventId ? { eventId } : {}),
      ...(status ? { status } : {}),
      ...(cursor ? { cursor } : {}),
      ...(limit !== undefined ? { limit } : {}),
    });

    return {
      ok: true,
      actions: page.actions,
      nextCursor: page.nextCursor,
      snapshot: this.manager.getSnapshot(),
    };
  }

  private expirePendingActionsResponse(input: unknown): DebugExpirePendingActionsResponse {
    const payload = requireRecord(input, "invalid_payload", "debug expire payload must be a JSON object.");
    const at = optionalString(payload, "at");
    if ("at" in payload && at === undefined) {
      throw new ApiHttpError(400, "invalid_payload", "payload.at must be a non-empty ISO date string.");
    }
    if (at && Number.isNaN(Date.parse(at))) {
      throw new ApiHttpError(400, "invalid_payload", "payload.at must be a valid ISO date string.");
    }

    return {
      ok: true,
      event: "notch.debug.pending-actions.expired",
      expiredActions: this.manager.expirePendingActions({
        ...(at ? { at } : {}),
      }),
      snapshot: this.manager.getSnapshot(),
    };
  }

  private ingestEnvelope(envelope: ProtocolEnvelope<string, unknown>): EnvelopeIngestionResponse {
    switch (envelope.event) {
      case "notch.session.upserted": {
        const payload = requireRecord(envelope.payload, "invalid_payload", "session upsert payload is required.");
        const session = requireRecord(payload.session, "invalid_payload", "payload.session is required.");
        requireString(session, "id", "invalid_payload", "payload.session.id is required.");
        const result = this.manager.upsertSession(session as unknown as Session);
        return this.ok(envelope.event, { session: result });
      }

      case "notch.session.ended": {
        const payload = requireRecord(envelope.payload, "invalid_payload", "session ended payload is required.");
        const sessionId = requireString(payload, "sessionId", "invalid_payload", "payload.sessionId is required.");
        const state = requireString(payload, "state", "invalid_payload", "payload.state is required.");
        if (!["completed", "failed"].includes(state)) {
          throw new ApiHttpError(400, "invalid_payload", "payload.state must be completed or failed.");
        }

        const exitCode = typeof payload.exitCode === "number" ? payload.exitCode : undefined;
        const endReason = typeof payload.reason === "string" ? payload.reason : undefined;
        const metadata: { exitCode?: number; endReason?: string } = {};
        if (exitCode !== undefined) metadata.exitCode = exitCode;
        if (endReason) metadata.endReason = endReason;
        const result = this.completeSessionEnd(sessionId, state as "completed" | "failed", metadata);
        if (!result) {
          throw new ApiHttpError(404, "session_not_found", `No session found for ${sessionId}.`);
        }
        return this.ok(envelope.event, {
          session: result,
          exitCode,
          reason: endReason,
        });
      }

      case "notch.event.created": {
        const payload = requireRecord(envelope.payload, "invalid_payload", "event created payload is required.");
        const event = requireRecord(payload.event, "invalid_payload", "payload.event is required.");
        requireString(event, "sessionId", "invalid_payload", "payload.event.sessionId is required.");
        const type = requireString(event, "type", "invalid_payload", "payload.event.type is required.");
        if (!["risk", "confirm", "result", "error"].includes(type)) {
          throw new ApiHttpError(400, "invalid_payload", "payload.event.type is invalid.");
        }
        const result = this.manager.ingestEvent(event as unknown as MockNotchEventInput);
        return this.ok(envelope.event, { event: result });
      }

      case "notch.action.requested": {
        const payload = requireRecord(envelope.payload, "invalid_payload", "action request payload is required.");
        requireString(payload, "requestId", "invalid_payload", "payload.requestId is required.");
        requireString(payload, "eventId", "invalid_payload", "payload.eventId is required.");
        requireString(payload, "actionId", "invalid_payload", "payload.actionId is required.");
        const result = this.manager.requestAction(payload as unknown as ActionRequestPayload);
        const resultEnvelope = this.createEnvelope("notch.action.result", result, {
          correlationId: envelope.correlationId ?? result.requestId,
        });
        return this.ok(envelope.event, { envelope: resultEnvelope });
      }

      case "notch.debug.injected": {
        const payload = requireRecord(envelope.payload, "invalid_payload", "debug payload is required.");
        const scenario = requireString(payload, "scenario", "invalid_payload", "payload.scenario is required.");
        if (!SUPPORTED_DEBUG_SCENARIOS.has(scenario as DebugScenario)) {
          throw new ApiHttpError(400, "invalid_payload", "payload.scenario is invalid.");
        }

        this.manager.injectScenario(scenario as DebugScenario);

        if (Array.isArray(payload.sessions)) {
          for (const session of payload.sessions) {
            this.manager.upsertSession(session as Session);
          }
        }
        if (Array.isArray(payload.events)) {
          for (const event of payload.events) {
            this.manager.ingestEvent(event as MockNotchEventInput);
          }
        }

        return this.ok(envelope.event, { snapshot: this.manager.getSnapshot() });
      }

      default:
        throw new ApiHttpError(422, "unsupported_event", `Unsupported envelope event: ${envelope.event}.`);
    }
  }

  private completeSessionEnd(
    sessionId: string,
    state: Extract<Session["state"], "completed" | "failed">,
    metadata: { exitCode?: number; endReason?: string } = {}
  ): Session | null {
    const result = this.manager.endSession(sessionId, state, metadata);
    if (!result) return null;

    const ownership = this.manager.getProcessOwnership(sessionId);
    if (ownership) {
      this.manager.registerProcessOwnership({
        ...ownership,
        active: false,
      });
    }
    if (this.processSupervisor instanceof LocalProcessSupervisor) {
      this.processSupervisor.handleSessionEnded(sessionId, {
        state,
        ...(metadata.exitCode !== undefined ? { exitCode: metadata.exitCode } : {}),
        ...(metadata.endReason ? { endReason: metadata.endReason } : {}),
      });
    }
    return result;
  }

  private registerProcess(input: unknown): EnvelopeIngestionResponse {
    const payload = requireRecord(
      input,
      "invalid_process_registration",
      "Process registration payload is required."
    );
    const sessionId = requireString(
      payload,
      "sessionId",
      "invalid_process_registration",
      "sessionId is required."
    );
    const runId = requireString(payload, "runId", "invalid_process_registration", "runId is required.");
    const adapterId = requireString(
      payload,
      "adapterId",
      "invalid_process_registration",
      "adapterId is required."
    );
    const cwd = requireString(payload, "cwd", "invalid_process_registration", "cwd is required.");
    const command = requireString(
      payload,
      "command",
      "invalid_process_registration",
      "command is required."
    );
    const launchProfileHash = requireString(
      payload,
      "launchProfileHash",
      "invalid_process_registration",
      "launchProfileHash is required."
    );
    const supervisorTokenHash = requireString(
      payload,
      "supervisorTokenHash",
      "invalid_process_registration",
      "supervisorTokenHash is required."
    );

    const session = this.manager.getSnapshot().sessions.find((item) => item.id === sessionId);
    if (!session) {
      throw new ApiHttpError(404, "session_not_found", `No session found for ${sessionId}.`);
    }
    if (session.sourceMode !== "live" && session.sourceMode !== "wrapper") {
      throw new ApiHttpError(
        400,
        "invalid_process_registration",
        "Only live or wrapper sessions can register process metadata."
      );
    }

    const capabilities = processCapabilitiesFrom(payload.capabilities);
    const commandHash = optionalString(payload, "commandHash");
    const executable = optionalString(payload, "executable");
    const args = optionalStringArray(payload, "args");
    const source = optionalString(payload, "source");
    const controlEndpoint = optionalString(payload, "controlEndpoint");
    const controlToken = optionalString(payload, "controlToken");
    const pid = optionalNumber(payload, "pid");
    const processStartedAt = optionalString(payload, "processStartedAt");
    const riskReplayMode = riskReplayModeFrom(payload.riskReplayMode);
    let validatedControlEndpoint: string | undefined;
    if (controlEndpoint || controlToken) {
      if (!controlEndpoint || !controlToken) {
        throw new ApiHttpError(
          400,
          "invalid_process_registration",
          "controlEndpoint and controlToken must be provided together."
        );
      }
      validatedControlEndpoint = validateLocalControlEndpoint(controlEndpoint);
    }

    const launchProfile = this.manager.registerRetryLaunchProfile({
      sessionId,
      adapterId,
      cwd,
      command,
      launchProfileHash,
      ...(source ? { source } : {}),
      ...(executable ? { executable } : {}),
      ...(commandHash ? { commandHash } : {}),
      ...(args ? { args } : {}),
      capabilities,
      riskReplayMode,
    });
    const ownership = this.manager.registerProcessOwnership({
      sessionId,
      runId,
      adapterId,
      cwd,
      launchProfileHash,
      supervisorTokenHash,
      ...(pid !== undefined ? { pid } : {}),
      ...(processStartedAt ? { processStartedAt } : {}),
      ...(commandHash ? { commandHash } : {}),
      capabilities,
    });

    if (validatedControlEndpoint && controlToken) {
      if (this.processSupervisor instanceof LocalProcessSupervisor) {
        this.processSupervisor.registerAdapterControl({
          sessionId,
          runId,
          launchProfileHash,
          supervisorTokenHash,
          endpoint: validatedControlEndpoint,
          token: controlToken,
          registeredAt: this.clock(),
        });
      }
    }

    return this.ok(PROCESS_REGISTRATION_EVENT, {
      registration: {
        sessionId,
        runId: ownership.runId,
        launchProfileHash: launchProfile.launchProfileHash,
        commandHash: launchProfile.commandHash,
        capabilities: launchProfile.capabilities,
      },
    });
  }

  private ok(event: string, result?: unknown): EnvelopeIngestionResponse {
    const response: EnvelopeIngestionResponse = {
      ok: true,
      event,
      snapshot: this.manager.getSnapshot(),
    };
    if (result !== undefined) response.result = result;
    return response;
  }

  private createEnvelope<TEvent extends string, TPayload>(
    event: TEvent,
    payload: TPayload,
    options: { correlationId?: string } = {}
  ): ProtocolEnvelope<TEvent, TPayload> {
    const source: ProtocolSource = {
      kind: "manager",
      name: this.serviceName,
    };
    const envelope: ProtocolEnvelope<TEvent, TPayload> = {
      protocol: PROTOCOL_NAME,
      version: 1,
      id: `api_msg_${(this.messageCount += 1).toString().padStart(4, "0")}`,
      event,
      ts: this.clock(),
      source,
      payload,
    };
    if (options.correlationId) envelope.correlationId = options.correlationId;
    return envelope;
  }

  private openSse(req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(200, {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
    });
    res.write(": connected\n\n");

    this.sseClients.add(res);
    const connectedAt = this.clock();
    req.on("close", () => {
      this.sseClients.delete(res);
      this.logger.info("sse client disconnected", {
        connectedAt,
        activeClients: this.sseClients.size,
      });
    });
  }

  private broadcastSnapshot(snapshot: ManagerSnapshot): void {
    if (this.sseClients.size === 0) return;

    const envelope = this.createEnvelope("notch.snapshot.updated", { snapshot });
    const message = `event: notch.snapshot.updated\ndata: ${JSON.stringify(envelope)}\n\n`;
    for (const client of [...this.sseClients]) {
      client.write(message);
    }
  }

  private writeError(res: ServerResponse, error: unknown): void {
    if (res.headersSent) {
      res.end();
      return;
    }

    if (error instanceof ApiHttpError) {
      const body: JsonErrorResponse = {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
        },
      };
      if (error.details !== undefined) body.error.details = error.details;
      writeJson(res, error.status, body);
      return;
    }

    const message = error instanceof Error ? error.message : "Unknown server error.";
    writeJson(res, 500, {
      ok: false,
      error: {
        code: "internal_error",
        message,
      },
    });
  }
}

export function createLocalManagerApi(options?: LocalManagerApiOptions): LocalManagerApiServer {
  return new LocalManagerApiServer(options);
}
