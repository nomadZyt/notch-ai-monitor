#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const apiBin = path.join(repoRoot, "packages/local-manager-api/dist/src/bin/server.js");
const notchRunBin = path.join(repoRoot, "packages/cli-adapter-real/dist/src/bin/notch-run.js");

function parsePositiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

function parseArgs(argv) {
  const options = {
    apiUrl: process.env.NOTCH_LOCAL_MANAGER_URL,
    pendingActionTimeoutMs: 1200,
    pendingActionSweepIntervalMs: 200,
    timeoutChildExitDelayMs: 4000,
    waitMs: 10000,
    verbose: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if ((arg === "--url" || arg === "--api-url") && next) {
      options.apiUrl = next;
      index += 1;
    } else if (arg === "--pending-action-timeout-ms" && next) {
      options.pendingActionTimeoutMs = parsePositiveInteger(next, "--pending-action-timeout-ms");
      index += 1;
    } else if (arg === "--pending-action-sweep-interval-ms" && next) {
      options.pendingActionSweepIntervalMs = parsePositiveInteger(next, "--pending-action-sweep-interval-ms");
      index += 1;
    } else if (arg === "--timeout-child-exit-delay-ms" && next) {
      options.timeoutChildExitDelayMs = parsePositiveInteger(next, "--timeout-child-exit-delay-ms");
      index += 1;
    } else if (arg === "--wait-ms" && next) {
      options.waitMs = parsePositiveInteger(next, "--wait-ms");
      index += 1;
    } else if (arg === "--verbose") {
      options.verbose = true;
    } else {
      throw new Error(`Unknown real-link smoke argument: ${arg}`);
    }
  }

  if (options.timeoutChildExitDelayMs <= options.pendingActionTimeoutMs) {
    throw new Error("--timeout-child-exit-delay-ms must be greater than --pending-action-timeout-ms.");
  }

  return options;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function requestJson(baseUrl, pathName, init = {}) {
  const url = new URL(pathName, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
    ...init,
  });
  const body = await response.json().catch(() => undefined);
  if (!response.ok) {
    const message =
      isRecord(body) && isRecord(body.error) && typeof body.error.message === "string"
        ? body.error.message
        : `HTTP ${response.status}`;
    throw new Error(`${init.method ?? "GET"} ${url.href} failed: ${message}`);
  }
  return body;
}

async function waitFor(label, predicate, waitMs) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < waitMs) {
    try {
      const value = await predicate();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const suffix = lastError instanceof Error ? ` Last error: ${lastError.message}` : "";
  throw new Error(`Timed out waiting for ${label}.${suffix}`);
}

function startProcess(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (chunk) => {
    const text = String(chunk);
    stdout += text;
    if (options.verbose) process.stdout.write(text);
  });
  child.stderr?.on("data", (chunk) => {
    const text = String(chunk);
    stderr += text;
    if (options.verbose) process.stderr.write(text);
  });
  const exit = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
  return {
    child,
    exit,
    get stdout() {
      return stdout;
    },
    get stderr() {
      return stderr;
    },
  };
}

async function startTemporaryApi(options) {
  const tempDir = await mkdtemp(path.join(tmpdir(), "notch-real-link-smoke-"));
  const eventHistoryFile = path.join(tempDir, "event-history.json");
  const api = startProcess(
    process.execPath,
    [
      apiBin,
      "--host",
      "127.0.0.1",
      "--port",
      "0",
      "--process-side-effects",
      "supervised",
      "--event-history-persistence-file",
      eventHistoryFile,
      "--pending-action-timeout-ms",
      String(options.pendingActionTimeoutMs),
      "--pending-action-sweep-interval-ms",
      String(options.pendingActionSweepIntervalMs),
    ],
    { verbose: options.verbose }
  );

  try {
    const apiUrl = await waitFor(
      "temporary Local Manager API startup",
      () => {
        const match = api.stdout.match(/listening at (http:\/\/127\.0\.0\.1:\d+)/);
        return match?.[1] ?? null;
      },
      options.waitMs
    );

    await requestJson(apiUrl, "/health");

    return {
      apiUrl,
      stop: async () => {
        api.child.kill("SIGTERM");
        await api.exit;
        await rm(tempDir, { recursive: true, force: true });
      },
    };
  } catch (error) {
    api.child.kill("SIGTERM");
    await api.exit.catch(() => {});
    await rm(tempDir, { recursive: true, force: true });
    throw error;
  }
}

function createActionEnvelope(payload) {
  return {
    protocol: "notch-ai-monitor",
    version: 1,
    id: `real_link_smoke_${Date.now().toString(36)}_${payload.requestId}`,
    event: "notch.action.requested",
    ts: new Date().toISOString(),
    source: {
      kind: "ui",
      name: "real-link-beta-smoke",
    },
    correlationId: payload.requestId,
    payload,
  };
}

async function requestAction(baseUrl, payload) {
  const body = await requestJson(baseUrl, "/v1/envelopes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(createActionEnvelope(payload)),
  });
  const result = body?.result?.envelope?.payload;
  if (!isRecord(result) || result.requestId !== payload.requestId) {
    throw new Error("POST /v1/envelopes did not return the expected action result.");
  }
  return { body, result };
}

function startNotchRun(baseUrl, label, terminateExitDelayMs, verbose) {
  const childCode = [
    `console.error(${JSON.stringify(`Error: ${label} active`)});`,
    "process.on('SIGTERM', () => {",
    `  setTimeout(() => process.exit(0), ${terminateExitDelayMs});`,
    "});",
    "setInterval(() => {}, 1000);",
  ].join("\n");

  return startProcess(
    process.execPath,
    [
      notchRunBin,
      "--url",
      baseUrl,
      "--profile",
      "codex-cli",
      "--cwd",
      repoRoot,
      "--",
      process.execPath,
      "-e",
      childCode,
    ],
    { verbose }
  );
}

async function findSmokeEvent(baseUrl, label, waitMs) {
  return waitFor(
    `${label} event`,
    async () => {
      const body = await requestJson(baseUrl, "/v1/snapshot");
      const snapshot = body.snapshot;
      const event = snapshot.events.find((item) => item.summary === `Error: ${label} active`);
      if (!event) return null;
      const session = snapshot.sessions.find((item) => item.id === event.sessionId);
      if (!session || session.sourceMode !== "live" || session.state !== "running") return null;
      return { event, session, snapshot };
    },
    waitMs
  );
}

async function pendingAction(baseUrl, eventId, requestId) {
  const body = await requestJson(baseUrl, `/v1/action-requests?eventId=${encodeURIComponent(eventId)}`);
  return body.actions.find((action) => action.requestId === requestId) ?? null;
}

async function runCompletionSmoke(baseUrl, options) {
  await requestJson(baseUrl, "/v1/debug/reset", { method: "POST" });
  const label = "real link completion smoke";
  const notchRun = startNotchRun(baseUrl, label, 100, options.verbose);
  let finished = false;

  try {
    const { event, session } = await findSmokeEvent(baseUrl, label, options.waitMs);

    const waitingRequestId = "real_link_completion_waiting_confirmation";
    const waiting = await requestAction(baseUrl, {
      requestId: waitingRequestId,
      eventId: event.id,
      actionId: "terminate",
    });
    if (waiting.result.status !== "needs_confirmation") {
      throw new Error(`Expected needs_confirmation, got ${waiting.result.status}.`);
    }
    const waitingPending = await pendingAction(baseUrl, event.id, waitingRequestId);
    if (!waitingPending || waitingPending.status !== "waiting_confirmation") {
      throw new Error("Expected waiting_confirmation pending action before confirmed terminate.");
    }

    const confirmedRequestId = "real_link_completion_confirmed";
    const accepted = await requestAction(baseUrl, {
      requestId: confirmedRequestId,
      eventId: event.id,
      actionId: "terminate",
      confirmed: true,
    });
    if (accepted.result.status !== "accepted") {
      throw new Error(`Expected accepted terminate, got ${accepted.result.status}.`);
    }
    if (accepted.result.effects?.[0]?.mocked !== false) {
      throw new Error("Expected real adapter control effect with mocked=false.");
    }
    const inProgress = await pendingAction(baseUrl, event.id, confirmedRequestId);
    if (!inProgress || inProgress.status !== "in_progress" || inProgress.mocked !== false) {
      throw new Error("Expected confirmed terminate pending action to be in_progress and mocked=false.");
    }
    const superseded = await pendingAction(baseUrl, event.id, waitingRequestId);
    if (superseded) {
      throw new Error("Expected confirmed terminate to supersede waiting confirmation projection.");
    }

    const exit = await notchRun.exit;
    finished = true;
    if (exit.code !== 0) {
      throw new Error(`notch-run completion child exited with code ${exit.code}, signal ${exit.signal}.`);
    }

    const completed = await waitFor(
      "completed pending action",
      () =>
        pendingAction(baseUrl, event.id, confirmedRequestId).then(
          (action) => action?.status === "completed" && action
        ),
      options.waitMs
    );
    const snapshot = (await requestJson(baseUrl, "/v1/snapshot")).snapshot;
    const completedEvent = snapshot.events.find((item) => item.id === event.id);
    if (completedEvent?.status !== "resolved" || completedEvent.resolution !== "terminate_graceful_completed") {
      throw new Error("Expected completion event to be resolved by terminate_graceful_completed.");
    }

    return {
      eventId: event.id,
      sessionId: session.id,
      pendingStatus: completed.status,
      eventStatus: completedEvent.status,
      resolution: completedEvent.resolution,
    };
  } finally {
    if (!finished) notchRun.child.kill("SIGTERM");
  }
}

async function runTimeoutSmoke(baseUrl, options) {
  await requestJson(baseUrl, "/v1/debug/reset", { method: "POST" });
  const label = "real link timeout smoke";
  const notchRun = startNotchRun(baseUrl, label, options.timeoutChildExitDelayMs, options.verbose);
  let finished = false;

  try {
    const { event, session } = await findSmokeEvent(baseUrl, label, options.waitMs);

    const requestId = "real_link_timeout_confirmed";
    const accepted = await requestAction(baseUrl, {
      requestId,
      eventId: event.id,
      actionId: "terminate",
      confirmed: true,
    });
    if (accepted.result.status !== "accepted") {
      throw new Error(`Expected accepted timeout terminate, got ${accepted.result.status}.`);
    }
    const inProgress = await pendingAction(baseUrl, event.id, requestId);
    if (!inProgress || inProgress.status !== "in_progress" || inProgress.mocked !== false) {
      throw new Error("Expected timeout terminate pending action to start as in_progress and mocked=false.");
    }

    const expired = await waitFor(
      "scheduler-expired pending action",
      () => pendingAction(baseUrl, event.id, requestId).then((action) => action?.status === "expired" && action),
      options.waitMs
    );
    if (expired.resultStatus !== "failed" || expired.errorCode !== "pending_action_timeout") {
      throw new Error("Expected expired pending action to have failed resultStatus and pending_action_timeout errorCode.");
    }

    const exit = await notchRun.exit;
    finished = true;
    if (exit.code !== 0) {
      throw new Error(`notch-run timeout child exited with code ${exit.code}, signal ${exit.signal}.`);
    }

    const lateAction = await pendingAction(baseUrl, event.id, requestId);
    const snapshot = (await requestJson(baseUrl, "/v1/snapshot")).snapshot;
    const activeEvent = snapshot.events.find((item) => item.id === event.id);
    if (lateAction?.status !== "expired") {
      throw new Error("Expected late session ended not to overwrite expired pending action.");
    }
    if (activeEvent?.status !== "active") {
      throw new Error("Expected timeout event to remain active after late session ended.");
    }

    return {
      eventId: event.id,
      sessionId: session.id,
      pendingStatus: lateAction.status,
      resultStatus: lateAction.resultStatus,
      eventStatus: activeEvent.status,
      errorCode: lateAction.errorCode,
    };
  } finally {
    if (!finished) notchRun.child.kill("SIGTERM");
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  let temporaryApi;
  const baseUrl = options.apiUrl;
  let apiUrl = baseUrl;

  if (!apiUrl) {
    temporaryApi = await startTemporaryApi(options);
    apiUrl = temporaryApi.apiUrl;
  } else {
    await requestJson(apiUrl, "/health");
  }

  try {
    const completion = await runCompletionSmoke(apiUrl, options);
    const timeout = await runTimeoutSmoke(apiUrl, options);
    console.log(
      JSON.stringify(
        {
          mode: "real-link-beta-smoke",
          ok: true,
          apiUrl,
          temporaryApi: Boolean(temporaryApi),
          pendingActionTimeoutMs: temporaryApi ? options.pendingActionTimeoutMs : null,
          pendingActionSweepIntervalMs: temporaryApi ? options.pendingActionSweepIntervalMs : null,
          completion,
          timeout,
        },
        null,
        2
      )
    );
  } finally {
    await temporaryApi?.stop();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
