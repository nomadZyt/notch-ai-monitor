import { createServer } from "node:http";
import { URL } from "node:url";
import { createMockLocalAgentManager, } from "@notch-ai-monitor/local-manager-mock";
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
const PROCESS_CAPABILITIES = new Set([
    "process.retry",
    "process.terminate",
]);
const RISK_REPLAY_MODES = new Set(["required", "approved"]);
const EVENT_STATUSES = new Set(["active", "resolved", "ignored", "expired"]);
const EVENT_TYPES = new Set(["risk", "confirm", "result", "error"]);
const PENDING_ACTION_STATUSES = new Set([
    "waiting_confirmation",
    "queued",
    "in_progress",
    "completed",
    "failed",
    "rejected",
    "noop",
    "expired",
]);
const SUPPORTED_DEBUG_SCENARIOS = new Set([
    "idle",
    "waiting",
    "result",
    "error",
    "risk",
    "all",
]);
class ApiHttpError extends Error {
    status;
    code;
    details;
    constructor(status, code, message, details) {
        super(message);
        this.name = "ApiHttpError";
        this.status = status;
        this.code = code;
        if (details !== undefined)
            this.details = details;
    }
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function requireRecord(value, code, message) {
    if (!isRecord(value))
        throw new ApiHttpError(400, code, message);
    return value;
}
function requireString(record, key, code, message) {
    const value = record[key];
    if (typeof value !== "string" || value.length === 0) {
        throw new ApiHttpError(400, code, message);
    }
    return value;
}
function optionalString(record, key) {
    const value = record[key];
    return typeof value === "string" && value.length > 0 ? value : undefined;
}
function optionalQueryString(url, key) {
    const value = url.searchParams.get(key);
    return value && value.length > 0 ? value : undefined;
}
function optionalQueryLimit(url) {
    const value = optionalQueryString(url, "limit");
    if (!value)
        return undefined;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
        throw new ApiHttpError(400, "invalid_query", "limit must be a positive integer.");
    }
    return Math.min(100, parsed);
}
function optionalEventStatus(url) {
    const value = optionalQueryString(url, "status");
    if (!value)
        return undefined;
    if (!EVENT_STATUSES.has(value)) {
        throw new ApiHttpError(400, "invalid_query", "status is not a supported event status.");
    }
    return value;
}
function optionalEventType(url) {
    const value = optionalQueryString(url, "type");
    if (!value)
        return undefined;
    if (!EVENT_TYPES.has(value)) {
        throw new ApiHttpError(400, "invalid_query", "type is not a supported event type.");
    }
    return value;
}
function optionalPendingActionStatus(url) {
    const value = optionalQueryString(url, "status");
    if (!value)
        return undefined;
    if (!PENDING_ACTION_STATUSES.has(value)) {
        throw new ApiHttpError(400, "invalid_query", "status is not a supported action request status.");
    }
    return value;
}
function optionalNumber(record, key) {
    const value = record[key];
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
function optionalStringArray(record, key) {
    const value = record[key];
    if (value === undefined)
        return undefined;
    if (!Array.isArray(value)) {
        throw new ApiHttpError(400, "invalid_process_registration", `${key} must be an array of strings.`);
    }
    if (!value.every((item) => typeof item === "string")) {
        throw new ApiHttpError(400, "invalid_process_registration", `${key} must be an array of strings.`);
    }
    return value.map((item) => item);
}
function processCapabilitiesFrom(value) {
    if (value === undefined)
        return ["process.retry", "process.terminate"];
    if (!Array.isArray(value)) {
        throw new ApiHttpError(400, "invalid_process_registration", "capabilities must be an array.");
    }
    const capabilities = [];
    for (const item of value) {
        if (!PROCESS_CAPABILITIES.has(item)) {
            throw new ApiHttpError(400, "invalid_process_registration", "capabilities contains an unsupported value.");
        }
        if (!capabilities.includes(item)) {
            capabilities.push(item);
        }
    }
    return capabilities;
}
function riskReplayModeFrom(value) {
    if (value === undefined)
        return "required";
    if (!RISK_REPLAY_MODES.has(value)) {
        throw new ApiHttpError(400, "invalid_process_registration", "riskReplayMode is invalid.");
    }
    return value;
}
function validateLocalControlEndpoint(value) {
    let url;
    try {
        url = new URL(value);
    }
    catch {
        throw new ApiHttpError(400, "invalid_process_registration", "controlEndpoint must be a valid URL.");
    }
    if (url.protocol !== "http:" || url.hostname !== "127.0.0.1") {
        throw new ApiHttpError(400, "invalid_process_registration", "controlEndpoint must use http://127.0.0.1.");
    }
    return url.href;
}
function validateEnvelope(input) {
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
    return envelope;
}
function writeJson(res, status, body) {
    res.writeHead(status, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Content-Type": "application/json; charset=utf-8",
    });
    res.end(JSON.stringify(body));
}
async function readJsonBody(req) {
    const chunks = [];
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
        return JSON.parse(text);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unable to parse JSON.";
        throw new ApiHttpError(400, "invalid_json", "Request body is not valid JSON.", message);
    }
}
async function readOptionalJsonBody(req) {
    const chunks = [];
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
    if (text.trim().length === 0)
        return {};
    try {
        return JSON.parse(text);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unable to parse JSON.";
        throw new ApiHttpError(400, "invalid_json", "Request body is not valid JSON.", message);
    }
}
function getPortFromAddress(address) {
    if (!address || typeof address === "string")
        return 0;
    return address.port;
}
const NOOP_LOGGER = {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
};
function normalizePendingActionSweepIntervalMs(value) {
    if (value === undefined || value === null || value === 0)
        return null;
    if (!Number.isFinite(value) || value < 0) {
        throw new Error("pendingActionSweepIntervalMs must be a non-negative finite number.");
    }
    return value;
}
export class LocalManagerApiServer {
    manager;
    server;
    clock;
    logger;
    serviceName;
    pendingActionSweepIntervalMs;
    processSupervisor;
    unsubscribeManager;
    sseClients = new Set();
    pendingActionSweepTimer = null;
    messageCount = 0;
    listening = false;
    constructor(options = {}) {
        this.clock = options.clock ?? (() => new Date().toISOString());
        this.logger = options.logger ?? NOOP_LOGGER;
        this.serviceName = options.serviceName ?? "local-manager-api";
        this.pendingActionSweepIntervalMs = normalizePendingActionSweepIntervalMs(options.pendingActionSweepIntervalMs);
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
    listen(port = 4317, host = "127.0.0.1") {
        return new Promise((resolve, reject) => {
            const onError = (error) => {
                this.server.off("listening", onListening);
                reject(error);
            };
            const onListening = () => {
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
    close() {
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
        if (!this.listening)
            return Promise.resolve();
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
    startPendingActionSweepScheduler() {
        if (this.pendingActionSweepIntervalMs === null || this.pendingActionSweepTimer)
            return;
        this.runPendingActionSweep();
        this.pendingActionSweepTimer = setInterval(() => {
            this.runPendingActionSweep();
        }, this.pendingActionSweepIntervalMs);
    }
    stopPendingActionSweepScheduler() {
        if (!this.pendingActionSweepTimer)
            return;
        clearInterval(this.pendingActionSweepTimer);
        this.pendingActionSweepTimer = null;
    }
    runPendingActionSweep() {
        return this.manager.expirePendingActions({ at: this.clock() });
    }
    async handle(req, res) {
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
            if (url.pathname === "/health" ||
                url.pathname === "/v1/snapshot" ||
                url.pathname === EVENT_HISTORY_PATH ||
                url.pathname === ACTION_REQUESTS_PATH ||
                url.pathname === "/v1/events") {
                throw new ApiHttpError(405, "method_not_allowed", `Method ${req.method ?? "UNKNOWN"} is not allowed.`);
            }
            if (url.pathname === "/v1/envelopes" ||
                url.pathname === PROCESS_REGISTRATION_PATH ||
                url.pathname === "/v1/debug/reset" ||
                url.pathname === DEBUG_EXPIRE_PENDING_ACTIONS_PATH) {
                throw new ApiHttpError(405, "method_not_allowed", `Method ${req.method ?? "UNKNOWN"} is not allowed.`);
            }
            throw new ApiHttpError(404, "not_found", `No route for ${req.method ?? "UNKNOWN"} ${url.pathname}.`);
        }
        catch (error) {
            this.logRequestFailure(req, error);
            this.writeError(res, error);
        }
    }
    logRequestFailure(req, error) {
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        if (url.pathname !== PROCESS_REGISTRATION_PATH)
            return;
        const code = error instanceof ApiHttpError ? error.code : "internal_error";
        const message = error instanceof Error ? error.message : "Unknown adapter registration failure.";
        this.logger.warn("adapter registration failed", {
            method: req.method ?? "UNKNOWN",
            path: url.pathname,
            code,
            message,
        });
    }
    eventHistoryResponse(url) {
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
    actionRequestsResponse(url) {
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
    expirePendingActionsResponse(input) {
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
    ingestEnvelope(envelope) {
        switch (envelope.event) {
            case "notch.session.upserted": {
                const payload = requireRecord(envelope.payload, "invalid_payload", "session upsert payload is required.");
                const session = requireRecord(payload.session, "invalid_payload", "payload.session is required.");
                requireString(session, "id", "invalid_payload", "payload.session.id is required.");
                const result = this.manager.upsertSession(session);
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
                const metadata = {};
                if (exitCode !== undefined)
                    metadata.exitCode = exitCode;
                if (endReason)
                    metadata.endReason = endReason;
                const result = this.completeSessionEnd(sessionId, state, metadata);
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
                const result = this.manager.ingestEvent(event);
                return this.ok(envelope.event, { event: result });
            }
            case "notch.action.requested": {
                const payload = requireRecord(envelope.payload, "invalid_payload", "action request payload is required.");
                requireString(payload, "requestId", "invalid_payload", "payload.requestId is required.");
                requireString(payload, "eventId", "invalid_payload", "payload.eventId is required.");
                requireString(payload, "actionId", "invalid_payload", "payload.actionId is required.");
                const result = this.manager.requestAction(payload);
                const resultEnvelope = this.createEnvelope("notch.action.result", result, {
                    correlationId: envelope.correlationId ?? result.requestId,
                });
                return this.ok(envelope.event, { envelope: resultEnvelope });
            }
            case "notch.debug.injected": {
                const payload = requireRecord(envelope.payload, "invalid_payload", "debug payload is required.");
                const scenario = requireString(payload, "scenario", "invalid_payload", "payload.scenario is required.");
                if (!SUPPORTED_DEBUG_SCENARIOS.has(scenario)) {
                    throw new ApiHttpError(400, "invalid_payload", "payload.scenario is invalid.");
                }
                this.manager.injectScenario(scenario);
                if (Array.isArray(payload.sessions)) {
                    for (const session of payload.sessions) {
                        this.manager.upsertSession(session);
                    }
                }
                if (Array.isArray(payload.events)) {
                    for (const event of payload.events) {
                        this.manager.ingestEvent(event);
                    }
                }
                return this.ok(envelope.event, { snapshot: this.manager.getSnapshot() });
            }
            default:
                throw new ApiHttpError(422, "unsupported_event", `Unsupported envelope event: ${envelope.event}.`);
        }
    }
    completeSessionEnd(sessionId, state, metadata = {}) {
        const result = this.manager.endSession(sessionId, state, metadata);
        if (!result)
            return null;
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
    registerProcess(input) {
        const payload = requireRecord(input, "invalid_process_registration", "Process registration payload is required.");
        const sessionId = requireString(payload, "sessionId", "invalid_process_registration", "sessionId is required.");
        const runId = requireString(payload, "runId", "invalid_process_registration", "runId is required.");
        const adapterId = requireString(payload, "adapterId", "invalid_process_registration", "adapterId is required.");
        const cwd = requireString(payload, "cwd", "invalid_process_registration", "cwd is required.");
        const command = requireString(payload, "command", "invalid_process_registration", "command is required.");
        const launchProfileHash = requireString(payload, "launchProfileHash", "invalid_process_registration", "launchProfileHash is required.");
        const supervisorTokenHash = requireString(payload, "supervisorTokenHash", "invalid_process_registration", "supervisorTokenHash is required.");
        const session = this.manager.getSnapshot().sessions.find((item) => item.id === sessionId);
        if (!session) {
            throw new ApiHttpError(404, "session_not_found", `No session found for ${sessionId}.`);
        }
        if (session.sourceMode !== "live" && session.sourceMode !== "wrapper") {
            throw new ApiHttpError(400, "invalid_process_registration", "Only live or wrapper sessions can register process metadata.");
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
        let validatedControlEndpoint;
        if (controlEndpoint || controlToken) {
            if (!controlEndpoint || !controlToken) {
                throw new ApiHttpError(400, "invalid_process_registration", "controlEndpoint and controlToken must be provided together.");
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
    ok(event, result) {
        const response = {
            ok: true,
            event,
            snapshot: this.manager.getSnapshot(),
        };
        if (result !== undefined)
            response.result = result;
        return response;
    }
    createEnvelope(event, payload, options = {}) {
        const source = {
            kind: "manager",
            name: this.serviceName,
        };
        const envelope = {
            protocol: PROTOCOL_NAME,
            version: 1,
            id: `api_msg_${(this.messageCount += 1).toString().padStart(4, "0")}`,
            event,
            ts: this.clock(),
            source,
            payload,
        };
        if (options.correlationId)
            envelope.correlationId = options.correlationId;
        return envelope;
    }
    openSse(req, res) {
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
    broadcastSnapshot(snapshot) {
        if (this.sseClients.size === 0)
            return;
        const envelope = this.createEnvelope("notch.snapshot.updated", { snapshot });
        const message = `event: notch.snapshot.updated\ndata: ${JSON.stringify(envelope)}\n\n`;
        for (const client of [...this.sseClients]) {
            client.write(message);
        }
    }
    writeError(res, error) {
        if (res.headersSent) {
            res.end();
            return;
        }
        if (error instanceof ApiHttpError) {
            const body = {
                ok: false,
                error: {
                    code: error.code,
                    message: error.message,
                },
            };
            if (error.details !== undefined)
                body.error.details = error.details;
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
export function createLocalManagerApi(options) {
    return new LocalManagerApiServer(options);
}
