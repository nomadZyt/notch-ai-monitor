import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, get as httpGet } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createLocalManagerApi,
  JsonFileEventHistoryPersistenceStore,
  JsonFileProcessPersistenceStore,
} from "../dist/src/index.js";

const fixedNow = "2026-06-06T12:00:00+08:00";
let messageCount = 0;

function envelope(event, payload, source = { kind: "debug", name: "api-test" }, extras = {}) {
  messageCount += 1;
  return {
    protocol: "notch-ai-monitor",
    version: 1,
    id: `test_msg_${messageCount.toString().padStart(4, "0")}`,
    event,
    ts: fixedNow,
    source,
    payload,
    ...extras,
  };
}

function session(id = "sess_api_test_001") {
  return {
    id,
    tool: "qwen",
    name: "Qwen CLI Test",
    mark: "QW",
    source: "Terminal",
    project: "notch-ai-monitor",
    cwd: "/Users/example/notch-ai-monitor",
    processId: 43171,
    state: "waiting",
    since: fixedNow,
    lastActiveAt: fixedNow,
    muted: false,
  };
}

function retryLaunchProfile(sessionId = "sess_persist_api_001") {
  return {
    sessionId,
    adapterId: "codex-real",
    cwd: "/Users/example/notch-ai-monitor",
    command: "npm run preview",
    launchProfileHash: "launch_api_persisted",
    source: "Terminal",
  };
}

function processOwnership(sessionId = "sess_persist_api_001") {
  return {
    sessionId,
    runId: "run_api_persisted",
    adapterId: "codex-real",
    cwd: "/Users/example/notch-ai-monitor",
    launchProfileHash: "launch_api_persisted",
    supervisorTokenHash: "supervisor_api_persisted",
    pid: 43172,
    processStartedAt: fixedNow,
    commandHash: "cmd_preview",
    capabilities: ["process.retry", "process.terminate"],
  };
}

function withTempDir(run) {
  const dir = mkdtempSync(join(tmpdir(), "notch-api-persist-"));
  try {
    return run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function withApi(run) {
  const api = createLocalManagerApi({ clock: () => fixedNow });
  const address = await api.listen(0);
  try {
    await run(address.url, api);
  } finally {
    await api.close();
  }
}

async function withSupervisedApi(run) {
  const api = createLocalManagerApi({
    clock: () => fixedNow,
    processSideEffectMode: "supervised",
  });
  const address = await api.listen(0);
  try {
    await run(address.url, api);
  } finally {
    await api.close();
  }
}

async function waitFor(predicate, timeoutMs = 1500) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail("Timed out waiting for expected state.");
}

async function delay(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function acceptingTerminateSupervisor(calls = []) {
  return {
    terminateGracefully(request) {
      calls.push(request);
      return {
        status: "accepted",
        message: "fixture supervisor accepted graceful stop",
        target: `session:${request.session.id}#fixture-graceful-stop-requested`,
      };
    },
  };
}

async function createAcceptedTerminatePendingAction(baseUrl, suffix = "scheduler") {
  const testSession = {
    ...session(`sess_${suffix}`),
    tool: "codex",
    name: "Codex CLI",
    mark: "CX",
    state: "failed",
    sourceMode: "live",
    cwd: process.cwd(),
    processId: 48000 + messageCount,
  };
  const eventId = `evt_${suffix}`;
  const requestId = `req_${suffix}`;
  const runId = `run_${suffix}`;
  const launchProfileHash = `launch_${suffix}`;

  await upsertSession(baseUrl, testSession);
  await ingestErrorEvent(baseUrl, eventId, testSession.id);
  await postJson(baseUrl, "/v1/process/registrations", {
    sessionId: testSession.id,
    runId,
    adapterId: "cli-adapter-real:codex-cli",
    cwd: testSession.cwd,
    command: "codex",
    executable: "codex",
    launchProfileHash,
    supervisorTokenHash: `supervisor_${suffix}`,
    commandHash: `cmd_${suffix}`,
    pid: testSession.processId,
    processStartedAt: fixedNow,
    source: "Terminal",
    capabilities: ["process.retry", "process.terminate"],
    riskReplayMode: "required",
  });

  const actionResponse = await requestAction(baseUrl, {
    requestId,
    eventId,
    actionId: "terminate",
    confirmed: true,
    input: {
      expectedSessionId: testSession.id,
      expectedRunId: runId,
      expectedLaunchProfileHash: launchProfileHash,
    },
  });
  assert.equal(actionResponse.body.result.envelope.payload.status, "accepted");

  return {
    sessionId: testSession.id,
    eventId,
    requestId,
    runId,
    launchProfileHash,
  };
}

function savePendingActionFixture(filePath, input = {}) {
  const requestId = input.requestId ?? "req_persisted_scheduler_pending";
  const eventId = input.eventId ?? "evt_persisted_scheduler_pending";
  const sessionId = input.sessionId ?? "sess_persisted_scheduler_pending";
  const action = {
    requestId,
    eventId,
    sessionId,
    actionId: "terminate",
    label: "停止",
    status: "in_progress",
    resultStatus: "accepted",
    message: "正在等待 graceful stop 完成",
    createdAt: "2026-06-06T03:55:00.000Z",
    updatedAt: "2026-06-06T03:55:00.000Z",
    expiresAt: input.expiresAt ?? "2026-06-06T04:00:00.000Z",
    source: "api",
    mocked: false,
    targetSummary: `session:${sessionId}#adapter-graceful-stop-requested`,
  };
  const store = new JsonFileEventHistoryPersistenceStore(filePath);
  store.save({
    events: [],
    timeline: [],
    pendingActions: [action],
    cursorVersion: 1,
  });
  return action;
}

async function waitForSseSnapshot(baseUrl, predicate, trigger, timeoutMs = 1500) {
  let clientRequest;
  let settled = false;
  let connectedResolve;
  const connected = new Promise((resolve) => {
    connectedResolve = resolve;
  });

  const update = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      clientRequest?.destroy();
      reject(new Error("Timed out waiting for SSE snapshot."));
    }, timeoutMs);

    clientRequest = httpGet(`${baseUrl}/v1/events`, (response) => {
      response.setEncoding("utf8");
      let buffer = "";
      response.on("data", (chunk) => {
        buffer += chunk;
        if (buffer.includes(": connected")) connectedResolve();

        const matches = [...buffer.matchAll(/event: notch\.snapshot\.updated\ndata: ([^\n]+)\n\n/g)];
        for (const match of matches) {
          const envelope = JSON.parse(match[1]);
          if (!predicate(envelope)) continue;
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          clientRequest.destroy();
          resolve(envelope);
          return;
        }
        if (buffer.length > 20_000) buffer = buffer.slice(-10_000);
      });
    });

    clientRequest.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
  });

  await connected;
  await trigger();
  try {
    return await update;
  } finally {
    clientRequest?.destroy();
  }
}

async function getJson(baseUrl, path) {
  const response = await fetch(`${baseUrl}${path}`);
  return {
    status: response.status,
    body: await response.json(),
  };
}

async function postEnvelope(baseUrl, protocolEnvelope) {
  const response = await fetch(`${baseUrl}/v1/envelopes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(protocolEnvelope),
  });
  return {
    status: response.status,
    body: await response.json(),
  };
}

async function postJson(baseUrl, path, body = undefined) {
  const request = {
    method: "POST",
  };
  if (body !== undefined) {
    request.headers = {
      "Content-Type": "application/json",
    };
    request.body = JSON.stringify(body);
  }
  const response = await fetch(`${baseUrl}${path}`, request);
  return {
    status: response.status,
    body: await response.json(),
  };
}

async function upsertSession(baseUrl, testSession = session()) {
  return postEnvelope(
    baseUrl,
    envelope(
      "notch.session.upserted",
      { session: testSession },
      { kind: "cli", tool: testSession.tool, sessionId: testSession.id, processId: testSession.processId }
    )
  );
}

async function ingestErrorEvent(baseUrl, eventId, sessionId, summary = "Error: supervised process failed") {
  return postEnvelope(
    baseUrl,
    envelope(
      "notch.event.created",
      {
        event: {
          id: eventId,
          sessionId,
          type: "error",
          title: "运行失败",
          summary,
          source: "Terminal",
          createdAt: fixedNow,
          evidence: {
            reason: "Process exited with an error.",
            origin: "api-test",
          },
        },
      },
      { kind: "cli", tool: "codex", sessionId, sourceMode: "live" }
    )
  );
}

async function requestAction(baseUrl, payload) {
  return postEnvelope(
    baseUrl,
    envelope(
      "notch.action.requested",
      payload,
      { kind: "ui", name: "api-test-ui" },
      { correlationId: payload.requestId }
    )
  );
}

test("JsonFileProcessPersistenceStore persists process state records", () => {
  withTempDir((dir) => {
    const filePath = join(dir, "process-state.json");
    const store = new JsonFileProcessPersistenceStore(filePath);
    store.save({
      retryLaunchProfiles: [
        {
          ...retryLaunchProfile(),
          owner: "notch-manager",
          commandHash: "cmd_preview",
          active: true,
          retryAttemptActive: false,
          riskReplayMode: "required",
          capabilities: ["process.retry"],
        },
      ],
      processOwnership: [
        {
          ...processOwnership(),
          sourceMode: "live",
          owner: "notch-manager",
          active: true,
        },
      ],
      processActionAudit: [
        {
          requestId: "req_persisted_retry",
          eventId: "evt_persisted_error",
          actionId: "retry",
          sessionId: "sess_persist_api_001",
          source: "api",
          requestedAt: fixedNow,
          decision: "completed",
          resultMessage: "已启动重试",
          launchProfile: {
            adapterId: "codex-real",
            cwd: "/Users/example/notch-ai-monitor",
            launchProfileHash: "launch_api_persisted",
            commandHash: "cmd_preview",
            riskReplayMode: "required",
          },
        },
      ],
      retryRiskReplays: [
        {
          requestId: "req_persisted_retry",
          eventId: "evt_persisted_error",
          sessionId: "sess_persist_api_001",
          launchProfileHash: "launch_api_persisted",
          commandHash: "cmd_preview",
          decision: "passed",
          replayedAt: fixedNow,
          message: "Retry risk replay passed",
        },
      ],
    });

    const loaded = new JsonFileProcessPersistenceStore(filePath).load();

    assert.equal(loaded.retryLaunchProfiles[0].launchProfileHash, "launch_api_persisted");
    assert.equal(loaded.processOwnership[0].runId, "run_api_persisted");
    assert.equal(loaded.processActionAudit[0].requestId, "req_persisted_retry");
    assert.equal(loaded.retryRiskReplays[0].decision, "passed");
  });
});

test("JsonFileEventHistoryPersistenceStore persists event history projections", () => {
  withTempDir((dir) => {
    const filePath = join(dir, "event-history.json");
    const store = new JsonFileEventHistoryPersistenceStore(filePath);
    store.save({
      events: [
        {
          historyId: "evt_history_store_001",
          eventId: "evt_history_store_001",
          sessionId: "sess_history_store_001",
          type: "error",
          status: "resolved",
          title: "运行失败",
          summary: "Recovered from fixture error",
          priority: 70,
          source: "Terminal",
          createdAt: fixedNow,
          updatedAt: fixedNow,
          resolvedAt: fixedNow,
          resolution: "ignored",
          eventSnapshot: {
            id: "evt_history_store_001",
            sessionId: "sess_history_store_001",
            type: "error",
            priority: 70,
            status: "resolved",
            title: "运行失败",
            summary: "Recovered from fixture error",
            source: "Terminal",
            createdAt: fixedNow,
            updatedAt: fixedNow,
            actions: [],
          },
          latestAction: {
            requestId: "req_history_store_001",
            actionId: "ignore",
            status: "completed",
            message: "已模拟忽略事件",
            updatedAt: fixedNow,
          },
        },
      ],
      timeline: [
        {
          id: "timeline_history_store_001",
          eventId: "evt_history_store_001",
          sessionId: "sess_history_store_001",
          kind: "event_status_changed",
          at: fixedNow,
          source: "manager",
          title: "运行失败",
          message: "已模拟忽略事件",
          toStatus: "resolved",
        },
      ],
      pendingActions: [
        {
          requestId: "req_history_store_001",
          eventId: "evt_history_store_001",
          sessionId: "sess_history_store_001",
          actionId: "ignore",
          label: "忽略",
          status: "completed",
          resultStatus: "completed",
          message: "已模拟忽略事件",
          createdAt: fixedNow,
          updatedAt: fixedNow,
          completedAt: fixedNow,
          source: "api",
          mocked: true,
        },
      ],
      cursorVersion: 3,
    });

    const loaded = new JsonFileEventHistoryPersistenceStore(filePath).load();

    assert.equal(loaded.events[0].eventId, "evt_history_store_001");
    assert.equal(loaded.timeline[0].kind, "event_status_changed");
    assert.equal(loaded.pendingActions[0].requestId, "req_history_store_001");
    assert.equal(loaded.cursorVersion, 3);
  });
});

test("createLocalManagerApi hydrates retry launch profiles from process persistence file", () => {
  withTempDir((dir) => {
    const filePath = join(dir, "process-state.json");
    const firstApi = createLocalManagerApi({
      clock: () => fixedNow,
      processPersistenceFile: filePath,
    });
    firstApi.manager.registerRetryLaunchProfile(retryLaunchProfile());
    firstApi.manager.registerProcessOwnership(processOwnership());

    const secondApi = createLocalManagerApi({
      clock: () => fixedNow,
      processPersistenceFile: filePath,
    });

    assert.equal(
      secondApi.manager.getRetryLaunchProfile("sess_persist_api_001")?.launchProfileHash,
      "launch_api_persisted"
    );
    assert.equal(
      secondApi.manager.getProcessOwnership("sess_persist_api_001")?.runId,
      "run_api_persisted"
    );
  });
});

test("createLocalManagerApi hydrates event history projections from event history persistence file", () => {
  withTempDir((dir) => {
    const filePath = join(dir, "event-history.json");
    const firstApi = createLocalManagerApi({
      clock: () => fixedNow,
      eventHistoryPersistenceFile: filePath,
    });
    firstApi.manager.injectScenario("risk");
    firstApi.manager.requestAction({
      requestId: "req_api_history_persisted",
      eventId: "evt_risk_rm_001",
      actionId: "reject",
    });

    const secondApi = createLocalManagerApi({
      clock: () => fixedNow,
      eventHistoryPersistenceFile: filePath,
    });
    const history = secondApi.manager.getEventHistory({ status: "ignored" });
    const actions = secondApi.manager.getPendingActions({ eventId: "evt_risk_rm_001" });

    assert.equal(history.history[0].eventId, "evt_risk_rm_001");
    assert.equal(history.history[0].latestAction.requestId, "req_api_history_persisted");
    assert.equal(history.timeline.some((entry) => entry.kind === "action_result"), true);
    assert.equal(actions.actions[0].status, "completed");
    assert.equal(secondApi.manager.getSnapshot().historySummary.ignoredEvents, 1);
  });
});

test("GET /health and GET /v1/snapshot return JSON status and manager snapshot", async () => {
  await withApi(async (baseUrl) => {
    const health = await getJson(baseUrl, "/health");
    assert.equal(health.status, 200);
    assert.equal(health.body.ok, true);
    assert.equal(health.body.status, "ok");
    assert.equal(health.body.protocol, "notch-ai-monitor");

    const snapshot = await getJson(baseUrl, "/v1/snapshot");
    assert.equal(snapshot.status, 200);
    assert.equal(snapshot.body.ok, true);
    assert.equal(snapshot.body.snapshot.counts.sessions, 0);
    assert.equal(snapshot.body.snapshot.currentEventId, null);
    assert.equal(snapshot.body.snapshot.viewHints.restingState, "dormant");
  });
});

test("P2 GET /v1/event-history and /v1/action-requests return read-only projections", async () => {
  await withApi(async (baseUrl) => {
    const testSession = session("sess_history_api_001");
    await upsertSession(baseUrl, testSession);
    await ingestErrorEvent(baseUrl, "evt_history_api_001", testSession.id);

    const actionResponse = await requestAction(baseUrl, {
      requestId: "req_history_api_ignore",
      eventId: "evt_history_api_001",
      actionId: "ignore",
    });
    assert.equal(actionResponse.body.result.envelope.payload.status, "completed");

    const historyResponse = await getJson(baseUrl, "/v1/event-history?status=ignored&limit=10");
    assert.equal(historyResponse.status, 200);
    assert.equal(historyResponse.body.ok, true);
    assert.equal(historyResponse.body.history.length, 1);
    assert.equal(historyResponse.body.history[0].eventId, "evt_history_api_001");
    assert.equal(historyResponse.body.history[0].status, "ignored");
    assert.equal(historyResponse.body.history[0].latestAction.requestId, "req_history_api_ignore");
    assert.equal(
      historyResponse.body.timeline.some((entry) => entry.kind === "event_status_changed"),
      true
    );
    assert.equal(historyResponse.body.snapshot.activeEventIds.includes("evt_history_api_001"), false);

    const actionsResponse = await getJson(baseUrl, "/v1/action-requests?eventId=evt_history_api_001");
    assert.equal(actionsResponse.status, 200);
    assert.equal(actionsResponse.body.ok, true);
    assert.equal(actionsResponse.body.actions.length, 1);
    assert.equal(actionsResponse.body.actions[0].requestId, "req_history_api_ignore");
    assert.equal(actionsResponse.body.actions[0].status, "completed");
    assert.equal(actionsResponse.body.actions[0].source, "api");
  });
});

test("P2 read-only projection endpoints reject unsupported query values", async () => {
  await withApi(async (baseUrl) => {
    const badHistory = await getJson(baseUrl, "/v1/event-history?status=done");
    assert.equal(badHistory.status, 400);
    assert.equal(badHistory.body.error.code, "invalid_query");

    const badActions = await getJson(baseUrl, "/v1/action-requests?status=running");
    assert.equal(badActions.status, 400);
    assert.equal(badActions.body.error.code, "invalid_query");
  });
});

test("POST /v1/envelopes ingests session and event envelopes", async () => {
  await withApi(async (baseUrl) => {
    const testSession = session("sess_event_ingest_001");
    const sessionResponse = await upsertSession(baseUrl, testSession);
    assert.equal(sessionResponse.status, 200);
    assert.equal(sessionResponse.body.result.session.id, testSession.id);

    const eventResponse = await postEnvelope(
      baseUrl,
      envelope(
        "notch.event.created",
        {
          event: {
            id: "evt_confirm_api_001",
            sessionId: testSession.id,
            type: "confirm",
            title: "需要确认",
            summary: "Run a generated script.",
            source: "Terminal",
            command: "python scripts/build.py --limit 1",
          },
        },
        { kind: "cli", tool: testSession.tool, sessionId: testSession.id }
      )
    );

    assert.equal(eventResponse.status, 200);
    assert.equal(eventResponse.body.result.event.type, "confirm");
    assert.equal(eventResponse.body.result.event.priority, 80);
    assert.equal(eventResponse.body.snapshot.currentEventId, "evt_confirm_api_001");
    assert.equal(eventResponse.body.snapshot.viewHints.mood, "waiting");
    assert.equal(eventResponse.body.snapshot.viewHints.restingState, "glance");
  });
});

test("POST /v1/process/registrations registers launch profile and process ownership", async () => {
  await withApi(async (baseUrl, api) => {
    const testSession = {
      ...session("sess_process_registration_001"),
      state: "running",
      sourceMode: "live",
      processId: 43173,
    };
    await upsertSession(baseUrl, testSession);

    const response = await postJson(baseUrl, "/v1/process/registrations", {
      sessionId: testSession.id,
      runId: "run_real_cli_adapter_001",
      adapterId: "cli-adapter-real:codex-cli",
      cwd: testSession.cwd,
      command: "codex --version",
      executable: "codex",
      args: ["--version"],
      launchProfileHash: "launch_real_cli_adapter_001",
      supervisorTokenHash: "supervisor_real_cli_adapter_001",
      commandHash: "cmd_real_cli_adapter_001",
      pid: testSession.processId,
      processStartedAt: fixedNow,
      source: "Terminal",
      capabilities: ["process.retry", "process.terminate"],
      riskReplayMode: "required",
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.ok, true);
    assert.equal(response.body.event, "notch.process.registered");
    assert.equal(response.body.result.registration.sessionId, testSession.id);
    assert.equal(response.body.result.registration.launchProfileHash, "launch_real_cli_adapter_001");

    const profile = api.manager.getRetryLaunchProfile(testSession.id);
    assert.equal(profile.adapterId, "cli-adapter-real:codex-cli");
    assert.equal(profile.command, "codex --version");
    assert.equal(profile.executable, "codex");
    assert.deepEqual(profile.args, ["--version"]);
    assert.equal(profile.commandHash, "cmd_real_cli_adapter_001");
    assert.equal(profile.riskReplayMode, "required");

    const ownership = api.manager.getProcessOwnership(testSession.id);
    assert.equal(ownership.runId, "run_real_cli_adapter_001");
    assert.equal(ownership.pid, testSession.processId);
    assert.equal(ownership.cwd, testSession.cwd);
    assert.deepEqual(ownership.capabilities, ["process.retry", "process.terminate"]);
  });
});

test("P2.4b supervised retry starts a real child from the registered executable", async () => {
  await withSupervisedApi(async (baseUrl, api) => {
    const testSession = {
      ...session("sess_supervised_retry_001"),
      tool: "codex",
      name: "Codex CLI",
      mark: "CX",
      state: "failed",
      sourceMode: "live",
      cwd: process.cwd(),
      processId: 44101,
    };
    await upsertSession(baseUrl, testSession);
    const eventResponse = await ingestErrorEvent(baseUrl, "evt_supervised_retry_001", testSession.id);
    assert.equal(eventResponse.status, 200);

    await postJson(baseUrl, "/v1/process/registrations", {
      sessionId: testSession.id,
      runId: "run_supervised_retry_original",
      adapterId: "cli-adapter-real:codex-cli",
      cwd: testSession.cwd,
      command: `${process.execPath} -e ""`,
      executable: process.execPath,
      args: ["-e", ""],
      launchProfileHash: "launch_supervised_retry",
      supervisorTokenHash: "supervisor_supervised_retry_original",
      commandHash: "cmd_supervised_retry",
      pid: testSession.processId,
      processStartedAt: fixedNow,
      source: "Terminal",
      capabilities: ["process.retry", "process.terminate"],
      riskReplayMode: "required",
    });

    const response = await requestAction(baseUrl, {
      requestId: "req_supervised_retry_001",
      eventId: "evt_supervised_retry_001",
      actionId: "retry",
      input: {
        expectedSessionId: testSession.id,
        expectedLaunchProfileHash: "launch_supervised_retry",
      },
    });

    const result = response.body.result.envelope.payload;
    assert.equal(response.status, 200);
    assert.equal(result.status, "completed");
    assert.equal(result.resolution, "retry_started");
    assert.equal(result.effects[0].mocked, false);
    assert.match(result.effects[0].target, /^session:sess_retry_/);

    const retrySession = api.manager
      .getSnapshot()
      .sessions.find((item) => item.id.startsWith("sess_retry_"));
    assert.equal(Boolean(retrySession), true);
    assert.equal(retrySession.processId > 0, true);
    assert.equal(retrySession.sourceMode, "live");

    const ownership = api.manager.getProcessOwnership(retrySession.id);
    assert.equal(ownership.launchProfileHash, "launch_supervised_retry");
    assert.equal(ownership.owner, "notch-manager");
    assert.equal(api.manager.getRetryLaunchProfile(retrySession.id)?.executable, process.execPath);
  });
});

test("P2.4b supervised terminate only stops child processes owned by the local supervisor", async () => {
  await withSupervisedApi(async (baseUrl, api) => {
    const originalSession = {
      ...session("sess_supervised_terminate_original"),
      tool: "codex",
      name: "Codex CLI",
      mark: "CX",
      state: "failed",
      sourceMode: "live",
      cwd: process.cwd(),
      processId: 44102,
    };
    await upsertSession(baseUrl, originalSession);
    await ingestErrorEvent(baseUrl, "evt_supervised_terminate_retry", originalSession.id);
    await postJson(baseUrl, "/v1/process/registrations", {
      sessionId: originalSession.id,
      runId: "run_supervised_terminate_original",
      adapterId: "cli-adapter-real:codex-cli",
      cwd: originalSession.cwd,
      command: `${process.execPath} -e graceful-fixture`,
      executable: process.execPath,
      args: [
        "-e",
        "process.on('SIGTERM', () => process.exit(0)); setInterval(() => {}, 1000);",
      ],
      launchProfileHash: "launch_supervised_terminate",
      supervisorTokenHash: "supervisor_supervised_terminate_original",
      commandHash: "cmd_supervised_terminate",
      pid: originalSession.processId,
      processStartedAt: fixedNow,
      source: "Terminal",
      capabilities: ["process.retry", "process.terminate"],
      riskReplayMode: "required",
    });

    await requestAction(baseUrl, {
      requestId: "req_supervised_terminate_retry",
      eventId: "evt_supervised_terminate_retry",
      actionId: "retry",
      input: {
        expectedSessionId: originalSession.id,
        expectedLaunchProfileHash: "launch_supervised_terminate",
      },
    });

    const retrySession = api.manager
      .getSnapshot()
      .sessions.find((item) => item.id.startsWith("sess_retry_"));
    assert.equal(Boolean(retrySession), true);
    const ownership = api.manager.getProcessOwnership(retrySession.id);
    assert.equal(Boolean(ownership), true);

    await ingestErrorEvent(baseUrl, "evt_supervised_terminate_child", retrySession.id);
    const confirmFirst = await requestAction(baseUrl, {
      requestId: "req_supervised_terminate_confirm_first",
      eventId: "evt_supervised_terminate_child",
      actionId: "terminate",
    });
    assert.equal(confirmFirst.body.result.envelope.payload.status, "needs_confirmation");

    const terminate = await requestAction(baseUrl, {
      requestId: "req_supervised_terminate_confirmed",
      eventId: "evt_supervised_terminate_child",
      actionId: "terminate",
      confirmed: true,
      input: {
        expectedSessionId: retrySession.id,
        expectedRunId: ownership.runId,
        expectedLaunchProfileHash: ownership.launchProfileHash,
      },
    });
    const result = terminate.body.result.envelope.payload;
    assert.equal(result.status, "accepted");
    assert.equal(result.effects[0].mocked, false);
    assert.equal(result.effects[0].target, `session:${retrySession.id}#graceful-stop-requested`);

    const endedSession = await waitFor(() =>
      api.manager
        .getSnapshot()
        .sessions.find((item) => item.id === retrySession.id && item.state !== "running")
    );
    assert.equal(["completed", "failed"].includes(endedSession.state), true);
    assert.equal(api.manager.getProcessOwnership(retrySession.id)?.active, false);
  });
});

test("P2.4b supervised terminate does not stop external registered PIDs without a supervisor handle", async () => {
  await withSupervisedApi(async (baseUrl) => {
    const testSession = {
      ...session("sess_external_pid_terminate_001"),
      tool: "codex",
      name: "Codex CLI",
      mark: "CX",
      state: "failed",
      sourceMode: "live",
      cwd: process.cwd(),
      processId: 49999,
    };
    await upsertSession(baseUrl, testSession);
    await ingestErrorEvent(baseUrl, "evt_external_pid_terminate_001", testSession.id);
    await postJson(baseUrl, "/v1/process/registrations", {
      sessionId: testSession.id,
      runId: "run_external_pid_terminate_001",
      adapterId: "cli-adapter-real:codex-cli",
      cwd: testSession.cwd,
      command: "codex --version",
      executable: "codex",
      args: ["--version"],
      launchProfileHash: "launch_external_pid_terminate_001",
      supervisorTokenHash: "supervisor_external_pid_terminate_001",
      commandHash: "cmd_external_pid_terminate_001",
      pid: testSession.processId,
      processStartedAt: fixedNow,
      source: "Terminal",
      capabilities: ["process.retry", "process.terminate"],
      riskReplayMode: "required",
    });

    const response = await requestAction(baseUrl, {
      requestId: "req_external_pid_terminate_001",
      eventId: "evt_external_pid_terminate_001",
      actionId: "terminate",
      confirmed: true,
      input: {
        expectedSessionId: testSession.id,
        expectedRunId: "run_external_pid_terminate_001",
        expectedLaunchProfileHash: "launch_external_pid_terminate_001",
      },
    });
    const result = response.body.result.envelope.payload;
    assert.equal(result.status, "failed");
    assert.equal(result.error.code, "graceful_process_not_owned_by_supervisor");
  });
});

test("P2.4c supervised terminate sends graceful stop through adapter control channel", async () => {
  let receivedControlRequest = null;
  const controlToken = "test-control-token";
  const controlServer = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      receivedControlRequest = {
        method: request.method,
        url: request.url,
        authorization: request.headers.authorization,
        body,
      };
      response.writeHead(202, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true, status: "accepted" }));
    });
  });
  await new Promise((resolve) => controlServer.listen(0, "127.0.0.1", resolve));
  const address = controlServer.address();
  const controlEndpoint = `http://127.0.0.1:${address.port}/v1/control/terminate-gracefully`;

  try {
    await withSupervisedApi(async (baseUrl) => {
      const testSession = {
        ...session("sess_adapter_control_terminate_001"),
        tool: "codex",
        name: "Codex CLI",
        mark: "CX",
        state: "failed",
        sourceMode: "live",
        cwd: process.cwd(),
        processId: 48888,
      };
      await upsertSession(baseUrl, testSession);
      await ingestErrorEvent(baseUrl, "evt_adapter_control_terminate_001", testSession.id);
      await postJson(baseUrl, "/v1/process/registrations", {
        sessionId: testSession.id,
        runId: "run_adapter_control_terminate_001",
        adapterId: "cli-adapter-real:codex-cli",
        cwd: testSession.cwd,
        command: "codex",
        executable: "codex",
        launchProfileHash: "launch_adapter_control_terminate_001",
        supervisorTokenHash: "supervisor_adapter_control_terminate_001",
        commandHash: "cmd_adapter_control_terminate_001",
        pid: testSession.processId,
        processStartedAt: fixedNow,
        source: "Terminal",
        capabilities: ["process.retry", "process.terminate"],
        riskReplayMode: "required",
        controlEndpoint,
        controlToken,
      });

      const response = await requestAction(baseUrl, {
        requestId: "req_adapter_control_terminate_001",
        eventId: "evt_adapter_control_terminate_001",
        actionId: "terminate",
        confirmed: true,
        input: {
          expectedSessionId: testSession.id,
          expectedRunId: "run_adapter_control_terminate_001",
          expectedLaunchProfileHash: "launch_adapter_control_terminate_001",
        },
      });
      const result = response.body.result.envelope.payload;
      assert.equal(result.status, "accepted");
      assert.equal(result.effects[0].mocked, false);
      assert.equal(result.effects[0].target, `session:${testSession.id}#adapter-graceful-stop-requested`);

      await waitFor(() => receivedControlRequest);
      assert.equal(receivedControlRequest.method, "POST");
      assert.equal(receivedControlRequest.url, "/v1/control/terminate-gracefully");
      assert.equal(receivedControlRequest.authorization, `Bearer ${controlToken}`);
      assert.equal(receivedControlRequest.body.sessionId, testSession.id);
      assert.equal(receivedControlRequest.body.runId, "run_adapter_control_terminate_001");
      assert.equal(receivedControlRequest.body.launchProfileHash, "launch_adapter_control_terminate_001");
    });
  } finally {
    await new Promise((resolve, reject) => {
      controlServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
});

test("P2.4d adapter session ended auto-resolves an accepted terminate action", async () => {
  let receivedControlRequest = null;
  const controlToken = "test-control-token-p24d";
  const controlServer = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      receivedControlRequest = {
        authorization: request.headers.authorization,
        body,
      };
      response.writeHead(202, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true, status: "accepted" }));
    });
  });
  await new Promise((resolve) => controlServer.listen(0, "127.0.0.1", resolve));
  const address = controlServer.address();
  const controlEndpoint = `http://127.0.0.1:${address.port}/v1/control/terminate-gracefully`;

  try {
    await withSupervisedApi(async (baseUrl, api) => {
      const testSession = {
        ...session("sess_adapter_completion_001"),
        tool: "codex",
        name: "Codex CLI",
        mark: "CX",
        state: "failed",
        sourceMode: "live",
        cwd: process.cwd(),
        processId: 48889,
      };
      await upsertSession(baseUrl, testSession);
      await ingestErrorEvent(baseUrl, "evt_adapter_completion_001", testSession.id);
      await postJson(baseUrl, "/v1/process/registrations", {
        sessionId: testSession.id,
        runId: "run_adapter_completion_001",
        adapterId: "cli-adapter-real:codex-cli",
        cwd: testSession.cwd,
        command: "codex",
        executable: "codex",
        launchProfileHash: "launch_adapter_completion_001",
        supervisorTokenHash: "supervisor_adapter_completion_001",
        commandHash: "cmd_adapter_completion_001",
        pid: testSession.processId,
        processStartedAt: fixedNow,
        source: "Terminal",
        capabilities: ["process.retry", "process.terminate"],
        riskReplayMode: "required",
        controlEndpoint,
        controlToken,
      });

      const acceptedResponse = await requestAction(baseUrl, {
        requestId: "req_adapter_completion_001",
        eventId: "evt_adapter_completion_001",
        actionId: "terminate",
        confirmed: true,
        input: {
          expectedSessionId: testSession.id,
          expectedRunId: "run_adapter_completion_001",
          expectedLaunchProfileHash: "launch_adapter_completion_001",
        },
      });
      const accepted = acceptedResponse.body.result.envelope.payload;
      assert.equal(accepted.status, "accepted");
      assert.equal(
        api.manager.getSnapshot().events.find((item) => item.id === "evt_adapter_completion_001").status,
        "active"
      );

      await waitFor(() => receivedControlRequest);
      assert.equal(receivedControlRequest.authorization, `Bearer ${controlToken}`);
      assert.equal(receivedControlRequest.body.sessionId, testSession.id);

      const endedResponse = await postEnvelope(
        baseUrl,
        envelope(
          "notch.session.ended",
          {
            sessionId: testSession.id,
            state: "failed",
            reason: "signal:SIGTERM",
          },
          { kind: "cli", tool: testSession.tool, sessionId: testSession.id, sourceMode: "live" }
        )
      );

      const event = endedResponse.body.snapshot.events.find((item) => item.id === "evt_adapter_completion_001");
      assert.equal(event.status, "resolved");
      assert.equal(event.resolution, "terminate_graceful_completed");
      assert.equal(endedResponse.body.snapshot.counts.activeEvents, 0);
      assert.deepEqual(
        api.manager.getProcessActionAuditRecords().map((record) => record.decision),
        ["accepted", "completed"]
      );

      const replayResponse = await requestAction(baseUrl, {
        requestId: "req_adapter_completion_001",
        eventId: "evt_adapter_completion_001",
        actionId: "terminate",
        confirmed: true,
      });
      const replay = replayResponse.body.result.envelope.payload;
      assert.equal(replay.status, "completed");
      assert.equal(replay.resolution, "terminate_graceful_completed");
    });
  } finally {
    await new Promise((resolve, reject) => {
      controlServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
});

test("P2.4d adapter control failure records failed action and keeps event active", async () => {
  const controlToken = "test-control-token-failed";
  const controlServer = createServer((request, response) => {
    request.resume();
    response.writeHead(500, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({
        ok: false,
        error: {
          code: "adapter_control_rejected",
          message: "fixture adapter refused graceful stop",
        },
      })
    );
  });
  await new Promise((resolve) => controlServer.listen(0, "127.0.0.1", resolve));
  const address = controlServer.address();
  const controlEndpoint = `http://127.0.0.1:${address.port}/v1/control/terminate-gracefully`;

  try {
    await withSupervisedApi(async (baseUrl, api) => {
      const testSession = {
        ...session("sess_adapter_failure_001"),
        tool: "codex",
        name: "Codex CLI",
        mark: "CX",
        state: "failed",
        sourceMode: "live",
        cwd: process.cwd(),
        processId: 48890,
      };
      await upsertSession(baseUrl, testSession);
      await ingestErrorEvent(baseUrl, "evt_adapter_failure_001", testSession.id);
      await postJson(baseUrl, "/v1/process/registrations", {
        sessionId: testSession.id,
        runId: "run_adapter_failure_001",
        adapterId: "cli-adapter-real:codex-cli",
        cwd: testSession.cwd,
        command: "codex",
        executable: "codex",
        launchProfileHash: "launch_adapter_failure_001",
        supervisorTokenHash: "supervisor_adapter_failure_001",
        commandHash: "cmd_adapter_failure_001",
        pid: testSession.processId,
        processStartedAt: fixedNow,
        source: "Terminal",
        capabilities: ["process.retry", "process.terminate"],
        riskReplayMode: "required",
        controlEndpoint,
        controlToken,
      });

      const acceptedResponse = await requestAction(baseUrl, {
        requestId: "req_adapter_failure_001",
        eventId: "evt_adapter_failure_001",
        actionId: "terminate",
        confirmed: true,
        input: {
          expectedSessionId: testSession.id,
          expectedRunId: "run_adapter_failure_001",
          expectedLaunchProfileHash: "launch_adapter_failure_001",
        },
      });
      assert.equal(acceptedResponse.body.result.envelope.payload.status, "accepted");

      const failedAudit = await waitFor(() =>
        api.manager
          .getProcessActionAuditRecords()
          .find((record) => record.requestId === "req_adapter_failure_001" && record.decision === "failed")
      );
      assert.equal(failedAudit.errorCode, "adapter_control_rejected");
      assert.equal(
        api.manager.getSnapshot().events.find((item) => item.id === "evt_adapter_failure_001").status,
        "active"
      );

      const replayResponse = await requestAction(baseUrl, {
        requestId: "req_adapter_failure_001",
        eventId: "evt_adapter_failure_001",
        actionId: "terminate",
        confirmed: true,
      });
      const replay = replayResponse.body.result.envelope.payload;
      assert.equal(replay.status, "failed");
      assert.equal(replay.error.code, "adapter_control_rejected");
      assert.equal(replay.effects[0].target, `session:${testSession.id}#adapter-graceful-stop-failed`);
      assert.equal(
        api.manager.getSnapshot().events.find((item) => item.id === "evt_adapter_failure_001").status,
        "active"
      );
    });
  } finally {
    await new Promise((resolve, reject) => {
      controlServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
});

test("POST /v1/debug/expire-pending-actions expires in-progress pending action projections", async () => {
  const controlToken = "test-control-token-timeout";
  const controlServer = createServer((request, response) => {
    request.resume();
    response.writeHead(202, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: true, status: "accepted" }));
  });
  await new Promise((resolve) => controlServer.listen(0, "127.0.0.1", resolve));
  const address = controlServer.address();
  const controlEndpoint = `http://127.0.0.1:${address.port}/v1/control/terminate-gracefully`;

  try {
    await withSupervisedApi(async (baseUrl) => {
      const testSession = {
        ...session("sess_debug_expire_pending_001"),
        tool: "codex",
        name: "Codex CLI",
        mark: "CX",
        state: "failed",
        sourceMode: "live",
        cwd: process.cwd(),
        processId: 48891,
      };
      await upsertSession(baseUrl, testSession);
      await ingestErrorEvent(baseUrl, "evt_debug_expire_pending_001", testSession.id);
      await postJson(baseUrl, "/v1/process/registrations", {
        sessionId: testSession.id,
        runId: "run_debug_expire_pending_001",
        adapterId: "cli-adapter-real:codex-cli",
        cwd: testSession.cwd,
        command: "codex",
        executable: "codex",
        launchProfileHash: "launch_debug_expire_pending_001",
        supervisorTokenHash: "supervisor_debug_expire_pending_001",
        commandHash: "cmd_debug_expire_pending_001",
        pid: testSession.processId,
        processStartedAt: fixedNow,
        source: "Terminal",
        capabilities: ["process.retry", "process.terminate"],
        riskReplayMode: "required",
        controlEndpoint,
        controlToken,
      });

      const acceptedResponse = await requestAction(baseUrl, {
        requestId: "req_debug_expire_pending_001",
        eventId: "evt_debug_expire_pending_001",
        actionId: "terminate",
        confirmed: true,
        input: {
          expectedSessionId: testSession.id,
          expectedRunId: "run_debug_expire_pending_001",
          expectedLaunchProfileHash: "launch_debug_expire_pending_001",
        },
      });
      assert.equal(acceptedResponse.body.result.envelope.payload.status, "accepted");

      const inProgress = await getJson(baseUrl, "/v1/action-requests?status=in_progress");
      assert.equal(inProgress.body.actions.length, 1);
      assert.equal(inProgress.body.actions[0].requestId, "req_debug_expire_pending_001");
      assert.equal(inProgress.body.actions[0].expiresAt, "2026-06-06T04:05:00.000Z");

      const expireResponse = await postJson(baseUrl, "/v1/debug/expire-pending-actions", {
        at: "2026-06-06T12:05:01+08:00",
      });
      assert.equal(expireResponse.status, 200);
      assert.equal(expireResponse.body.ok, true);
      assert.equal(expireResponse.body.event, "notch.debug.pending-actions.expired");
      assert.equal(expireResponse.body.expiredActions.length, 1);
      assert.equal(expireResponse.body.expiredActions[0].status, "expired");
      assert.equal(expireResponse.body.expiredActions[0].errorCode, "pending_action_timeout");
      assert.equal(expireResponse.body.snapshot.pendingActions[0].status, "expired");
      assert.equal(
        expireResponse.body.snapshot.events.find((item) => item.id === "evt_debug_expire_pending_001").status,
        "active"
      );

      const expired = await getJson(baseUrl, "/v1/action-requests?status=expired");
      assert.equal(expired.body.actions.length, 1);
      assert.equal(expired.body.actions[0].requestId, "req_debug_expire_pending_001");

      const replayResponse = await requestAction(baseUrl, {
        requestId: "req_debug_expire_pending_001",
        eventId: "evt_debug_expire_pending_001",
        actionId: "terminate",
        confirmed: true,
      });
      const replay = replayResponse.body.result.envelope.payload;
      assert.equal(replay.status, "failed");
      assert.equal(replay.error.code, "pending_action_timeout");

      const invalidResponse = await postJson(baseUrl, "/v1/debug/expire-pending-actions", {
        at: 123,
      });
      assert.equal(invalidResponse.status, 400);
      assert.equal(invalidResponse.body.error.code, "invalid_payload");
    });
  } finally {
    await new Promise((resolve, reject) => {
      controlServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
});

test("P2 action requests endpoint supersedes waiting confirmation after confirmed terminate", async () => {
  const api = createLocalManagerApi({
    clock: () => fixedNow,
    processSideEffectMode: "supervised",
    processSupervisor: acceptingTerminateSupervisor(),
  });
  const address = await api.listen(0);

  try {
    const testSession = {
      ...session("sess_api_supersede_waiting_001"),
      tool: "codex",
      name: "Codex CLI",
      mark: "CX",
      state: "failed",
      sourceMode: "live",
      cwd: process.cwd(),
      processId: 48920,
    };
    await upsertSession(address.url, testSession);
    await ingestErrorEvent(address.url, "evt_api_supersede_waiting_001", testSession.id);
    await postJson(address.url, "/v1/process/registrations", {
      sessionId: testSession.id,
      runId: "run_api_supersede_waiting_001",
      adapterId: "cli-adapter-real:codex-cli",
      cwd: testSession.cwd,
      command: "codex",
      executable: "codex",
      launchProfileHash: "launch_api_supersede_waiting_001",
      supervisorTokenHash: "supervisor_api_supersede_waiting_001",
      commandHash: "cmd_api_supersede_waiting_001",
      pid: testSession.processId,
      processStartedAt: fixedNow,
      source: "Terminal",
      capabilities: ["process.retry", "process.terminate"],
      riskReplayMode: "required",
    });

    const needsConfirmation = await requestAction(address.url, {
      requestId: "req_api_supersede_waiting",
      eventId: "evt_api_supersede_waiting_001",
      actionId: "terminate",
    });
    assert.equal(needsConfirmation.body.result.envelope.payload.status, "needs_confirmation");
    const waiting = await getJson(address.url, "/v1/action-requests?eventId=evt_api_supersede_waiting_001");
    assert.equal(waiting.body.actions.length, 1);
    assert.equal(waiting.body.actions[0].status, "waiting_confirmation");

    const confirmed = await requestAction(address.url, {
      requestId: "req_api_supersede_confirmed",
      eventId: "evt_api_supersede_waiting_001",
      actionId: "terminate",
      confirmed: true,
      input: {
        expectedSessionId: testSession.id,
        expectedRunId: "run_api_supersede_waiting_001",
        expectedLaunchProfileHash: "launch_api_supersede_waiting_001",
      },
    });
    assert.equal(confirmed.body.result.envelope.payload.status, "accepted");

    const actions = await getJson(address.url, "/v1/action-requests?eventId=evt_api_supersede_waiting_001");
    assert.equal(actions.body.actions.length, 1);
    assert.equal(actions.body.actions[0].requestId, "req_api_supersede_confirmed");
    assert.equal(actions.body.actions[0].status, "in_progress");
  } finally {
    await api.close();
  }
});

test("P2 scheduler is disabled by default and does not auto-expire pending actions", async () => {
  let now = fixedNow;
  const supervisorCalls = [];
  const api = createLocalManagerApi({
    clock: () => now,
    processSideEffectMode: "supervised",
    processSupervisor: acceptingTerminateSupervisor(supervisorCalls),
  });
  const address = await api.listen(0);

  try {
    const pending = await createAcceptedTerminatePendingAction(address.url, "scheduler_default_off");
    now = "2026-06-06T12:05:01+08:00";
    await delay(80);

    const inProgress = await getJson(address.url, "/v1/action-requests?status=in_progress");
    assert.equal(inProgress.body.actions.length, 1);
    assert.equal(inProgress.body.actions[0].requestId, pending.requestId);
    assert.equal(api.manager.getPendingActions({ status: "expired" }).actions.length, 0);
    assert.equal(supervisorCalls.length, 1);
  } finally {
    await api.close();
  }
});

test("P2 opt-in scheduler automatically expires pending actions", async () => {
  let now = fixedNow;
  const api = createLocalManagerApi({
    clock: () => now,
    pendingActionSweepIntervalMs: 25,
    processSideEffectMode: "supervised",
    processSupervisor: acceptingTerminateSupervisor(),
  });
  const address = await api.listen(0);

  try {
    const pending = await createAcceptedTerminatePendingAction(address.url, "scheduler_auto_expire");
    now = "2026-06-06T12:05:01+08:00";

    const expired = await waitFor(() =>
      api.manager
        .getPendingActions({ status: "expired" })
        .actions.find((action) => action.requestId === pending.requestId)
    );
    assert.equal(expired.errorCode, "pending_action_timeout");

    const expiredResponse = await getJson(address.url, "/v1/action-requests?status=expired");
    assert.equal(expiredResponse.body.actions.length, 1);
    assert.equal(expiredResponse.body.actions[0].requestId, pending.requestId);
    assert.equal(
      api.manager.getSnapshot().events.find((event) => event.id === pending.eventId).status,
      "active"
    );
  } finally {
    await api.close();
  }
});

test("P2 dev timeout option sets pending action deadline used by scheduler", async () => {
  let now = fixedNow;
  const pendingActionTimeoutMs = 50;
  const api = createLocalManagerApi({
    clock: () => now,
    pendingActionTimeoutMs,
    pendingActionSweepIntervalMs: 20,
    processSideEffectMode: "supervised",
    processSupervisor: acceptingTerminateSupervisor(),
  });
  const address = await api.listen(0);

  try {
    const pending = await createAcceptedTerminatePendingAction(address.url, "scheduler_short_timeout");
    const inProgress = api.manager
      .getPendingActions({ status: "in_progress" })
      .actions.find((action) => action.requestId === pending.requestId);
    assert.equal(inProgress.expiresAt, new Date(Date.parse(fixedNow) + pendingActionTimeoutMs).toISOString());

    now = new Date(Date.parse(fixedNow) + pendingActionTimeoutMs + 1).toISOString();
    const expired = await waitFor(() =>
      api.manager
        .getPendingActions({ status: "expired" })
        .actions.find((action) => action.requestId === pending.requestId)
    );
    assert.equal(expired.errorCode, "pending_action_timeout");
  } finally {
    await api.close();
  }
});

test("P2 scheduler no-op ticks do not broadcast snapshots", async () => {
  const api = createLocalManagerApi({
    clock: () => fixedNow,
    pendingActionSweepIntervalMs: 20,
  });
  let broadcasts = 0;
  const unsubscribe = api.manager.subscribe(() => {
    broadcasts += 1;
  });
  await api.listen(0);

  try {
    await delay(90);
    assert.equal(broadcasts, 0);
  } finally {
    unsubscribe();
    await api.close();
  }
});

test("P2 scheduler broadcasts notch.snapshot.updated SSE with expired pending action", async () => {
  let now = fixedNow;
  const api = createLocalManagerApi({
    clock: () => now,
    pendingActionSweepIntervalMs: 25,
    processSideEffectMode: "supervised",
    processSupervisor: acceptingTerminateSupervisor(),
  });
  const address = await api.listen(0);

  try {
    const pending = await createAcceptedTerminatePendingAction(address.url, "scheduler_sse_expire");
    const sseEnvelope = await waitForSseSnapshot(
      address.url,
      (envelope) =>
        envelope.payload?.snapshot?.pendingActions?.some(
          (action) => action.requestId === pending.requestId && action.status === "expired"
        ),
      async () => {
        now = "2026-06-06T12:05:01+08:00";
      }
    );

    assert.equal(sseEnvelope.event, "notch.snapshot.updated");
    const pendingAction = sseEnvelope.payload.snapshot.pendingActions.find(
      (action) => action.requestId === pending.requestId
    );
    assert.equal(pendingAction.status, "expired");
    assert.equal(pendingAction.errorCode, "pending_action_timeout");
  } finally {
    await api.close();
  }
});

test("P2 scheduler startup sweep expires stale hydrated pending actions", async () => {
  const dir = mkdtempSync(join(tmpdir(), "notch-api-scheduler-"));
  const filePath = join(dir, "event-history.json");
  try {
    const pending = savePendingActionFixture(filePath, {
      requestId: "req_scheduler_hydrated_stale",
      expiresAt: "2026-06-06T03:59:59.000Z",
    });
    const api = createLocalManagerApi({
      clock: () => fixedNow,
      eventHistoryPersistenceFile: filePath,
      pendingActionSweepIntervalMs: 1000,
    });
    const address = await api.listen(0);

    try {
      const expiredResponse = await getJson(address.url, "/v1/action-requests?status=expired");
      assert.equal(expiredResponse.body.actions.length, 1);
      assert.equal(expiredResponse.body.actions[0].requestId, pending.requestId);
      assert.equal(expiredResponse.body.actions[0].errorCode, "pending_action_timeout");

      const loaded = new JsonFileEventHistoryPersistenceStore(filePath).load();
      assert.equal(loaded.pendingActions[0].status, "expired");
      assert.equal(loaded.pendingActions[0].requestId, pending.requestId);
    } finally {
      await api.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("P2 scheduler close cleanup stops future ticks", async () => {
  let now = fixedNow;
  const dir = mkdtempSync(join(tmpdir(), "notch-api-scheduler-close-"));
  const filePath = join(dir, "event-history.json");
  try {
    const pending = savePendingActionFixture(filePath, {
      requestId: "req_scheduler_close_cleanup",
      expiresAt: "2026-06-06T04:05:00.000Z",
    });
    const api = createLocalManagerApi({
      clock: () => now,
      eventHistoryPersistenceFile: filePath,
      pendingActionSweepIntervalMs: 20,
    });
    await api.listen(0);
    await api.close();

    now = "2026-06-06T12:05:01+08:00";
    await delay(90);

    assert.equal(
      api.manager.getPendingActions({ status: "in_progress" }).actions[0].requestId,
      pending.requestId
    );
    assert.equal(api.manager.getPendingActions({ status: "expired" }).actions.length, 0);
    assert.equal(new JsonFileEventHistoryPersistenceStore(filePath).load().pendingActions[0].status, "in_progress");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("P2 scheduler does not call ProcessSupervisor", async () => {
  const dir = mkdtempSync(join(tmpdir(), "notch-api-scheduler-supervisor-"));
  const filePath = join(dir, "event-history.json");
  const supervisorCalls = {
    startRetry: 0,
    terminateGracefully: 0,
  };
  const processSupervisor = {
    startRetry() {
      supervisorCalls.startRetry += 1;
      throw new Error("scheduler must not call startRetry");
    },
    terminateGracefully() {
      supervisorCalls.terminateGracefully += 1;
      throw new Error("scheduler must not call terminateGracefully");
    },
  };

  try {
    const pending = savePendingActionFixture(filePath, {
      requestId: "req_scheduler_no_supervisor",
      expiresAt: "2026-06-06T03:59:59.000Z",
    });
    const api = createLocalManagerApi({
      clock: () => fixedNow,
      eventHistoryPersistenceFile: filePath,
      pendingActionSweepIntervalMs: 20,
      processSideEffectMode: "supervised",
      processSupervisor,
    });
    await api.listen(0);

    try {
      const expired = await waitFor(() =>
        api.manager
          .getPendingActions({ status: "expired" })
          .actions.find((action) => action.requestId === pending.requestId)
      );
      assert.equal(expired.status, "expired");
      assert.equal(supervisorCalls.startRetry, 0);
      assert.equal(supervisorCalls.terminateGracefully, 0);
    } finally {
      await api.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("POST /v1/debug/reset clears sessions and events", async () => {
  await withApi(async (baseUrl) => {
    const testSession = {
      ...session("sess_reset_001"),
      sourceMode: "wrapper",
    };
    await upsertSession(baseUrl, testSession);

    const resetResponse = await postJson(baseUrl, "/v1/debug/reset");
    assert.equal(resetResponse.status, 200);
    assert.equal(resetResponse.body.ok, true);
    assert.equal(resetResponse.body.event, "notch.debug.reset");
    assert.equal(resetResponse.body.snapshot.counts.sessions, 0);
    assert.equal(resetResponse.body.snapshot.counts.activeEvents, 0);
    assert.equal(resetResponse.body.snapshot.currentEventId, null);
  });
});

test("POST /v1/envelopes ingests session ended envelopes", async () => {
  await withApi(async (baseUrl) => {
    const testSession = {
      ...session("sess_ended_api_001"),
      state: "running",
      sourceMode: "live",
    };
    await upsertSession(baseUrl, testSession);

    const endedResponse = await postEnvelope(
      baseUrl,
      envelope(
        "notch.session.ended",
        {
          sessionId: testSession.id,
          state: "completed",
          exitCode: 0,
          reason: "child exited",
        },
        { kind: "cli", tool: testSession.tool, sessionId: testSession.id, sourceMode: "live" }
      )
    );

    assert.equal(endedResponse.status, 200);
    assert.equal(endedResponse.body.result.session.id, testSession.id);
    assert.equal(endedResponse.body.result.session.state, "completed");
    assert.equal(endedResponse.body.result.session.exitCode, 0);
    assert.equal(endedResponse.body.result.session.endReason, "child exited");
    assert.equal(endedResponse.body.result.exitCode, 0);
    assert.equal(endedResponse.body.result.reason, "child exited");
    assert.equal(endedResponse.body.snapshot.counts.sessions, 1);
    assert.equal(endedResponse.body.snapshot.counts.activeSessions, 0);
    assert.equal(endedResponse.body.snapshot.sessions[0].exitCode, 0);
    assert.equal(endedResponse.body.snapshot.sessions[0].endReason, "child exited");
  });
});

test("risky confirm command is upgraded to current risk with angry peek hints", async () => {
  await withApi(async (baseUrl) => {
    const testSession = session("sess_risky_confirm_001");
    await upsertSession(baseUrl, testSession);

    const response = await postEnvelope(
      baseUrl,
      envelope(
        "notch.event.created",
        {
          event: {
            id: "evt_confirm_risky_api_001",
            sessionId: testSession.id,
            type: "confirm",
            title: "需要确认",
            summary: "Run a cleanup command.",
            source: "Terminal",
            command: "rm -rf ~/Documents/xhs-drafts/* && git clean -fd",
            evidence: {
              reason: "AI requested a cleanup command.",
              origin: "mock CLI",
            },
          },
        },
        { kind: "cli", tool: testSession.tool, sessionId: testSession.id }
      )
    );

    assert.equal(response.status, 200);
    assert.equal(response.body.result.event.type, "risk");
    assert.equal(response.body.result.event.evidence.riskLevel, "critical");
    assert.equal(response.body.snapshot.currentEventId, response.body.result.event.id);
    assert.equal(response.body.snapshot.viewHints.mood, "angry");
    assert.equal(response.body.snapshot.viewHints.restingState, "peek");
  });
});

test("action request returns action result envelope and resolves to next event", async () => {
  await withApi(async (baseUrl) => {
    const debugResponse = await postEnvelope(
      baseUrl,
      envelope("notch.debug.injected", { scenario: "all" }, { kind: "debug", name: "api-test" })
    );
    assert.equal(debugResponse.status, 200);
    assert.equal(debugResponse.body.snapshot.currentEventId, "evt_risk_rm_001");

    const response = await postEnvelope(
      baseUrl,
      envelope(
        "notch.action.requested",
        {
          requestId: "req_api_reject_risk",
          eventId: "evt_risk_rm_001",
          actionId: "reject",
          uiContext: {
            selectedEventId: "evt_risk_rm_001",
            panel: "action",
          },
        },
        { kind: "ui", name: "notch-ui-test" },
        { correlationId: "req_api_reject_risk" }
      )
    );

    assert.equal(response.status, 200);
    assert.equal(response.body.result.envelope.event, "notch.action.result");
    assert.equal(response.body.result.envelope.correlationId, "req_api_reject_risk");
    assert.equal(response.body.result.envelope.payload.status, "completed");
    assert.equal(response.body.result.envelope.payload.resolvedEventStatus, "ignored");
    assert.equal(response.body.result.envelope.payload.nextEventId, "evt_confirm_qwen_001");
    assert.equal(response.body.snapshot.currentEventId, "evt_confirm_qwen_001");
  });
});

test("GET /v1/events receives notch.snapshot.updated over SSE", async () => {
  await withApi(async (baseUrl) => {
    let resolved = false;
    let clientRequest;
    let connectedResolve;
    const connected = new Promise((resolve) => {
      connectedResolve = resolve;
    });

    const update = new Promise((resolve, reject) => {
      clientRequest = httpGet(`${baseUrl}/v1/events`, (response) => {
        response.setEncoding("utf8");
        let buffer = "";

        response.on("data", (chunk) => {
          buffer += chunk;
          if (buffer.includes(": connected")) connectedResolve();

          const eventMatch = buffer.match(/event: notch\.snapshot\.updated\ndata: ([^\n]+)\n\n/);
          if (!eventMatch) return;

          resolved = true;
          clientRequest.destroy();
          resolve(JSON.parse(eventMatch[1]));
        });
      });

      clientRequest.on("error", (error) => {
        if (!resolved) reject(error);
      });
    });

    await connected;

    const testSession = session("sess_sse_001");
    await upsertSession(baseUrl, testSession);
    await postEnvelope(
      baseUrl,
      envelope(
        "notch.event.created",
        {
          event: {
            id: "evt_sse_result_001",
            sessionId: testSession.id,
            type: "result",
            title: "结果已就绪",
            summary: "SSE smoke result.",
            source: "Terminal",
          },
        },
        { kind: "cli", tool: testSession.tool, sessionId: testSession.id }
      )
    );

    const sseEnvelope = await update;
    assert.equal(sseEnvelope.event, "notch.snapshot.updated");
    assert.equal(sseEnvelope.payload.snapshot.counts.sessions, 1);
  });
});
