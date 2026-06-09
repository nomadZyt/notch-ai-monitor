import assert from "node:assert/strict";
import test from "node:test";

import {
  MockLocalAgentManager,
  stableCommandHash,
} from "../dist/src/index.js";

const fixedNow = "2026-06-06T12:00:00+08:00";
const fixedClock = () => fixedNow;

function liveSession(overrides = {}) {
  return {
    id: "sess_live_process_001",
    tool: "codex",
    name: "Codex CLI",
    mark: "CX",
    source: "Terminal",
    sourceMode: "live",
    project: "notch-ai-monitor",
    cwd: "/Users/example/notch-ai-monitor",
    processId: 49001,
    state: "running",
    since: fixedNow,
    lastActiveAt: fixedNow,
    muted: false,
    ...overrides,
  };
}

function ingestProcessError(manager, sessionId = "sess_live_process_001") {
  return manager.ingestEvent({
    id: `evt_error_${sessionId}`,
    sessionId,
    type: "error",
    title: "Run failed",
    summary: "The CLI process failed.",
    source: "Terminal",
    evidence: {
      reason: "Process exited with code 1.",
      impact: "Preview did not start.",
      origin: "cli-adapter-real",
      rollback: "Fix the command and retry.",
    },
  });
}

function registerTerminateOwnership(manager) {
  manager.registerProcessOwnership({
    sessionId: "sess_live_process_001",
    runId: "run_live_001",
    adapterId: "codex-real",
    pid: 49001,
    processStartedAt: "2026-06-06T11:59:00+08:00",
    cwd: "/Users/example/notch-ai-monitor",
    launchProfileHash: "launch_codex_preview",
    supervisorTokenHash: "supervisor_token_hash",
    capabilities: ["process.terminate"],
  });
}

function retryLaunchProfile(overrides = {}) {
  return {
    sessionId: "sess_live_process_001",
    adapterId: "codex-real",
    cwd: "/Users/example/notch-ai-monitor",
    command: "npm run preview",
    launchProfileHash: "launch_retry_preview",
    source: "Terminal",
    ...overrides,
  };
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function persistentStore(initial = null) {
  let snapshot = initial ? cloneJson(initial) : null;
  const saves = [];
  return {
    store: {
      load() {
        return snapshot ? cloneJson(snapshot) : null;
      },
      save(nextSnapshot) {
        snapshot = cloneJson(nextSnapshot);
        saves.push(cloneJson(nextSnapshot));
      },
    },
    latest() {
      return snapshot ? cloneJson(snapshot) : null;
    },
    saveCount() {
      return saves.length;
    },
  };
}

test("injectScenario all initializes sessions and priority-ordered active events", () => {
  const manager = new MockLocalAgentManager({ clock: fixedClock });

  const snapshot = manager.injectScenario("all");

  assert.equal(snapshot.counts.sessions, 3);
  assert.equal(snapshot.currentEventId, "evt_risk_rm_001");
  assert.deepEqual(snapshot.activeEventIds, [
    "evt_risk_rm_001",
    "evt_confirm_qwen_001",
    "evt_error_codex_001",
    "evt_result_claude_001",
  ]);
  assert.equal(snapshot.viewHints.mood, "angry");
  assert.equal(snapshot.viewHints.restingState, "peek");
});

test("normalizes default event and action fields", () => {
  const manager = new MockLocalAgentManager({ clock: fixedClock });
  const command = "python scripts/build.py --limit 1";

  const event = manager.ingestEvent({
    id: "evt_min_confirm",
    sessionId: "sess_test_001",
    type: "confirm",
    title: "Need approval",
    summary: "Run a generated script.",
    source: "Terminal",
    command,
    actions: [
      {
        id: "approve",
        label: "Approve",
      },
    ],
  });

  assert.equal(event.status, "active");
  assert.equal(event.priority, 80);
  assert.equal(event.createdAt, fixedNow);
  assert.equal(event.updatedAt, fixedNow);
  assert.equal(event.commandHash, stableCommandHash(command));
  assert.deepEqual(event.actions[0], {
    id: "approve",
    label: "Approve",
    style: "primary",
    resolves: true,
    sideEffect: "process",
    enabled: true,
  });
});

test("upgrades risky confirm command into a risk event", () => {
  const manager = new MockLocalAgentManager({ clock: fixedClock });

  const event = manager.ingestEvent({
    id: "evt_confirm_dangerous_command",
    sessionId: "sess_test_001",
    type: "confirm",
    title: "Need approval",
    summary: "Run a generated cleanup command.",
    source: "Terminal",
    command: "rm -rf ~/Documents/xhs-drafts/* && git clean -fd",
    evidence: {
      reason: "AI requested a cleanup command.",
      origin: "AI generated, waiting for approval",
      impact: "~/Documents/xhs-drafts and working tree",
      rollback: "Restore from backup.",
    },
  });

  const snapshot = manager.getSnapshot();

  assert.equal(event.type, "risk");
  assert.equal(event.status, "active");
  assert.equal(event.evidence?.riskLevel, "critical");
  assert.equal(event.actions.find((action) => action.id === "allow-once")?.requiresConfirm, true);
  assert.equal(snapshot.currentEventId, event.id);
  assert.equal(snapshot.viewHints.mood, "angry");
  assert.equal(snapshot.viewHints.restingState, "peek");
});

test("adds default actions and blocks allow-once when riskLevel is missing", () => {
  const manager = new MockLocalAgentManager({ clock: fixedClock });

  const event = manager.ingestEvent({
    id: "evt_risk_without_level",
    sessionId: "sess_test_001",
    type: "risk",
    title: "Risk command",
    summary: "Risk evidence lacks level.",
    source: "Terminal",
    command: "rm -rf ./drafts",
    evidence: {
      reason: "Deletes local files.",
      impact: "./drafts",
      origin: "mock cli",
      rollback: "Restore from backup.",
    },
  });

  assert.deepEqual(
    event.actions.map((action) => action.id),
    ["reject", "allow-once", "locate", "copy"]
  );
  assert.equal(event.actions.find((action) => action.id === "allow-once")?.enabled, false);

  const result = manager.requestAction({
    requestId: "req_missing_risk_level",
    eventId: event.id,
    actionId: "allow-once",
    confirmed: true,
  });

  assert.equal(result.status, "failed");
  assert.equal(result.error?.code, "risk_level_required");
  assert.equal(
    manager.getSnapshot().events.find((item) => item.id === event.id)?.status,
    "active"
  );
});

test("resolved action completes and reports the next event", () => {
  const manager = new MockLocalAgentManager({ clock: fixedClock });
  manager.injectScenario("all");

  const result = manager.requestAction({
    requestId: "req_reject_risk",
    eventId: "evt_risk_rm_001",
    actionId: "reject",
  });

  const updatedEvent = manager
    .getSnapshot()
    .events.find((event) => event.id === "evt_risk_rm_001");

  assert.equal(result.status, "completed");
  assert.equal(result.resolvedEventStatus, "ignored");
  assert.equal(result.nextEventId, "evt_confirm_qwen_001");
  assert.equal(result.effects?.[0]?.mocked, true);
  assert.equal(updatedEvent?.status, "ignored");
  assert.equal(updatedEvent?.resolvedAt, fixedNow);
});

test("confirmation actions require confirmed true and keep the event active", () => {
  const manager = new MockLocalAgentManager({ clock: fixedClock });
  manager.injectScenario("risk");

  const result = manager.requestAction({
    requestId: "req_allow_once_unconfirmed",
    eventId: "evt_risk_rm_001",
    actionId: "allow-once",
  });

  assert.equal(result.status, "needs_confirmation");
  assert.equal(result.nextEventId, "evt_risk_rm_001");
  assert.equal(
    manager.getSnapshot().events.find((event) => event.id === "evt_risk_rm_001")?.status,
    "active"
  );
});

test("noop actions return mocked effects without resolving the event", () => {
  const manager = new MockLocalAgentManager({ clock: fixedClock });
  manager.injectScenario("waiting");

  const result = manager.requestAction({
    requestId: "req_copy_confirm",
    eventId: "evt_confirm_qwen_001",
    actionId: "copy",
  });

  assert.equal(result.status, "noop");
  assert.equal(result.nextEventId, "evt_confirm_qwen_001");
  assert.equal(result.effects?.[0]?.type, "clipboard");
  assert.equal(result.effects?.[0]?.mocked, true);
  assert.equal(
    manager.getSnapshot().events.find((event) => event.id === "evt_confirm_qwen_001")?.status,
    "active"
  );
});

test("P1 error side-effect boundary keeps view-log read-only and process effects mocked", () => {
  const manager = new MockLocalAgentManager({ clock: fixedClock });
  manager.injectScenario("error");

  const viewLog = manager.requestAction({
    requestId: "req_view_log_error",
    eventId: "evt_error_codex_001",
    actionId: "view-log",
  });
  assert.equal(viewLog.status, "noop");
  assert.equal(viewLog.nextEventId, "evt_error_codex_001");
  assert.equal(viewLog.effects?.[0]?.type, "navigation");
  assert.equal(viewLog.effects?.[0]?.mocked, true);
  assert.equal(
    manager.getSnapshot().events.find((event) => event.id === "evt_error_codex_001")?.status,
    "active"
  );

  const terminateNeedsConfirmation = manager.requestAction({
    requestId: "req_terminate_unconfirmed",
    eventId: "evt_error_codex_001",
    actionId: "terminate",
  });
  assert.equal(terminateNeedsConfirmation.status, "needs_confirmation");
  assert.equal(terminateNeedsConfirmation.effects?.[0]?.type, "process");
  assert.equal(terminateNeedsConfirmation.effects?.[0]?.mocked, true);
  assert.equal(
    manager.getSnapshot().events.find((event) => event.id === "evt_error_codex_001")?.status,
    "active"
  );

  const terminateConfirmed = manager.requestAction({
    requestId: "req_terminate_confirmed",
    eventId: "evt_error_codex_001",
    actionId: "terminate",
    confirmed: true,
  });
  assert.equal(terminateConfirmed.status, "completed");
  assert.equal(terminateConfirmed.resolvedEventStatus, "resolved");
  assert.equal(terminateConfirmed.effects?.[0]?.type, "process");
  assert.equal(terminateConfirmed.effects?.[0]?.mocked, true);
  assert.equal(
    manager.getSnapshot().events.find((event) => event.id === "evt_error_codex_001")?.status,
    "resolved"
  );

  manager.injectScenario("error");
  const retry = manager.requestAction({
    requestId: "req_retry_error",
    eventId: "evt_error_codex_001",
    actionId: "retry",
  });
  assert.equal(retry.status, "completed");
  assert.equal(retry.resolvedEventStatus, "resolved");
  assert.equal(retry.effects?.[0]?.type, "process");
  assert.equal(retry.effects?.[0]?.mocked, true);
  assert.equal(
    manager.getSnapshot().events.find((event) => event.id === "evt_error_codex_001")?.status,
    "resolved"
  );
});

test("P2 supervised terminate requires confirmation and rejects missing process ownership", () => {
  const supervisorCalls = [];
  const manager = new MockLocalAgentManager({
    clock: fixedClock,
    processSideEffectMode: "supervised",
    processSupervisor: {
      terminateGracefully(request) {
        supervisorCalls.push(request);
        return {
          status: "completed",
          message: "unexpected",
        };
      },
    },
  });
  manager.upsertSession(liveSession());
  const event = ingestProcessError(manager);

  const needsConfirmation = manager.requestAction({
    requestId: "req_p2_terminate_needs_confirmation",
    eventId: event.id,
    actionId: "terminate",
  });
  assert.equal(needsConfirmation.status, "needs_confirmation");
  assert.equal(needsConfirmation.effects?.[0]?.type, "process");
  assert.equal(needsConfirmation.effects?.[0]?.mocked, true);

  const rejected = manager.requestAction({
    requestId: "req_p2_terminate_missing_ownership",
    eventId: event.id,
    actionId: "terminate",
    confirmed: true,
  });

  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.error?.code, "process_ownership_not_found");
  assert.equal(rejected.effects?.[0]?.mocked, true);
  assert.equal(supervisorCalls.length, 0);
  assert.equal(
    manager.getSnapshot().events.find((item) => item.id === event.id)?.status,
    "active"
  );
  assert.deepEqual(
    manager.getProcessActionAuditRecords().map((record) => record.decision),
    ["needs_confirmation", "rejected"]
  );
});

test("P2 supervised terminate rejects mismatched confirmation target before supervisor call", () => {
  const supervisorCalls = [];
  const manager = new MockLocalAgentManager({
    clock: fixedClock,
    processSideEffectMode: "supervised",
    processSupervisor: {
      terminateGracefully(request) {
        supervisorCalls.push(request);
        return {
          status: "completed",
          message: "unexpected",
        };
      },
    },
  });
  manager.upsertSession(liveSession());
  const event = ingestProcessError(manager);
  manager.registerProcessOwnership({
    sessionId: "sess_live_process_001",
    runId: "run_live_001",
    adapterId: "codex-real",
    pid: 49001,
    processStartedAt: "2026-06-06T11:59:00+08:00",
    cwd: "/Users/example/notch-ai-monitor",
    launchProfileHash: "launch_codex_preview",
    supervisorTokenHash: "supervisor_token_hash",
  });

  const rejected = manager.requestAction({
    requestId: "req_p2_terminate_mismatched_run",
    eventId: event.id,
    actionId: "terminate",
    confirmed: true,
    input: {
      expectedSessionId: "sess_live_process_001",
      expectedRunId: "run_other",
      expectedLaunchProfileHash: "launch_codex_preview",
    },
  });

  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.error?.code, "process_ownership_mismatch");
  assert.equal(supervisorCalls.length, 0);
  assert.equal(
    manager.getSnapshot().events.find((item) => item.id === event.id)?.status,
    "active"
  );
  assert.equal(manager.getProcessActionAuditRecords().at(-1)?.errorCode, "process_ownership_mismatch");
});

test("P2 supervised terminate uses fake supervisor graceful stop and is idempotent", () => {
  const supervisorCalls = [];
  const manager = new MockLocalAgentManager({
    clock: fixedClock,
    processSideEffectMode: "supervised",
    processSupervisor: {
      terminateGracefully(request) {
        supervisorCalls.push(request);
        return {
          status: "completed",
          message: "已安全终止旧服务",
          target: `session:${request.session.id}#terminated`,
          endSession: {
            state: "failed",
            exitCode: 143,
            endReason: "terminated by user",
          },
        };
      },
    },
  });
  manager.upsertSession(liveSession());
  const event = ingestProcessError(manager);
  const ownership = manager.registerProcessOwnership({
    sessionId: "sess_live_process_001",
    runId: "run_live_001",
    adapterId: "codex-real",
    pid: 49001,
    processStartedAt: "2026-06-06T11:59:00+08:00",
    cwd: "/Users/example/notch-ai-monitor",
    launchProfileHash: "launch_codex_preview",
    supervisorTokenHash: "supervisor_token_hash",
    capabilities: ["process.terminate"],
  });

  assert.equal(manager.getProcessOwnership("sess_live_process_001")?.runId, ownership.runId);

  const needsConfirmation = manager.requestAction({
    requestId: "req_p2_terminate_confirm_first",
    eventId: event.id,
    actionId: "terminate",
  });
  assert.equal(needsConfirmation.status, "needs_confirmation");

  const completed = manager.requestAction({
    requestId: "req_p2_terminate_confirmed",
    eventId: event.id,
    actionId: "terminate",
    confirmed: true,
    input: {
      expectedSessionId: "sess_live_process_001",
      expectedRunId: "run_live_001",
      expectedLaunchProfileHash: "launch_codex_preview",
    },
  });
  const replay = manager.requestAction({
    requestId: "req_p2_terminate_confirmed",
    eventId: event.id,
    actionId: "terminate",
    confirmed: true,
  });
  const snapshot = manager.getSnapshot();
  const endedSession = snapshot.sessions.find((session) => session.id === "sess_live_process_001");

  assert.deepEqual(replay, completed);
  assert.equal(supervisorCalls.length, 1);
  assert.equal(supervisorCalls[0].ownership.runId, "run_live_001");
  assert.equal(supervisorCalls[0].input.expectedRunId, "run_live_001");
  assert.equal(completed.status, "completed");
  assert.equal(completed.resolution, "terminate_graceful_completed");
  assert.equal(completed.resolvedEventStatus, "resolved");
  assert.equal(completed.effects?.[0]?.type, "process");
  assert.equal(completed.effects?.[0]?.target, "session:sess_live_process_001#terminated");
  assert.equal(completed.effects?.[0]?.mocked, false);
  assert.equal(snapshot.events.find((item) => item.id === event.id)?.status, "resolved");
  assert.equal(endedSession?.state, "failed");
  assert.equal(endedSession?.exitCode, 143);
  assert.equal(endedSession?.endReason, "terminated by user");
  assert.deepEqual(
    manager.getProcessActionAuditRecords().map((record) => record.decision),
    ["needs_confirmation", "completed"]
  );
});

test("P2 supervised terminate reports supervisor failure without resolving the event", () => {
  const manager = new MockLocalAgentManager({
    clock: fixedClock,
    processSideEffectMode: "supervised",
    processSupervisor: {
      terminateGracefully() {
        return {
          status: "failed",
          message: "受控终止失败",
          error: {
            code: "supervisor_failed",
            message: "fake supervisor refused graceful stop",
          },
        };
      },
    },
  });
  manager.upsertSession(liveSession());
  const event = ingestProcessError(manager);
  manager.registerProcessOwnership({
    sessionId: "sess_live_process_001",
    runId: "run_live_001",
    adapterId: "codex-real",
    pid: 49001,
    processStartedAt: "2026-06-06T11:59:00+08:00",
    cwd: "/Users/example/notch-ai-monitor",
    launchProfileHash: "launch_codex_preview",
    supervisorTokenHash: "supervisor_token_hash",
  });

  const failed = manager.requestAction({
    requestId: "req_p2_terminate_supervisor_failed",
    eventId: event.id,
    actionId: "terminate",
    confirmed: true,
  });

  assert.equal(failed.status, "failed");
  assert.equal(failed.error?.code, "supervisor_failed");
  assert.equal(failed.effects?.[0]?.mocked, false);
  assert.equal(
    manager.getSnapshot().events.find((item) => item.id === event.id)?.status,
    "active"
  );
  assert.equal(manager.getProcessActionAuditRecords().at(-1)?.decision, "failed");
  assert.equal(manager.getProcessActionAuditRecords().at(-1)?.errorCode, "supervisor_failed");
});

test("P2.4d async completion resolves an accepted terminate action", () => {
  const manager = new MockLocalAgentManager({
    clock: fixedClock,
    processSideEffectMode: "supervised",
    processSupervisor: {
      terminateGracefully(request) {
        return {
          status: "accepted",
          message: "已发送 graceful stop 请求",
          target: `session:${request.session.id}#graceful-stop-requested`,
        };
      },
    },
  });
  manager.upsertSession(liveSession());
  const event = ingestProcessError(manager);
  manager.registerProcessOwnership({
    sessionId: "sess_live_process_001",
    runId: "run_live_001",
    adapterId: "codex-real",
    pid: 49001,
    processStartedAt: "2026-06-06T11:59:00+08:00",
    cwd: "/Users/example/notch-ai-monitor",
    launchProfileHash: "launch_codex_preview",
    supervisorTokenHash: "supervisor_token_hash",
    capabilities: ["process.terminate"],
  });

  const accepted = manager.requestAction({
    requestId: "req_p24d_terminate_accepted",
    eventId: event.id,
    actionId: "terminate",
    confirmed: true,
  });
  assert.equal(accepted.status, "accepted");
  assert.equal(manager.getSnapshot().events.find((item) => item.id === event.id)?.status, "active");

  const completed = manager.completeAcceptedProcessAction({
    requestId: "req_p24d_terminate_accepted",
    sessionId: "sess_live_process_001",
    actionId: "terminate",
    status: "completed",
    message: "graceful stop 已完成",
    target: "session:sess_live_process_001#graceful-stop-completed",
    resolution: "terminate_graceful_completed",
  });
  const replay = manager.requestAction({
    requestId: "req_p24d_terminate_accepted",
    eventId: event.id,
    actionId: "terminate",
    confirmed: true,
  });

  assert.equal(completed?.status, "completed");
  assert.equal(completed?.resolution, "terminate_graceful_completed");
  assert.equal(completed?.resolvedEventStatus, "resolved");
  assert.equal(completed?.effects?.[0]?.mocked, false);
  assert.deepEqual(replay, completed);
  assert.equal(manager.getSnapshot().events.find((item) => item.id === event.id)?.status, "resolved");
  assert.deepEqual(
    manager.getProcessActionAuditRecords().map((record) => record.decision),
    ["accepted", "completed"]
  );
});

test("P2.4d async completion records failure and keeps accepted terminate event active", () => {
  const manager = new MockLocalAgentManager({
    clock: fixedClock,
    processSideEffectMode: "supervised",
    processSupervisor: {
      terminateGracefully(request) {
        return {
          status: "accepted",
          message: "已发送 adapter graceful stop 请求",
          target: `session:${request.session.id}#adapter-graceful-stop-requested`,
        };
      },
    },
  });
  manager.upsertSession(liveSession());
  const event = ingestProcessError(manager);
  manager.registerProcessOwnership({
    sessionId: "sess_live_process_001",
    runId: "run_live_001",
    adapterId: "codex-real",
    pid: 49001,
    processStartedAt: "2026-06-06T11:59:00+08:00",
    cwd: "/Users/example/notch-ai-monitor",
    launchProfileHash: "launch_codex_preview",
    supervisorTokenHash: "supervisor_token_hash",
    capabilities: ["process.terminate"],
  });

  const accepted = manager.requestAction({
    requestId: "req_p24d_terminate_failed",
    eventId: event.id,
    actionId: "terminate",
    confirmed: true,
  });
  assert.equal(accepted.status, "accepted");

  const failed = manager.completeAcceptedProcessAction({
    requestId: "req_p24d_terminate_failed",
    eventId: event.id,
    sessionId: "sess_live_process_001",
    actionId: "terminate",
    status: "failed",
    message: "adapter 控制通道请求失败",
    target: "session:sess_live_process_001#adapter-graceful-stop-failed",
    reason: "ECONNREFUSED",
    errorCode: "adapter_control_request_failed",
  });
  const replay = manager.requestAction({
    requestId: "req_p24d_terminate_failed",
    eventId: event.id,
    actionId: "terminate",
    confirmed: true,
  });

  assert.equal(failed?.status, "failed");
  assert.equal(failed?.error?.code, "adapter_control_request_failed");
  assert.equal(failed?.effects?.[0]?.mocked, false);
  assert.deepEqual(replay, failed);
  assert.equal(manager.getSnapshot().events.find((item) => item.id === event.id)?.status, "active");
  assert.deepEqual(
    manager.getProcessActionAuditRecords().map((record) => record.decision),
    ["accepted", "failed"]
  );
  assert.equal(manager.getProcessActionAuditRecords().at(-1)?.errorCode, "adapter_control_request_failed");
});

test("P2 event history projection tracks resolved events outside the active queue", () => {
  const manager = new MockLocalAgentManager({ clock: fixedClock });
  manager.injectScenario("all");

  const result = manager.requestAction({
    requestId: "req_history_reject_risk",
    eventId: "evt_risk_rm_001",
    actionId: "reject",
  });
  const history = manager.getEventHistory({ status: "ignored" });
  const pending = manager.getPendingActions({ eventId: "evt_risk_rm_001" });
  const snapshot = manager.getSnapshot();

  assert.equal(result.status, "completed");
  assert.equal(history.history.length, 1);
  assert.equal(history.history[0].eventId, "evt_risk_rm_001");
  assert.equal(history.history[0].status, "ignored");
  assert.equal(history.history[0].latestAction.requestId, "req_history_reject_risk");
  assert.equal(history.timeline.some((entry) => entry.kind === "event_status_changed"), true);
  assert.equal(snapshot.activeEventIds.includes("evt_risk_rm_001"), false);
  assert.equal(snapshot.historySummary.ignoredEvents, 1);
  assert.equal(snapshot.historySummary.totalEvents, 4);
  assert.equal(pending.actions[0].status, "completed");
  assert.equal(pending.actions[0].resultStatus, "completed");
});

test("P2 pending action projection updates accepted terminate failure without duplicates", () => {
  const manager = new MockLocalAgentManager({
    clock: fixedClock,
    processSideEffectMode: "supervised",
    processSupervisor: {
      terminateGracefully(request) {
        return {
          status: "accepted",
          message: "已发送 adapter graceful stop 请求",
          target: `session:${request.session.id}#adapter-graceful-stop-requested`,
        };
      },
    },
  });
  manager.upsertSession(liveSession());
  const event = ingestProcessError(manager);
  manager.registerProcessOwnership({
    sessionId: "sess_live_process_001",
    runId: "run_live_001",
    adapterId: "codex-real",
    pid: 49001,
    processStartedAt: "2026-06-06T11:59:00+08:00",
    cwd: "/Users/example/notch-ai-monitor",
    launchProfileHash: "launch_codex_preview",
    supervisorTokenHash: "supervisor_token_hash",
    capabilities: ["process.terminate"],
  });

  const accepted = manager.requestAction({
    requestId: "req_pending_terminate_failed",
    eventId: event.id,
    actionId: "terminate",
    confirmed: true,
  });
  const inProgress = manager.getPendingActions({ status: "in_progress" });

  assert.equal(accepted.status, "accepted");
  assert.equal(inProgress.actions.length, 1);
  assert.equal(inProgress.actions[0].requestId, "req_pending_terminate_failed");
  assert.equal(inProgress.actions[0].mocked, false);

  manager.completeAcceptedProcessAction({
    requestId: "req_pending_terminate_failed",
    eventId: event.id,
    sessionId: "sess_live_process_001",
    actionId: "terminate",
    status: "failed",
    message: "adapter 控制通道请求失败",
    target: "session:sess_live_process_001#adapter-graceful-stop-failed",
    reason: "ECONNREFUSED",
    errorCode: "adapter_control_request_failed",
  });

  const failed = manager.getPendingActions({ eventId: event.id });
  assert.equal(failed.actions.length, 1);
  assert.equal(failed.actions[0].status, "failed");
  assert.equal(failed.actions[0].errorCode, "adapter_control_request_failed");
  assert.equal(failed.actions[0].targetSummary, "session:sess_live_process_001#adapter-graceful-stop-failed");
  assert.equal(manager.getSnapshot().historySummary.failedActions, 1);
  assert.equal(manager.getSnapshot().events.find((item) => item.id === event.id)?.status, "active");
});

test("P2 pending action projection supersedes waiting confirmation after confirmed terminate", () => {
  const manager = new MockLocalAgentManager({
    clock: fixedClock,
    processSideEffectMode: "supervised",
    processSupervisor: {
      terminateGracefully(request) {
        return {
          status: "accepted",
          message: "已发送 adapter graceful stop 请求",
          target: `session:${request.session.id}#adapter-graceful-stop-requested`,
        };
      },
    },
  });
  manager.upsertSession(liveSession());
  const event = ingestProcessError(manager);
  registerTerminateOwnership(manager);

  const needsConfirmation = manager.requestAction({
    requestId: "req_pending_supersede_waiting",
    eventId: event.id,
    actionId: "terminate",
  });
  const waiting = manager.getPendingActions({ eventId: event.id });
  const accepted = manager.requestAction({
    requestId: "req_pending_supersede_confirmed",
    eventId: event.id,
    actionId: "terminate",
    confirmed: true,
  });
  const actions = manager.getPendingActions({ eventId: event.id });

  assert.equal(needsConfirmation.status, "needs_confirmation");
  assert.equal(waiting.actions.length, 1);
  assert.equal(waiting.actions[0].status, "waiting_confirmation");
  assert.equal(accepted.status, "accepted");
  assert.equal(actions.actions.length, 1);
  assert.equal(actions.actions[0].requestId, "req_pending_supersede_confirmed");
  assert.equal(actions.actions[0].status, "in_progress");
  assert.equal(manager.getPendingActions({ status: "waiting_confirmation" }).actions.length, 0);
});

test("P2 pending action timeout expires accepted terminate without resolving event", () => {
  const manager = new MockLocalAgentManager({
    clock: fixedClock,
    pendingActionTimeoutMs: 60_000,
    processSideEffectMode: "supervised",
    processSupervisor: {
      terminateGracefully(request) {
        return {
          status: "accepted",
          message: "已发送 adapter graceful stop 请求",
          target: `session:${request.session.id}#adapter-graceful-stop-requested`,
        };
      },
    },
  });
  manager.upsertSession(liveSession());
  const event = ingestProcessError(manager);
  registerTerminateOwnership(manager);

  const accepted = manager.requestAction({
    requestId: "req_pending_timeout_terminate",
    eventId: event.id,
    actionId: "terminate",
    confirmed: true,
  });
  const inProgress = manager.getPendingActions({ eventId: event.id });

  assert.equal(accepted.status, "accepted");
  assert.equal(inProgress.actions[0].status, "in_progress");
  assert.ok(inProgress.actions[0].expiresAt);

  const expired = manager.expirePendingActions({ at: "2026-06-06T12:01:01+08:00" });
  const pending = manager.getPendingActions({ eventId: event.id });
  const replay = manager.requestAction({
    requestId: "req_pending_timeout_terminate",
    eventId: event.id,
    actionId: "terminate",
    confirmed: true,
  });
  const lateCompletion = manager.completeAcceptedProcessAction({
    requestId: "req_pending_timeout_terminate",
    eventId: event.id,
    sessionId: "sess_live_process_001",
    actionId: "terminate",
    status: "completed",
    message: "late graceful completion should not resolve",
  });
  const history = manager.getEventHistory({ sessionId: event.sessionId });

  assert.equal(expired.length, 1);
  assert.equal(expired[0].status, "expired");
  assert.equal(expired[0].resultStatus, "failed");
  assert.equal(pending.actions.length, 1);
  assert.equal(pending.actions[0].status, "expired");
  assert.equal(pending.actions[0].errorCode, "pending_action_timeout");
  assert.equal(replay.status, "failed");
  assert.equal(replay.error?.code, "pending_action_timeout");
  assert.equal(lateCompletion?.status, "failed");
  assert.equal(manager.getSnapshot().events.find((item) => item.id === event.id)?.status, "active");
  assert.deepEqual(
    manager.getProcessActionAuditRecords().map((record) => record.decision),
    ["accepted", "failed"]
  );
  assert.equal(manager.getProcessActionAuditRecords().at(-1)?.errorCode, "pending_action_timeout");
  assert.equal(history.history[0].latestAction.status, "failed");
  assert.equal(
    history.timeline.some(
      (entry) => entry.kind === "action_completed_async" && entry.errorCode === "pending_action_timeout"
    ),
    true
  );
});

test("P2 pending action heartbeat extends timeout deadline", () => {
  const manager = new MockLocalAgentManager({
    clock: fixedClock,
    pendingActionTimeoutMs: 60_000,
    processSideEffectMode: "supervised",
    processSupervisor: {
      terminateGracefully(request) {
        return {
          status: "accepted",
          message: "已发送 adapter graceful stop 请求",
          target: `session:${request.session.id}#adapter-graceful-stop-requested`,
        };
      },
    },
  });
  manager.upsertSession(liveSession());
  const event = ingestProcessError(manager);
  registerTerminateOwnership(manager);

  manager.requestAction({
    requestId: "req_pending_heartbeat_terminate",
    eventId: event.id,
    actionId: "terminate",
    confirmed: true,
  });
  const beforeHeartbeat = manager.getPendingActions({ eventId: event.id }).actions[0];
  const heartbeat = manager.heartbeatPendingAction({
    requestId: "req_pending_heartbeat_terminate",
    at: "2026-06-06T12:00:30+08:00",
    timeoutMs: 120_000,
    message: "adapter heartbeat received",
  });
  const notExpired = manager.expirePendingActions({ at: "2026-06-06T12:01:05+08:00" });
  const stillInProgress = manager.getPendingActions({ eventId: event.id }).actions[0];
  const expired = manager.expirePendingActions({ at: "2026-06-06T12:02:31+08:00" });

  assert.ok(beforeHeartbeat.expiresAt);
  assert.ok(heartbeat?.expiresAt);
  assert.notEqual(heartbeat?.expiresAt, beforeHeartbeat.expiresAt);
  assert.equal(heartbeat?.message, "adapter heartbeat received");
  assert.equal(notExpired.length, 0);
  assert.equal(stillInProgress.status, "in_progress");
  assert.equal(stillInProgress.expiresAt, heartbeat?.expiresAt);
  assert.equal(expired.length, 1);
  assert.equal(expired[0].status, "expired");
});

test("P2 event history persistence store hydrates history, timeline, and pending actions", () => {
  const persistence = persistentStore();
  const manager = new MockLocalAgentManager({
    clock: fixedClock,
    eventHistoryPersistence: persistence.store,
  });
  manager.injectScenario("risk");

  manager.requestAction({
    requestId: "req_history_persisted",
    eventId: "evt_risk_rm_001",
    actionId: "reject",
  });
  const persisted = persistence.latest();

  assert.equal(persisted.events.find((item) => item.eventId === "evt_risk_rm_001").status, "ignored");
  assert.equal(persisted.pendingActions[0].requestId, "req_history_persisted");
  assert.equal(persisted.timeline.some((entry) => entry.kind === "event_status_changed"), true);

  const hydrated = new MockLocalAgentManager({
    clock: fixedClock,
    eventHistoryPersistence: persistence.store,
  });
  const history = hydrated.getEventHistory({ status: "ignored" });
  const pending = hydrated.getPendingActions({ eventId: "evt_risk_rm_001" });

  assert.equal(history.history[0].eventId, "evt_risk_rm_001");
  assert.equal(history.timeline.some((entry) => entry.kind === "action_result"), true);
  assert.equal(pending.actions[0].status, "completed");
  assert.equal(hydrated.getSnapshot().historySummary.ignoredEvents, 1);
});

test("P2 supervised retry rejects missing launch profile before supervisor call", () => {
  const supervisorCalls = [];
  const manager = new MockLocalAgentManager({
    clock: fixedClock,
    processSideEffectMode: "supervised",
    processSupervisor: {
      startRetry(request) {
        supervisorCalls.push(request);
        return {
          status: "completed",
          message: "unexpected",
        };
      },
      terminateGracefully() {
        return {
          status: "completed",
          message: "unused",
        };
      },
    },
  });
  manager.upsertSession(liveSession());
  const event = ingestProcessError(manager);

  const rejected = manager.requestAction({
    requestId: "req_p2_retry_missing_profile",
    eventId: event.id,
    actionId: "retry",
  });

  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.error?.code, "retry_launch_profile_not_found");
  assert.equal(rejected.effects?.[0]?.mocked, true);
  assert.equal(supervisorCalls.length, 0);
  assert.equal(
    manager.getSnapshot().events.find((item) => item.id === event.id)?.status,
    "active"
  );
  assert.equal(manager.getProcessActionAuditRecords().at(-1)?.errorCode, "retry_launch_profile_not_found");
});

test("P2 supervised retry replays risk policy and enqueues a risk event before supervisor", () => {
  const supervisorCalls = [];
  const manager = new MockLocalAgentManager({
    clock: fixedClock,
    processSideEffectMode: "supervised",
    processSupervisor: {
      startRetry(request) {
        supervisorCalls.push(request);
        return {
          status: "completed",
          message: "unexpected",
        };
      },
      terminateGracefully() {
        return {
          status: "completed",
          message: "unused",
        };
      },
    },
  });
  manager.upsertSession(liveSession());
  const event = ingestProcessError(manager);
  manager.registerRetryLaunchProfile(
    retryLaunchProfile({
      command: "rm -rf ./dist",
      launchProfileHash: "launch_retry_dangerous",
    })
  );

  const rejected = manager.requestAction({
    requestId: "req_p2_retry_risk_replay",
    eventId: event.id,
    actionId: "retry",
    input: {
      expectedSessionId: "sess_live_process_001",
      expectedLaunchProfileHash: "launch_retry_dangerous",
    },
  });
  const snapshot = manager.getSnapshot();
  const riskEvent = snapshot.events.find((item) => item.type === "risk");

  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.error?.code, "retry_risk_replay_required");
  assert.equal(rejected.effects?.[0]?.type, "navigation");
  assert.equal(rejected.effects?.[0]?.mocked, true);
  assert.equal(supervisorCalls.length, 0);
  assert.equal(riskEvent?.status, "active");
  assert.equal(riskEvent?.command, "rm -rf ./dist");
  assert.equal(snapshot.events.find((item) => item.id === event.id)?.status, "active");
  assert.equal(manager.getRetryRiskReplayRecords().at(-1)?.decision, "blocked");
  assert.equal(manager.getRetryRiskReplayRecords().at(-1)?.riskEventId, riskEvent?.id);
  assert.equal(manager.getProcessActionAuditRecords().at(-1)?.launchProfile?.launchProfileHash, "launch_retry_dangerous");
});

test("P2 supervised retry uses launch profile, fake supervisor, and request id replay", () => {
  const supervisorCalls = [];
  const manager = new MockLocalAgentManager({
    clock: fixedClock,
    processSideEffectMode: "supervised",
    processSupervisor: {
      startRetry(request) {
        supervisorCalls.push(request);
        return {
          status: "completed",
          message: "已启动重试",
          target: "session:sess_retry_attempt_001",
          session: liveSession({
            id: "sess_retry_attempt_001",
            processId: 49002,
            state: "running",
          }),
        };
      },
      terminateGracefully() {
        return {
          status: "completed",
          message: "unused",
        };
      },
    },
  });
  manager.upsertSession(liveSession());
  const event = ingestProcessError(manager);
  const profile = manager.registerRetryLaunchProfile(retryLaunchProfile());

  assert.equal(manager.getRetryLaunchProfile("sess_live_process_001")?.launchProfileHash, profile.launchProfileHash);

  const completed = manager.requestAction({
    requestId: "req_p2_retry_safe_profile",
    eventId: event.id,
    actionId: "retry",
    input: {
      expectedSessionId: "sess_live_process_001",
      expectedLaunchProfileHash: "launch_retry_preview",
    },
  });
  const replay = manager.requestAction({
    requestId: "req_p2_retry_safe_profile",
    eventId: event.id,
    actionId: "retry",
  });
  const snapshot = manager.getSnapshot();

  assert.deepEqual(replay, completed);
  assert.equal(supervisorCalls.length, 1);
  assert.equal(supervisorCalls[0].launchProfile.command, "npm run preview");
  assert.equal(supervisorCalls[0].input.expectedLaunchProfileHash, "launch_retry_preview");
  assert.equal(completed.status, "completed");
  assert.equal(completed.resolution, "retry_started");
  assert.equal(completed.resolvedEventStatus, "resolved");
  assert.equal(completed.effects?.[0]?.type, "process");
  assert.equal(completed.effects?.[0]?.target, "session:sess_retry_attempt_001");
  assert.equal(completed.effects?.[0]?.mocked, false);
  assert.equal(snapshot.events.find((item) => item.id === event.id)?.status, "resolved");
  assert.equal(snapshot.sessions.find((session) => session.id === "sess_retry_attempt_001")?.state, "running");
  assert.equal(manager.getRetryLaunchProfile("sess_live_process_001")?.retryAttemptActive, true);
  assert.equal(manager.getRetryRiskReplayRecords().at(-1)?.decision, "passed");
  assert.deepEqual(
    manager.getProcessActionAuditRecords().map((record) => record.decision),
    ["completed"]
  );
});

test("P2 process persistence hydrates ownership, launch profiles, audit, and risk replay records", () => {
  const persistence = persistentStore();
  const manager = new MockLocalAgentManager({
    clock: fixedClock,
    processSideEffectMode: "supervised",
    processPersistence: persistence.store,
    processSupervisor: {
      startRetry(request) {
        return {
          status: "completed",
          message: "已启动重试",
          target: "session:sess_retry_persisted_001",
          session: liveSession({
            id: "sess_retry_persisted_001",
            processId: 49003,
            state: "running",
          }),
        };
      },
      terminateGracefully() {
        return {
          status: "completed",
          message: "unused",
        };
      },
    },
  });
  manager.upsertSession(liveSession());
  const event = ingestProcessError(manager);
  manager.registerProcessOwnership({
    sessionId: "sess_live_process_001",
    runId: "run_persisted_process_001",
    adapterId: "codex-real",
    pid: 49001,
    processStartedAt: "2026-06-06T11:59:00+08:00",
    cwd: "/Users/example/notch-ai-monitor",
    launchProfileHash: "launch_retry_preview",
    supervisorTokenHash: "supervisor_token_hash",
    commandHash: "cmd_preview",
  });
  manager.registerRetryLaunchProfile(retryLaunchProfile());

  const completed = manager.requestAction({
    requestId: "req_p2_retry_persisted",
    eventId: event.id,
    actionId: "retry",
    input: {
      expectedSessionId: "sess_live_process_001",
      expectedLaunchProfileHash: "launch_retry_preview",
    },
  });
  const persisted = persistence.latest();

  assert.equal(completed.status, "completed");
  assert.equal(persistence.saveCount() >= 3, true);
  assert.equal(persisted.processOwnership[0].runId, "run_persisted_process_001");
  assert.equal(persisted.retryLaunchProfiles[0].retryAttemptActive, true);
  assert.equal(persisted.processActionAudit[0].actionId, "retry");
  assert.equal(persisted.processActionAudit[0].decision, "completed");
  assert.equal(persisted.retryRiskReplays[0].decision, "passed");

  const hydrated = new MockLocalAgentManager({
    clock: fixedClock,
    processPersistence: persistence.store,
  });

  assert.equal(hydrated.getProcessOwnership("sess_live_process_001")?.runId, "run_persisted_process_001");
  assert.equal(hydrated.getRetryLaunchProfile("sess_live_process_001")?.retryAttemptActive, true);
  assert.equal(hydrated.getProcessActionAuditRecords()[0].requestId, "req_p2_retry_persisted");
  assert.equal(hydrated.getRetryRiskReplayRecords()[0].decision, "passed");
});

test("P2 supervised retry rejects active retry attempts without supervisor call", () => {
  const supervisorCalls = [];
  const manager = new MockLocalAgentManager({
    clock: fixedClock,
    processSideEffectMode: "supervised",
    processSupervisor: {
      startRetry(request) {
        supervisorCalls.push(request);
        return {
          status: "completed",
          message: "unexpected",
        };
      },
      terminateGracefully() {
        return {
          status: "completed",
          message: "unused",
        };
      },
    },
  });
  manager.upsertSession(liveSession());
  const event = ingestProcessError(manager);
  manager.registerRetryLaunchProfile(
    retryLaunchProfile({
      retryAttemptActive: true,
    })
  );

  const rejected = manager.requestAction({
    requestId: "req_p2_retry_already_active",
    eventId: event.id,
    actionId: "retry",
  });

  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.error?.code, "retry_attempt_already_active");
  assert.equal(supervisorCalls.length, 0);
  assert.equal(
    manager.getSnapshot().events.find((item) => item.id === event.id)?.status,
    "active"
  );
});

test("P2 view-log exposes only a safe read-only log target and keeps the event active", () => {
  const manager = new MockLocalAgentManager({ clock: fixedClock });
  manager.ingestEvent({
    id: "evt_error_safe_log_001",
    sessionId: "sess_test_001",
    type: "error",
    title: "Run failed",
    summary: "The CLI process failed.",
    source: "Terminal",
    evidence: {
      reason: "Process exited with code 1.",
      impact: "Preview did not start.",
      origin: "cli-adapter-real",
      rollback: "Fix the command and retry.",
      affectedPaths: [
        "https://example.test/remote.log",
        "../private/secrets.log",
        "/Users/example/notch-ai-monitor/logs/codex-error.log",
      ],
      logExcerpt: "Error: listen EADDRINUSE",
    },
  });

  const result = manager.requestAction({
    requestId: "req_view_log_safe_path",
    eventId: "evt_error_safe_log_001",
    actionId: "view-log",
  });

  assert.equal(result.status, "noop");
  assert.equal(result.message, "日志位置：/Users/example/notch-ai-monitor/logs/codex-error.log");
  assert.equal(result.nextEventId, "evt_error_safe_log_001");
  assert.equal(result.effects?.[0]?.type, "filesystem");
  assert.equal(result.effects?.[0]?.target, "/Users/example/notch-ai-monitor/logs/codex-error.log");
  assert.equal(result.effects?.[0]?.mocked, false);
  assert.equal(
    manager.getSnapshot().events.find((event) => event.id === "evt_error_safe_log_001")?.status,
    "active"
  );
});

test("P2 view-log falls back to the log excerpt when no safe target is available", () => {
  const manager = new MockLocalAgentManager({ clock: fixedClock });
  manager.ingestEvent({
    id: "evt_error_unsafe_log_001",
    sessionId: "sess_test_001",
    type: "error",
    title: "Run failed",
    summary: "The CLI process failed.",
    source: "Terminal",
    evidence: {
      reason: "Process exited with code 1.",
      impact: "Preview did not start.",
      origin: "cli-adapter-real",
      rollback: "Fix the command and retry.",
      affectedPaths: ["https://example.test/remote.log", "../private/secrets.log"],
      logExcerpt: "Error: listen EADDRINUSE",
    },
  });

  const result = manager.requestAction({
    requestId: "req_view_log_unsafe_path",
    eventId: "evt_error_unsafe_log_001",
    actionId: "view-log",
  });

  assert.equal(result.status, "noop");
  assert.equal(result.message, "已展示日志摘录：见事件详情中的日志");
  assert.equal(result.effects?.[0]?.type, "navigation");
  assert.equal(result.effects?.[0]?.target, "event:evt_error_unsafe_log_001#logExcerpt");
  assert.equal(result.effects?.[0]?.mocked, true);
  assert.equal(
    manager.getSnapshot().events.find((event) => event.id === "evt_error_unsafe_log_001")?.status,
    "active"
  );
});

test("reset clears sessions and events and notifies subscribers", () => {
  const manager = new MockLocalAgentManager({ clock: fixedClock });
  const updates = [];
  const unsubscribe = manager.subscribe((snapshot) => updates.push(snapshot));

  manager.injectScenario("all");
  const snapshot = manager.reset();

  assert.equal(snapshot.counts.sessions, 0);
  assert.equal(snapshot.counts.activeEvents, 0);
  assert.equal(snapshot.currentEventId, null);
  assert.equal(snapshot.viewHints.restingState, "dormant");
  assert.equal(updates.at(-1).counts.sessions, 0);

  unsubscribe();
});

test("endSession marks an existing session completed and updates active counts", () => {
  const manager = new MockLocalAgentManager({ clock: fixedClock });
  manager.upsertSession({
    id: "sess_end_001",
    tool: "codex",
    name: "Codex CLI",
    mark: "CX",
    source: "Terminal",
    sourceMode: "live",
    state: "running",
    since: fixedNow,
    lastActiveAt: fixedNow,
    muted: false,
  });

  const ended = manager.endSession("sess_end_001", "completed", {
    exitCode: 0,
    endReason: "child exited",
  });
  const snapshot = manager.getSnapshot();

  assert.equal(ended?.state, "completed");
  assert.equal(ended?.exitCode, 0);
  assert.equal(ended?.endReason, "child exited");
  assert.equal(snapshot.sessions[0].state, "completed");
  assert.equal(snapshot.sessions[0].exitCode, 0);
  assert.equal(snapshot.sessions[0].endReason, "child exited");
  assert.equal(snapshot.counts.sessions, 1);
  assert.equal(snapshot.counts.activeSessions, 0);
  assert.equal(manager.endSession("missing", "failed"), null);
});

test("subscribe notifies on snapshot updates and unsubscribe stops future notifications", () => {
  const manager = new MockLocalAgentManager({ clock: fixedClock });
  const updates = [];
  const unsubscribe = manager.subscribe((snapshot) => updates.push(snapshot));

  manager.ingestEvent({
    id: "evt_result_subscribe_001",
    sessionId: "sess_test_001",
    type: "result",
    title: "Done",
    summary: "A result arrived.",
    source: "mock",
  });

  assert.equal(updates.length, 1);
  assert.equal(updates[0].currentEventId, "evt_result_subscribe_001");

  unsubscribe();
  manager.ingestEvent({
    id: "evt_error_subscribe_001",
    sessionId: "sess_test_001",
    type: "error",
    title: "Failed",
    summary: "An error arrived.",
    source: "mock",
  });

  assert.equal(updates.length, 1);
});
