import type {
  Action,
  ActionRequestPayload,
  ActionResultPayload,
  ActionResultStatus,
  EventStatus,
  ManagerSnapshot,
  ProtocolEnvelope,
} from "@notch-ai-monitor/shared";

import { DEFAULT_LOCAL_MANAGER_URL } from "../index.js";
import { runNotchRunSmoke } from "./notch-run-smoke.js";

export interface ActionResolutionSmokeOptions {
  baseUrl: string;
  actionId: string;
  prepareFailure: boolean;
  expectedSessionState: "failed";
  expectedExitCode: number;
  expectedEndReason: string;
  expectedResultStatus: ActionResultStatus;
  expectedEventStatus: EventStatus;
  expectedResolvedEventStatus: EventStatus | null;
  expectedActiveEvents: number;
}

let actionSmokeMessageCount = 0;

export function parseActionResolutionSmokeArgs(argv: string[]): ActionResolutionSmokeOptions {
  let baseUrl = process.env.NOTCH_LOCAL_MANAGER_URL ?? DEFAULT_LOCAL_MANAGER_URL;
  let actionId = "ignore";
  let prepareFailure = true;
  let expectedExitCode = 7;
  let expectedEndReason = "exitCode:7";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--url" && next) {
      baseUrl = next;
      index += 1;
    } else if (arg === "--action" && next) {
      actionId = next;
      index += 1;
    } else if (arg === "--expected-exit-code" && next) {
      const parsed = Number(next);
      if (!Number.isInteger(parsed)) {
        throw new Error("--expected-exit-code must be an integer.");
      }
      expectedExitCode = parsed;
      expectedEndReason = `exitCode:${parsed}`;
      index += 1;
    } else if (arg === "--expected-end-reason" && next) {
      expectedEndReason = next;
      index += 1;
    } else if (arg === "--no-prepare") {
      prepareFailure = false;
    } else {
      throw new Error(`Unknown action smoke argument: ${arg}`);
    }
  }

  const expectsNoop = actionId === "view-log";

  return {
    baseUrl,
    actionId,
    prepareFailure,
    expectedSessionState: "failed",
    expectedExitCode,
    expectedEndReason,
    expectedResultStatus: expectsNoop ? "noop" : "completed",
    expectedEventStatus: expectsNoop ? "active" : "ignored",
    expectedResolvedEventStatus: expectsNoop ? null : "ignored",
    expectedActiveEvents: expectsNoop ? 1 : 0,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function requestJson(baseUrl: string, pathName: string, init: RequestInit = {}): Promise<unknown> {
  const url = new URL(pathName, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
    ...init,
  });
  const body = (await response.json().catch(() => undefined)) as unknown;
  if (!response.ok) {
    const message =
      isRecord(body) && isRecord(body.error) && typeof body.error.message === "string"
        ? body.error.message
        : `HTTP ${response.status}`;
    throw new Error(`${init.method ?? "GET"} ${url.href} failed: ${message}`);
  }
  return body;
}

function snapshotFromResponse(body: unknown, context: string): ManagerSnapshot {
  const snapshot = isRecord(body) ? body.snapshot : undefined;
  if (
    !isRecord(snapshot) ||
    !Array.isArray(snapshot.sessions) ||
    !Array.isArray(snapshot.events) ||
    !Array.isArray(snapshot.activeEventIds)
  ) {
    throw new Error(`${context} did not return a valid ManagerSnapshot.`);
  }
  return snapshot as unknown as ManagerSnapshot;
}

function actionResultFromResponse(body: unknown): ActionResultPayload {
  const result = isRecord(body) ? body.result : undefined;
  const envelope = isRecord(result) ? result.envelope : undefined;
  const payload = isRecord(envelope) ? envelope.payload : undefined;
  if (
    !isRecord(envelope) ||
    envelope.event !== "notch.action.result" ||
    !isRecord(payload) ||
    typeof payload.requestId !== "string" ||
    typeof payload.eventId !== "string" ||
    typeof payload.actionId !== "string" ||
    typeof payload.status !== "string" ||
    typeof payload.message !== "string"
  ) {
    throw new Error("POST /v1/envelopes did not return a valid notch.action.result envelope.");
  }
  return payload as unknown as ActionResultPayload;
}

function findAction(actionId: string, actions: readonly Action[], options: ActionResolutionSmokeOptions): Action {
  const action = actions.find((item) => item.id === actionId);
  if (!action) {
    throw new Error(`Smoke failed: active event does not expose action ${actionId}.`);
  }
  if (!action.enabled) {
    throw new Error(`Smoke failed: action ${actionId} is disabled.`);
  }
  if (options.expectedResultStatus === "completed" && !action.resolves) {
    throw new Error(`Smoke failed: action ${actionId} does not resolve events.`);
  }
  if (options.expectedResultStatus === "noop" && action.resolves) {
    throw new Error(`Smoke failed: action ${actionId} should not resolve events for noop smoke.`);
  }
  return action;
}

function validatePreparedSnapshot(snapshot: ManagerSnapshot, options: ActionResolutionSmokeOptions) {
  const activeEvent = snapshot.currentEventId
    ? snapshot.events.find((event) => event.id === snapshot.currentEventId)
    : snapshot.events.find((event) => event.status === "active");
  if (!activeEvent || activeEvent.status !== "active") {
    throw new Error("Smoke failed: no active event found before action request.");
  }

  const session = snapshot.sessions.find((item) => item.id === activeEvent.sessionId);
  if (!session) {
    throw new Error(`Smoke failed: no session found for active event ${activeEvent.id}.`);
  }
  if (session.sourceMode !== "live") {
    throw new Error(`Smoke failed: expected live session, got ${session.sourceMode ?? "unknown"}.`);
  }
  if (session.state !== options.expectedSessionState) {
    throw new Error(`Smoke failed: expected session state ${options.expectedSessionState}, got ${session.state}.`);
  }
  if (session.exitCode !== options.expectedExitCode) {
    throw new Error(`Smoke failed: expected exitCode ${options.expectedExitCode}, got ${session.exitCode}.`);
  }
  if (session.endReason !== options.expectedEndReason) {
    throw new Error(`Smoke failed: expected endReason ${options.expectedEndReason}, got ${session.endReason}.`);
  }

  const action = findAction(options.actionId, activeEvent.actions, options);
  return { activeEvent, session, action };
}

function validateActionSnapshot(snapshot: ManagerSnapshot, options: ActionResolutionSmokeOptions, eventId: string) {
  const event = snapshot.events.find((item) => item.id === eventId);
  if (!event) {
    throw new Error(`Smoke failed: event ${eventId} disappeared after action request.`);
  }
  if (event.status !== options.expectedEventStatus) {
    throw new Error(`Smoke failed: expected event ${eventId} to be ${options.expectedEventStatus}, got ${event.status}.`);
  }
  if (snapshot.counts.activeEvents !== options.expectedActiveEvents) {
    throw new Error(
      `Smoke failed: active event count mismatch. Expected ${options.expectedActiveEvents}, got ${snapshot.counts.activeEvents}.`
    );
  }
  if (options.expectedActiveEvents === 0 && (snapshot.activeEventIds.length !== 0 || snapshot.currentEventId !== null)) {
    throw new Error("Smoke failed: active event queue was not cleared after action request.");
  }
  if (
    options.expectedActiveEvents > 0 &&
    (!snapshot.activeEventIds.includes(eventId) || snapshot.currentEventId !== eventId)
  ) {
    throw new Error("Smoke failed: active event queue did not preserve the noop event.");
  }

  const session = snapshot.sessions.find((item) => item.id === event.sessionId);
  if (!session) {
    throw new Error(`Smoke failed: session ${event.sessionId} disappeared after action request.`);
  }
  if (session.state !== options.expectedSessionState) {
    throw new Error(`Smoke failed: session state changed to ${session.state}.`);
  }
  if (session.exitCode !== options.expectedExitCode) {
    throw new Error(`Smoke failed: session exitCode changed to ${session.exitCode}.`);
  }
  if (session.endReason !== options.expectedEndReason) {
    throw new Error(`Smoke failed: session endReason changed to ${session.endReason}.`);
  }
  return { event, session };
}

function createActionEnvelope(payload: ActionRequestPayload): ProtocolEnvelope<"notch.action.requested", ActionRequestPayload> {
  actionSmokeMessageCount += 1;
  const envelope: ProtocolEnvelope<"notch.action.requested", ActionRequestPayload> = {
    protocol: "notch-ai-monitor",
    version: 1,
    id: `action_smoke_msg_${actionSmokeMessageCount.toString().padStart(4, "0")}`,
    event: "notch.action.requested",
    ts: new Date().toISOString(),
    source: {
      kind: "ui",
      name: "notch-action-smoke",
    },
    correlationId: payload.requestId,
    payload,
  };
  return envelope;
}

export async function runActionResolutionSmoke(argv: string[] = process.argv.slice(2)): Promise<void> {
  const options = parseActionResolutionSmokeArgs(argv);

  await requestJson(options.baseUrl, "/health");
  if (options.prepareFailure) {
    await runNotchRunSmoke(["--url", options.baseUrl, "--preset", "node-exit-7"]);
  }

  const beforeResponse = await requestJson(options.baseUrl, "/v1/snapshot");
  const beforeSnapshot = snapshotFromResponse(beforeResponse, "GET /v1/snapshot");
  const { activeEvent, session, action } = validatePreparedSnapshot(beforeSnapshot, options);
  const requestId = `action_smoke_${Date.now().toString(36)}`;

  const actionEnvelope = createActionEnvelope({
    requestId,
    eventId: activeEvent.id,
    actionId: action.id,
    uiContext: {
      selectedEventId: activeEvent.id,
      panel: "action",
    },
  });

  const actionResponse = await requestJson(options.baseUrl, "/v1/envelopes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(actionEnvelope),
  });
  const actionResult = actionResultFromResponse(actionResponse);
  if (actionResult.requestId !== requestId) {
    throw new Error(`Smoke failed: action result requestId mismatch. Expected ${requestId}, got ${actionResult.requestId}.`);
  }
  if (actionResult.status !== options.expectedResultStatus) {
    throw new Error(
      `Smoke failed: action result status mismatch. Expected ${options.expectedResultStatus}, got ${actionResult.status}.`
    );
  }
  if (options.expectedResolvedEventStatus === null && actionResult.resolvedEventStatus !== undefined) {
    throw new Error(
      `Smoke failed: action resolvedEventStatus should be absent, got ${actionResult.resolvedEventStatus}.`
    );
  }
  if (
    options.expectedResolvedEventStatus !== null &&
    actionResult.resolvedEventStatus !== options.expectedResolvedEventStatus
  ) {
    throw new Error(
      `Smoke failed: action resolvedEventStatus mismatch. Expected ${options.expectedResolvedEventStatus}, got ${actionResult.resolvedEventStatus}.`
    );
  }

  const afterSnapshot = snapshotFromResponse(actionResponse, "POST /v1/envelopes");
  const { event } = validateActionSnapshot(afterSnapshot, options, activeEvent.id);

  console.log(
    JSON.stringify(
      {
        mode: "action-resolution-smoke",
        ok: true,
        prepared: options.prepareFailure,
        actionId: action.id,
        requestId,
        eventId: activeEvent.id,
        eventStatus: event.status,
        resultStatus: actionResult.status,
        resolvedEventStatus: actionResult.resolvedEventStatus ?? null,
        sessionId: session.id,
        sessionState: session.state,
        sessionExitCode: session.exitCode ?? null,
        sessionEndReason: session.endReason ?? null,
        counts: afterSnapshot.counts,
      },
      null,
      2
    )
  );
}
