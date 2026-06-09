import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  classifyOutputLine,
  classifyOutputLineForProfile,
  createEventCreatedEnvelope,
  createEventFromLine,
  createEventFromType,
  createProcessRegistrationPayload,
  createSession,
  createSessionEndedEnvelope,
  createSessionUpsertEnvelope,
  formatLaunchCommand,
  parseCliArgs,
  parsePsOutput,
  postEnvelope,
  postProcessRegistration,
  resolveSourceProfile,
  runNotchRun,
  runRealCliAdapter,
} from "../dist/src/index.js";
import {
  parseNotchRunSmokeArgs,
  runNotchRunSmoke,
} from "../dist/src/smoke/notch-run-smoke.js";
import {
  parseActionResolutionSmokeArgs,
  runActionResolutionSmoke,
} from "../dist/src/smoke/action-resolution-smoke.js";

const fixedNow = "2026-06-06T12:00:00+08:00";

async function readFixtureLines(name) {
  const text = await readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function fakeSnapshot(state) {
  const activeEvents = state.events.filter((event) => event.status === "active");
  const currentEvent = activeEvents[0] ?? null;
  return {
    sessions: state.sessions,
    events: state.events,
    activeEventIds: activeEvents.map((event) => event.id),
    currentEventId: currentEvent?.id ?? null,
    counts: {
      sessions: state.sessions.length,
      activeSessions: state.sessions.filter((session) => ["running", "waiting"].includes(session.state)).length,
      activeEvents: activeEvents.length,
    },
    viewHints: {
      mood: currentEvent?.type === "result" ? "happy" : currentEvent?.type === "error" ? "sad" : currentEvent?.type === "confirm" ? "waiting" : "none",
      restingState: currentEvent ? "glance" : "dormant",
      shouldAutoPeek: false,
    },
  };
}

async function withFakeManagerApi(run) {
  const state = {
    sessions: [],
    events: [],
    processRegistrations: [],
  };
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");

    if (request.method === "GET" && url.pathname === "/health") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true, status: "ok" }));
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/debug/reset") {
      state.sessions = [];
      state.events = [];
      state.processRegistrations = [];
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true, event: "notch.debug.reset", snapshot: fakeSnapshot(state) }));
      return;
    }

    if (request.method === "GET" && url.pathname === "/v1/snapshot") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true, snapshot: fakeSnapshot(state) }));
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/envelopes") {
      const chunks = [];
      request.on("data", (chunk) => chunks.push(chunk));
      request.on("end", () => {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        let result;

        if (body.event === "notch.session.upserted") {
          const session = body.payload.session;
          state.sessions = [...state.sessions.filter((item) => item.id !== session.id), session];
          result = { session };
        } else if (body.event === "notch.session.ended") {
          const session = state.sessions.find((item) => item.id === body.payload.sessionId);
          if (session) {
            const nextSession = { ...session, state: body.payload.state };
            if (typeof body.payload.exitCode === "number") nextSession.exitCode = body.payload.exitCode;
            if (typeof body.payload.reason === "string") nextSession.endReason = body.payload.reason;
            state.sessions = [...state.sessions.filter((item) => item.id !== session.id), nextSession];
            result = { session: nextSession };
          }
        } else if (body.event === "notch.event.created") {
          const event = {
            priority: body.payload.event.type === "confirm" ? 80 : body.payload.event.type === "error" ? 70 : 55,
            status: "active",
            actions: [],
            ...body.payload.event,
          };
          state.events = [...state.events.filter((item) => item.id !== event.id), event];
          result = { event };
        } else if (body.event === "notch.action.requested") {
          const payload = body.payload;
          const event = state.events.find((item) => item.id === payload.eventId);
          const action = event?.actions.find((item) => item.id === payload.actionId);
          const resultPayload = {
            requestId: payload.requestId,
            eventId: payload.eventId,
            actionId: payload.actionId,
            status: "rejected",
            message: "动作不存在",
          };

          if (event && action && event.status === "active" && action.enabled) {
            resultPayload.effects = [{ type: action.sideEffect, mocked: true, target: event.sessionId }];

            if (action.resolves) {
              const resolvedEventStatus = action.id === "ignore" ? "ignored" : "resolved";
              const nextEvent = {
                ...event,
                status: resolvedEventStatus,
                updatedAt: fixedNow,
                resolvedAt: fixedNow,
                resolution: action.id === "ignore" ? "ignored" : "resolved",
              };
              state.events = [...state.events.filter((item) => item.id !== event.id), nextEvent];
              resultPayload.status = "completed";
              resultPayload.message = action.id === "ignore" ? "已模拟忽略事件" : "已模拟完成动作";
              resultPayload.resolution = nextEvent.resolution;
              resultPayload.resolvedEventStatus = resolvedEventStatus;
              resultPayload.nextEventId = fakeSnapshot(state).currentEventId;
            } else {
              resultPayload.status = "noop";
              resultPayload.message = `已模拟动作：${action.label}`;
              resultPayload.nextEventId = fakeSnapshot(state).currentEventId;
            }
          }

          result = {
            envelope: {
              protocol: "notch-ai-monitor",
              version: 1,
              id: "fake_action_result_0001",
              event: "notch.action.result",
              ts: fixedNow,
              source: { kind: "manager", name: "fake-manager" },
              correlationId: body.correlationId ?? payload.requestId,
              payload: resultPayload,
            },
          };
        }

        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ ok: true, event: body.event, result, snapshot: fakeSnapshot(state) }));
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/process/registrations") {
      const chunks = [];
      request.on("data", (chunk) => chunks.push(chunk));
      request.on("end", () => {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        state.processRegistrations.push(body);
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({
          ok: true,
          event: "notch.process.registered",
          result: {
            registration: {
              sessionId: body.sessionId,
              runId: body.runId,
              launchProfileHash: body.launchProfileHash,
              commandHash: body.commandHash,
              capabilities: body.capabilities,
            },
          },
          snapshot: fakeSnapshot(state),
        }));
      });
      return;
    }

    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: { message: "not found" } }));
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await run(baseUrl, state);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

test("source profiles map to the expected protocol-facing identity", () => {
  assert.deepEqual(resolveSourceProfile("codex-cli"), {
    id: "codex-cli",
    tool: "codex",
    name: "Codex CLI",
    mark: "CX",
    source: "Terminal",
  });
  assert.deepEqual(resolveSourceProfile("claude-code-cli"), {
    id: "claude-code-cli",
    tool: "claude",
    name: "Claude Code CLI",
    mark: "CL",
    source: "Terminal",
  });
  assert.deepEqual(resolveSourceProfile("qwen-cli"), {
    id: "qwen-cli",
    tool: "qwen",
    name: "Qwen CLI",
    mark: "QW",
    source: "Terminal",
  });
  assert.equal(resolveSourceProfile("cursor-app").tool, "custom");
  assert.equal(resolveSourceProfile("codex-app").source, "Codex App");
  assert.equal(resolveSourceProfile("custom", { name: "My Tool" }).name, "My Tool");
});

test("ps output parser discovers supported CLI and app processes", () => {
  const processes = parsePsOutput(`
    101 /Applications/Cursor.app/Contents/MacOS/Cursor
    102 /opt/homebrew/bin/codex --model gpt-5
    103 /usr/local/bin/claude --dangerously-skip-permissions
    104 /Users/example/.local/bin/qwen chat
    105 /Applications/Codex.app/Contents/MacOS/Codex App
    106 /usr/bin/node ./server.js
    107 /Applications/Cursor.app/Contents/Frameworks/Cursor Helper.app/Contents/MacOS/Cursor Helper --type=utility
    108 /Applications/Codex.app/Contents/Resources/codex app-server --listen stdio://
    109 /Applications/Codex.app/Contents/Frameworks/Codex Framework.framework/Helpers/Codex Helper --type=renderer
  `);

  assert.deepEqual(
    processes.map((item) => [item.pid, item.profileId]),
    [
      [101, "cursor-app"],
      [102, "codex-cli"],
      [103, "claude-code-cli"],
      [104, "qwen-cli"],
      [105, "codex-app"],
    ]
  );
});

test("line classifier keeps parsing conservative but catches confirm, error, and result signals", () => {
  const confirm = classifyOutputLine("Approve command: rm -rf ./tmp/generated && git clean -fd");
  assert.equal(confirm.type, "confirm");
  assert.equal(confirm.command, "rm -rf ./tmp/generated && git clean -fd");

  const error = classifyOutputLine("Traceback: ModuleNotFoundError: No module named yaml");
  assert.equal(error.type, "error");
  assert.match(error.logExcerpt, /ModuleNotFoundError/);

  const result = classifyOutputLine("Result ready: generated 6 cards");
  assert.equal(result.type, "result");

  assert.equal(classifyOutputLine("streaming ordinary assistant text"), null);
});

test("profile-aware classifier parses Codex CLI fixture signals and ignores ordinary text", async () => {
  const lines = await readFixtureLines("codex-cli-output.txt");
  const confirmLines = lines.filter((line) =>
    /^(Proposed command|Suggested command|Run command|Executing command|Requesting approval)/.test(line)
  );
  const resultLines = lines.filter((line) => /^(Completed|Done|Result|Success)/.test(line));
  const errorLines = lines.filter((line) => /^(Error|Failed|Exception|Fatal)/.test(line));
  const ordinaryLines = lines.filter((line) => /^(Streaming assistant text|I will look)/.test(line));

  assert.deepEqual(
    confirmLines.map((line) => classifyOutputLineForProfile(line, "codex-cli")?.type),
    ["confirm", "confirm", "confirm", "confirm", "confirm"]
  );
  assert.equal(
    classifyOutputLineForProfile(confirmLines[0], "codex-cli")?.command,
    "npm run test -w @notch-ai-monitor/cli-adapter-real"
  );
  assert.equal(
    classifyOutputLineForProfile(confirmLines[4], "codex-cli")?.command,
    "rm -rf ./tmp/generated && git clean -fd"
  );
  assert.deepEqual(
    resultLines.map((line) => classifyOutputLineForProfile(line, "codex-cli")?.type),
    ["result", "result", "result", "result"]
  );
  assert.deepEqual(
    errorLines.map((line) => classifyOutputLineForProfile(line, "codex-cli")?.type),
    ["error", "error", "error", "error"]
  );
  assert.deepEqual(
    ordinaryLines.map((line) => classifyOutputLineForProfile(line, "codex-cli")),
    [null, null]
  );
});

test("profile-aware classifier parses Claude Code CLI fixture signals and ignores ordinary text", async () => {
  const lines = await readFixtureLines("claude-code-cli-output.txt");
  const confirmLines = lines.filter((line) =>
    /^(Bash|Tool use|Command needing approval|Permission required|Do you want to proceed)/.test(line)
  );
  const resultLines = lines.filter((line) => /^(Task completed|Done|Result ready|Success)/.test(line));
  const errorLines = lines.filter((line) => /^(Error|Failed|Traceback|Permission denied)/.test(line));
  const ordinaryLines = lines.filter((line) => /^(I am checking|普通 assistant)/.test(line));

  assert.deepEqual(
    confirmLines.map((line) => classifyOutputLineForProfile(line, "claude-code-cli")?.type),
    ["confirm", "confirm", "confirm", "confirm", "confirm"]
  );
  assert.equal(
    classifyOutputLineForProfile(confirmLines[0], "claude-code-cli")?.command,
    "npm run test -w @notch-ai-monitor/cli-adapter-real"
  );
  assert.equal(classifyOutputLineForProfile(confirmLines[1], "claude-code-cli")?.command, "git status --short");
  assert.equal(classifyOutputLineForProfile(confirmLines[4], "claude-code-cli")?.command, "npm run lint");
  assert.deepEqual(
    resultLines.map((line) => classifyOutputLineForProfile(line, "claude-code-cli")?.type),
    ["result", "result", "result", "result"]
  );
  assert.deepEqual(
    errorLines.map((line) => classifyOutputLineForProfile(line, "claude-code-cli")?.type),
    ["error", "error", "error", "error"]
  );
  assert.deepEqual(
    ordinaryLines.map((line) => classifyOutputLineForProfile(line, "claude-code-cli")),
    [null, null]
  );
});

test("ordinary fixture remains ignored and Qwen keeps generic-only parser behavior", async () => {
  const ordinaryLines = await readFixtureLines("ordinary-text.txt");
  assert.deepEqual(
    ordinaryLines.map((line) => classifyOutputLineForProfile(line, "codex-cli")),
    [null, null, null, null]
  );
  assert.deepEqual(
    ordinaryLines.map((line) => classifyOutputLineForProfile(line, "claude-code-cli")),
    [null, null, null, null]
  );

  assert.equal(
    classifyOutputLineForProfile("Proposed command: npm run test -w @notch-ai-monitor/cli-adapter-real", "qwen-cli"),
    null
  );
  assert.equal(classifyOutputLineForProfile("Approve command: npm test", "qwen-cli")?.type, "confirm");
});

test("cli arg parser keeps child command after -- out of adapter parsing", () => {
  const parsed = parseCliArgs([
    "wrapper",
    "--profile",
    "claude-code-cli",
    "--source-mode",
    "live",
    "--stdio",
    "inherit",
    "--cwd",
    "/tmp/notch-child",
    "--",
    "node",
    "-e",
    "console.log('--profile qwen-cli --cwd /elsewhere')",
    "--cwd",
    "/child/only",
  ]);

  assert.equal(parsed.mode, "wrapper");
  assert.equal(parsed.profileId, "claude-code-cli");
  assert.equal(parsed.sourceMode, "live");
  assert.equal(parsed.stdioMode, "inherit");
  assert.equal(parsed.cwd, "/tmp/notch-child");
  assert.equal(parsed.childCommand, "node");
  assert.deepEqual(parsed.childArgs, [
    "-e",
    "console.log('--profile qwen-cli --cwd /elsewhere')",
    "--cwd",
    "/child/only",
  ]);

  assert.throws(() => parseCliArgs(["wrapper", "--profile", "codex-cli"]), /requires a child command/);
});

test("event line parsing builds manager-ingestable event inputs", () => {
  const profile = resolveSourceProfile("codex-cli");
  const session = createSession(profile, {
    sessionId: "sess_real_test_001",
    processId: 4317,
    sourceMode: "wrapper",
    cwd: "/Users/example/notch-ai-monitor",
    now: fixedNow,
  });
  const event = createEventFromLine("Proposed command: npm run test -w @notch-ai-monitor/cli-adapter-real", session, profile, {
    now: fixedNow,
    sequence: 7,
  });

  assert.equal(event.type, "confirm");
  assert.equal(event.sessionId, session.id);
  assert.equal(event.command, "npm run test -w @notch-ai-monitor/cli-adapter-real");
  assert.equal(event.source, "Terminal");
  assert.equal(event.evidence.origin, "Codex CLI output");
  assert.equal(session.sourceMode, "wrapper");
});

test("envelope generation uses protocol envelope shape and profile source", () => {
  const profile = resolveSourceProfile("codex-cli");
  const session = createSession(profile, {
    sessionId: "sess_codex_env_001",
    processId: 9001,
    sourceMode: "scan",
    cwd: "/Users/example/project",
    now: fixedNow,
  });
  const event = createEventFromType("result", session, profile, {
    now: fixedNow,
    sequence: 1,
    summary: "Completed index build.",
  });
  const sessionEnvelope = createSessionUpsertEnvelope(session, profile, fixedNow);
  const eventEnvelope = createEventCreatedEnvelope(event, session, profile, fixedNow);

  assert.equal(sessionEnvelope.protocol, "notch-ai-monitor");
  assert.equal(sessionEnvelope.version, 1);
  assert.equal(sessionEnvelope.event, "notch.session.upserted");
  assert.equal(sessionEnvelope.source.kind, "cli");
  assert.equal(sessionEnvelope.source.tool, "codex");
  assert.equal(sessionEnvelope.source.sourceMode, "scan");
  assert.equal(sessionEnvelope.payload.session.mark, "CX");
  assert.equal(sessionEnvelope.payload.session.sourceMode, "scan");

  assert.equal(eventEnvelope.event, "notch.event.created");
  assert.equal(eventEnvelope.payload.event.type, "result");
  assert.equal(eventEnvelope.payload.event.summary, "Completed index build.");

  const endedEnvelope = createSessionEndedEnvelope(session, profile, 0, null, fixedNow);
  assert.equal(endedEnvelope.event, "notch.session.ended");
  assert.equal(endedEnvelope.payload.sessionId, session.id);
  assert.equal(endedEnvelope.payload.state, "completed");
  assert.equal(endedEnvelope.payload.exitCode, 0);
  assert.equal(endedEnvelope.payload.reason, undefined);

  const failedEnvelope = createSessionEndedEnvelope(session, profile, 7, null, fixedNow);
  assert.equal(failedEnvelope.payload.state, "failed");
  assert.equal(failedEnvelope.payload.exitCode, 7);
  assert.equal(failedEnvelope.payload.reason, "exitCode:7");

  const signaledEnvelope = createSessionEndedEnvelope(session, profile, null, "SIGTERM", fixedNow);
  assert.equal(signaledEnvelope.payload.state, "failed");
  assert.equal(signaledEnvelope.payload.exitCode, undefined);
  assert.equal(signaledEnvelope.payload.reason, "signal:SIGTERM");
});

test("postEnvelope sends JSON to /v1/envelopes", async () => {
  let server;
  const received = new Promise((resolve) => {
    server = createServer((request, response) => {
      const chunks = [];
      request.on("data", (chunk) => chunks.push(chunk));
      request.on("end", () => {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ ok: true, receivedEvent: body.event }));
        resolve({ request, body });
      });
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const profile = resolveSourceProfile("qwen-cli");
  const session = createSession(profile, {
    sessionId: "sess_http_post_001",
    now: fixedNow,
  });
  const envelope = createSessionUpsertEnvelope(session, profile, fixedNow);

  try {
    const response = await postEnvelope(baseUrl, envelope);
    const captured = await received;

    assert.deepEqual(response, { ok: true, receivedEvent: "notch.session.upserted" });
    assert.equal(captured.request.method, "POST");
    assert.equal(captured.request.url, "/v1/envelopes");
    assert.equal(captured.body.payload.session.name, "Qwen CLI");
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
});

test("process registration payload records launch profile and ownership metadata", () => {
  const profile = resolveSourceProfile("codex-cli");
  const session = createSession(profile, {
    sessionId: "sess_process_registration_payload_001",
    processId: 9876,
    sourceMode: "live",
    cwd: "/Users/example/project",
    now: fixedNow,
  });
  const payload = createProcessRegistrationPayload({
    session,
    profile,
    childCommand: "codex",
    childArgs: ["--model", "gpt-5", "hello world"],
    childProcessId: 9876,
    cwd: "/Users/example/project",
    now: fixedNow,
  });

  assert.equal(formatLaunchCommand("codex", ["--model", "gpt-5", "hello world"]), "codex --model gpt-5 \"hello world\"");
  assert.equal(payload.sessionId, session.id);
  assert.equal(payload.adapterId, "cli-adapter-real:codex-cli");
  assert.equal(payload.cwd, "/Users/example/project");
  assert.equal(payload.command, "codex --model gpt-5 \"hello world\"");
  assert.equal(payload.executable, "codex");
  assert.equal(payload.pid, 9876);
  assert.equal(payload.processStartedAt, fixedNow);
  assert.deepEqual(payload.capabilities, ["process.retry", "process.terminate"]);
  assert.equal(payload.riskReplayMode, "required");
  assert.match(payload.commandHash, /^cmd_[a-f0-9]{8}$/);
  assert.match(payload.launchProfileHash, /^launch_[a-f0-9]{8}$/);
  assert.match(payload.runId, /^run_[a-f0-9]{8}$/);
  assert.match(payload.supervisorTokenHash, /^supervisor_[a-f0-9]{8}$/);
});

test("postProcessRegistration sends JSON to /v1/process/registrations", async () => {
  let server;
  const received = new Promise((resolve) => {
    server = createServer((request, response) => {
      const chunks = [];
      request.on("data", (chunk) => chunks.push(chunk));
      request.on("end", () => {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ ok: true, event: "notch.process.registered", sessionId: body.sessionId }));
        resolve({ request, body });
      });
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const registration = {
    sessionId: "sess_http_registration_001",
    runId: "run_http_registration_001",
    adapterId: "cli-adapter-real:codex-cli",
    cwd: "/Users/example/project",
    command: "codex --version",
    executable: "codex",
    launchProfileHash: "launch_http_registration_001",
    supervisorTokenHash: "supervisor_http_registration_001",
    commandHash: "cmd_http_registration_001",
    capabilities: ["process.retry", "process.terminate"],
    riskReplayMode: "required",
  };

  try {
    const response = await postProcessRegistration(baseUrl, registration);
    const captured = await received;

    assert.deepEqual(response, {
      ok: true,
      event: "notch.process.registered",
      sessionId: "sess_http_registration_001",
    });
    assert.equal(captured.request.method, "POST");
    assert.equal(captured.request.url, "/v1/process/registrations");
    assert.equal(captured.body.runId, "run_http_registration_001");
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
});

test("notch-run defaults wrapper sessions to live source mode", async () => {
  const received = [];
  const processRegistrations = [];
  const server = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (request.url === "/v1/process/registrations") {
        processRegistrations.push(body);
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ ok: true, event: "notch.process.registered" }));
        return;
      }
      received.push(body);
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true, event: body.event }));
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const childCwd = await mkdtemp(path.join(tmpdir(), "notch-run-"));

  const originalStdoutWrite = process.stdout.write;
  const originalExitCode = process.exitCode;
  process.stdout.write = (chunk, encoding, callback) => {
    if (typeof encoding === "function") encoding();
    if (typeof callback === "function") callback();
    return true;
  };

  try {
    process.exitCode = undefined;
    await runNotchRun([
      "--url",
      baseUrl,
      "--profile",
      "codex-cli",
      "--cwd",
      childCwd,
      "--",
      process.execPath,
      "-e",
      "console.log('Completed: live smoke')",
    ]);

    assert.equal(process.exitCode, undefined);
    assert.equal(received[0].event, "notch.session.upserted");
    assert.equal(received[0].payload.session.sourceMode, "live");
    assert.equal(received[0].source.sourceMode, "live");
    assert.equal(processRegistrations.length, 1);
    assert.equal(processRegistrations[0].sessionId, received[0].payload.session.id);
    assert.equal(processRegistrations[0].adapterId, "cli-adapter-real:codex-cli");
    assert.equal(processRegistrations[0].cwd, childCwd);
    assert.equal(processRegistrations[0].executable, process.execPath);
    assert.equal(processRegistrations[0].command, `${process.execPath} -e "console.log('Completed: live smoke')"`);
    assert.equal(processRegistrations[0].pid > 0, true);
    assert.deepEqual(processRegistrations[0].capabilities, ["process.retry", "process.terminate"]);
    assert.equal(received[1].payload.event.type, "result");
    assert.equal(received[2].event, "notch.session.ended");
    assert.equal(received[2].payload.sessionId, received[0].payload.session.id);
    assert.equal(received[2].payload.state, "completed");
  } finally {
    process.stdout.write = originalStdoutWrite;
    process.exitCode = originalExitCode;
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    await rm(childCwd, { recursive: true, force: true });
  }
});

test("notch-run smoke presets select low-risk real CLI probes", () => {
  const codex = parseNotchRunSmokeArgs([
    "--preset",
    "codex-version",
    "--cwd",
    "/tmp/notch-codex-probe",
  ]);
  assert.equal(codex.profileId, "codex-cli");
  assert.equal(codex.expectType, null);
  assert.equal(codex.expectedExitCode, 0);
  assert.equal(codex.expectedEndReason, null);
  assert.equal(codex.childCommand, "codex");
  assert.deepEqual(codex.childArgs, ["--version"]);

  const failed = parseNotchRunSmokeArgs(["--preset", "node-exit-7"]);
  assert.equal(failed.profileId, "codex-cli");
  assert.equal(failed.expectType, "error");
  assert.equal(failed.expectedExitCode, 7);
  assert.equal(failed.expectedEndReason, "exitCode:7");
  assert.equal(failed.childCommand, process.execPath);
  assert.deepEqual(failed.childArgs, ["-e", "console.error('Error: notch-run failure smoke'); process.exit(7)"]);

  const claude = parseNotchRunSmokeArgs([
    "--preset",
    "claude-version",
    "--profile",
    "custom",
    "--expect-type",
    "result",
    "--",
    "node",
    "-e",
    "console.log('Result ready: custom probe')",
  ]);
  assert.equal(claude.profileId, "custom");
  assert.equal(claude.expectType, "result");
  assert.equal(claude.expectedExitCode, 0);
  assert.equal(claude.expectedEndReason, null);
  assert.equal(claude.childCommand, "node");
  assert.deepEqual(claude.childArgs, ["-e", "console.log('Result ready: custom probe')"]);
});

test("action resolution smoke args default to preparing and ignoring failed events", () => {
  const options = parseActionResolutionSmokeArgs([
    "--url",
    "http://127.0.0.1:4317",
    "--no-prepare",
    "--action",
    "ignore",
    "--expected-exit-code",
    "7",
  ]);

  assert.equal(options.baseUrl, "http://127.0.0.1:4317");
  assert.equal(options.prepareFailure, false);
  assert.equal(options.actionId, "ignore");
  assert.equal(options.expectedSessionState, "failed");
  assert.equal(options.expectedExitCode, 7);
  assert.equal(options.expectedEndReason, "exitCode:7");
  assert.equal(options.expectedResultStatus, "completed");
  assert.equal(options.expectedEventStatus, "ignored");
  assert.equal(options.expectedResolvedEventStatus, "ignored");
  assert.equal(options.expectedActiveEvents, 0);

  const viewLog = parseActionResolutionSmokeArgs(["--action", "view-log"]);
  assert.equal(viewLog.actionId, "view-log");
  assert.equal(viewLog.expectedResultStatus, "noop");
  assert.equal(viewLog.expectedEventStatus, "active");
  assert.equal(viewLog.expectedResolvedEventStatus, null);
  assert.equal(viewLog.expectedActiveEvents, 1);
});

test("notch-run smoke resets manager and validates live snapshot", async () => {
  await withFakeManagerApi(async (baseUrl, state) => {
    const childCwd = await mkdtemp(path.join(tmpdir(), "notch-run-smoke-"));
    const originalStdoutWrite = process.stdout.write;
    const originalStderrWrite = process.stderr.write;
    const originalExitCode = process.exitCode;
    let stdoutText = "";
    let stderrText = "";

    process.stdout.write = (chunk, encoding, callback) => {
      stdoutText += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
      if (typeof encoding === "function") encoding();
      if (typeof callback === "function") callback();
      return true;
    };
    process.stderr.write = (chunk, encoding, callback) => {
      stderrText += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
      if (typeof encoding === "function") encoding();
      if (typeof callback === "function") callback();
      return true;
    };

    try {
      process.exitCode = undefined;
      await runNotchRunSmoke([
        "--url",
        baseUrl,
        "--profile",
        "codex-cli",
        "--cwd",
        childCwd,
      ]);

      assert.equal(process.exitCode, undefined);
      assert.match(stdoutText, /Completed: notch-run live smoke/);
      assert.match(stdoutText, /"mode": "notch-run-smoke"/);
      assert.equal(stderrText, "");
      assert.equal(state.sessions.length, 1);
      assert.equal(state.sessions[0].sourceMode, "live");
      assert.equal(state.processRegistrations.length, 1);
      assert.equal(state.processRegistrations[0].sessionId, state.sessions[0].id);
      assert.equal(state.processRegistrations[0].adapterId, "cli-adapter-real:codex-cli");
      assert.equal(state.events.length, 1);
      assert.equal(state.events[0].type, "result");
    } finally {
      process.stdout.write = originalStdoutWrite;
      process.stderr.write = originalStderrWrite;
      process.exitCode = originalExitCode;
      await rm(childCwd, { recursive: true, force: true });
    }
  });
});

test("notch-run smoke can validate a live session without requiring a parsed event", async () => {
  await withFakeManagerApi(async (baseUrl, state) => {
    const childCwd = await mkdtemp(path.join(tmpdir(), "notch-run-session-smoke-"));
    const originalStdoutWrite = process.stdout.write;
    const originalStderrWrite = process.stderr.write;
    const originalExitCode = process.exitCode;
    let stdoutText = "";
    let stderrText = "";

    process.stdout.write = (chunk, encoding, callback) => {
      stdoutText += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
      if (typeof encoding === "function") encoding();
      if (typeof callback === "function") callback();
      return true;
    };
    process.stderr.write = (chunk, encoding, callback) => {
      stderrText += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
      if (typeof encoding === "function") encoding();
      if (typeof callback === "function") callback();
      return true;
    };

    try {
      process.exitCode = undefined;
      await runNotchRunSmoke([
        "--url",
        baseUrl,
        "--profile",
        "codex-cli",
        "--cwd",
        childCwd,
        "--expect-type",
        "none",
        "--",
        process.execPath,
        "-e",
        "console.log('codex-cli 0.0.0-test')",
      ]);

      assert.equal(process.exitCode, undefined);
      assert.match(stdoutText, /codex-cli 0\.0\.0-test/);
      assert.match(stdoutText, /"expectType": "none"/);
      assert.equal(stderrText, "");
      assert.equal(state.sessions.length, 1);
      assert.equal(state.sessions[0].sourceMode, "live");
      assert.equal(state.events.length, 0);
    } finally {
      process.stdout.write = originalStdoutWrite;
      process.stderr.write = originalStderrWrite;
      process.exitCode = originalExitCode;
      await rm(childCwd, { recursive: true, force: true });
    }
  });
});

test("notch-run smoke validates an expected failed child exit", async () => {
  await withFakeManagerApi(async (baseUrl, state) => {
    const childCwd = await mkdtemp(path.join(tmpdir(), "notch-run-failed-smoke-"));
    const originalStdoutWrite = process.stdout.write;
    const originalStderrWrite = process.stderr.write;
    const originalExitCode = process.exitCode;
    let stdoutText = "";
    let stderrText = "";

    process.stdout.write = (chunk, encoding, callback) => {
      stdoutText += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
      if (typeof encoding === "function") encoding();
      if (typeof callback === "function") callback();
      return true;
    };
    process.stderr.write = (chunk, encoding, callback) => {
      stderrText += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
      if (typeof encoding === "function") encoding();
      if (typeof callback === "function") callback();
      return true;
    };

    try {
      process.exitCode = undefined;
      await runNotchRunSmoke([
        "--url",
        baseUrl,
        "--preset",
        "node-exit-7",
        "--cwd",
        childCwd,
      ]);

      assert.equal(process.exitCode, undefined);
      assert.match(stderrText, /Error: notch-run failure smoke/);
      assert.match(stdoutText, /"preset": "node-exit-7"/);
      assert.match(stdoutText, /"expectedExitCode": 7/);
      assert.match(stdoutText, /"sessionState": "failed"/);
      assert.match(stdoutText, /"sessionExitCode": 7/);
      assert.match(stdoutText, /"sessionEndReason": "exitCode:7"/);
      assert.equal(state.sessions.length, 1);
      assert.equal(state.sessions[0].sourceMode, "live");
      assert.equal(state.sessions[0].state, "failed");
      assert.equal(state.sessions[0].exitCode, 7);
      assert.equal(state.sessions[0].endReason, "exitCode:7");
      assert.equal(state.events.length, 1);
      assert.equal(state.events[0].type, "error");
    } finally {
      process.stdout.write = originalStdoutWrite;
      process.stderr.write = originalStderrWrite;
      process.exitCode = originalExitCode;
      await rm(childCwd, { recursive: true, force: true });
    }
  });
});

test("action resolution smoke resolves an active failed event and preserves session metadata", async () => {
  await withFakeManagerApi(async (baseUrl, state) => {
    const originalStdoutWrite = process.stdout.write;
    const originalStderrWrite = process.stderr.write;
    let stdoutText = "";
    let stderrText = "";

    state.sessions = [
      {
        id: "sess_action_smoke_001",
        tool: "codex",
        name: "Codex CLI",
        mark: "CX",
        source: "Terminal",
        state: "failed",
        since: fixedNow,
        lastActiveAt: fixedNow,
        muted: false,
        sourceMode: "live",
        cwd: "/Users/example/notch-ai-monitor/packages/cli-adapter-real",
        exitCode: 7,
        endReason: "exitCode:7",
      },
    ];
    state.events = [
      {
        id: "evt_action_smoke_001",
        sessionId: "sess_action_smoke_001",
        type: "error",
        priority: 70,
        status: "active",
        title: "运行失败",
        summary: "Error: notch-run failure smoke",
        source: "Terminal",
        createdAt: fixedNow,
        updatedAt: fixedNow,
        actions: [
          {
            id: "ignore",
            label: "忽略",
            style: "secondary",
            resolves: true,
            sideEffect: "none",
            enabled: true,
          },
        ],
      },
    ];

    process.stdout.write = (chunk, encoding, callback) => {
      stdoutText += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
      if (typeof encoding === "function") encoding();
      if (typeof callback === "function") callback();
      return true;
    };
    process.stderr.write = (chunk, encoding, callback) => {
      stderrText += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
      if (typeof encoding === "function") encoding();
      if (typeof callback === "function") callback();
      return true;
    };

    try {
      await runActionResolutionSmoke(["--url", baseUrl, "--no-prepare"]);

      assert.match(stdoutText, /"mode": "action-resolution-smoke"/);
      assert.match(stdoutText, /"eventStatus": "ignored"/);
      assert.match(stdoutText, /"resultStatus": "completed"/);
      assert.match(stdoutText, /"resolvedEventStatus": "ignored"/);
      assert.match(stdoutText, /"sessionExitCode": 7/);
      assert.match(stdoutText, /"sessionEndReason": "exitCode:7"/);
      assert.equal(stderrText, "");
      assert.equal(state.events[0].status, "ignored");
      assert.equal(state.events[0].resolution, "ignored");
      assert.equal(state.sessions[0].state, "failed");
      assert.equal(state.sessions[0].exitCode, 7);
      assert.equal(state.sessions[0].endReason, "exitCode:7");
    } finally {
      process.stdout.write = originalStdoutWrite;
      process.stderr.write = originalStderrWrite;
    }
  });
});

test("action smoke validates read-only view-log without resolving the active failed event", async () => {
  await withFakeManagerApi(async (baseUrl, state) => {
    const originalStdoutWrite = process.stdout.write;
    const originalStderrWrite = process.stderr.write;
    let stdoutText = "";
    let stderrText = "";

    state.sessions = [
      {
        id: "sess_view_log_smoke_001",
        tool: "codex",
        name: "Codex CLI",
        mark: "CX",
        source: "Terminal",
        state: "failed",
        since: fixedNow,
        lastActiveAt: fixedNow,
        muted: false,
        sourceMode: "live",
        cwd: "/Users/example/notch-ai-monitor/packages/cli-adapter-real",
        exitCode: 7,
        endReason: "exitCode:7",
      },
    ];
    state.events = [
      {
        id: "evt_view_log_smoke_001",
        sessionId: "sess_view_log_smoke_001",
        type: "error",
        priority: 70,
        status: "active",
        title: "运行失败",
        summary: "Error: notch-run failure smoke",
        source: "Terminal",
        createdAt: fixedNow,
        updatedAt: fixedNow,
        actions: [
          {
            id: "view-log",
            label: "查看日志",
            style: "secondary",
            resolves: false,
            sideEffect: "navigation",
            enabled: true,
          },
        ],
      },
    ];

    process.stdout.write = (chunk, encoding, callback) => {
      stdoutText += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
      if (typeof encoding === "function") encoding();
      if (typeof callback === "function") callback();
      return true;
    };
    process.stderr.write = (chunk, encoding, callback) => {
      stderrText += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
      if (typeof encoding === "function") encoding();
      if (typeof callback === "function") callback();
      return true;
    };

    try {
      await runActionResolutionSmoke(["--url", baseUrl, "--no-prepare", "--action", "view-log"]);

      assert.match(stdoutText, /"actionId": "view-log"/);
      assert.match(stdoutText, /"eventStatus": "active"/);
      assert.match(stdoutText, /"resultStatus": "noop"/);
      assert.match(stdoutText, /"resolvedEventStatus": null/);
      assert.match(stdoutText, /"activeEvents": 1/);
      assert.equal(stderrText, "");
      assert.equal(state.events[0].status, "active");
      assert.equal(state.sessions[0].state, "failed");
      assert.equal(state.sessions[0].exitCode, 7);
      assert.equal(state.sessions[0].endReason, "exitCode:7");
    } finally {
      process.stdout.write = originalStdoutWrite;
      process.stderr.write = originalStderrWrite;
    }
  });
});

test("wrapper inherit stdio records session lifecycle without parsing events", async () => {
  await withFakeManagerApi(async (baseUrl, state) => {
    const childCwd = await mkdtemp(path.join(tmpdir(), "notch-wrapper-inherit-"));
    const originalStdoutWrite = process.stdout.write;
    const originalExitCode = process.exitCode;
    let stdoutText = "";

    process.stdout.write = (chunk, encoding, callback) => {
      stdoutText += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
      if (typeof encoding === "function") encoding();
      if (typeof callback === "function") callback();
      return true;
    };

    try {
      process.exitCode = undefined;
      await runRealCliAdapter([
        "wrapper",
        "--url",
        baseUrl,
        "--profile",
        "codex-cli",
        "--source-mode",
        "live",
        "--stdio",
        "inherit",
        "--cwd",
        childCwd,
        "--",
        process.execPath,
        "-e",
        "",
      ]);

      assert.equal(process.exitCode, undefined);
      assert.match(stdoutText, /"stdio": "inherit"/);
      assert.equal(state.sessions.length, 1);
      assert.equal(state.sessions[0].sourceMode, "live");
      assert.equal(state.sessions[0].state, "completed");
      assert.equal(state.events.length, 0);
    } finally {
      process.stdout.write = originalStdoutWrite;
      process.exitCode = originalExitCode;
      await rm(childCwd, { recursive: true, force: true });
    }
  });
});

test("wrapper registration exposes an adapter control channel for graceful stop", async () => {
  const received = [];
  const registrations = [];
  const controlResponses = [];
  const server = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (request.url === "/v1/process/registrations") {
        registrations.push(body);
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ ok: true, event: "notch.process.registered" }));
        setTimeout(() => {
          fetch(body.controlEndpoint, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${body.controlToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              requestId: "req_wrapper_control_stop",
              sessionId: body.sessionId,
              runId: body.runId,
              launchProfileHash: body.launchProfileHash,
            }),
          })
            .then(async (controlResponse) => {
              controlResponses.push({
                status: controlResponse.status,
                body: await controlResponse.json(),
              });
            })
            .catch((error) => {
              controlResponses.push({ status: 0, error: String(error) });
            });
        }, 50);
        return;
      }

      received.push(body);
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true, event: body.event, type: body.payload?.event?.type ?? null }));
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const childCwd = await mkdtemp(path.join(tmpdir(), "notch-wrapper-control-"));
  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;
  const originalExitCode = process.exitCode;

  process.stdout.write = (chunk, encoding, callback) => {
    if (typeof encoding === "function") encoding();
    if (typeof callback === "function") callback();
    return true;
  };
  process.stderr.write = (chunk, encoding, callback) => {
    if (typeof encoding === "function") encoding();
    if (typeof callback === "function") callback();
    return true;
  };

  try {
    process.exitCode = undefined;
    await runRealCliAdapter([
      "wrapper",
      "--url",
      baseUrl,
      "--profile",
      "codex-cli",
      "--source-mode",
      "live",
      "--cwd",
      childCwd,
      "--",
      process.execPath,
      "-e",
      "process.on('SIGTERM', () => process.exit(0)); setInterval(() => {}, 1000);",
    ]);

    assert.equal(process.exitCode, undefined);
    assert.equal(registrations.length, 1);
    assert.match(registrations[0].controlEndpoint, /^http:\/\/127\.0\.0\.1:\d+\/v1\/control\/terminate-gracefully$/);
    assert.equal(typeof registrations[0].controlToken, "string");
    assert.equal(registrations[0].controlToken.length > 20, true);
    assert.match(registrations[0].supervisorTokenHash, /^supervisor_[a-f0-9]{16}$/);
    assert.equal(controlResponses.length, 1);
    assert.equal(controlResponses[0].status, 202);
    assert.equal(controlResponses[0].body.status, "accepted");

    const ended = received.find((body) => body.event === "notch.session.ended");
    assert.equal(ended.payload.sessionId, received[0].payload.session.id);
    assert.equal(ended.payload.state, "completed");
    assert.equal(ended.payload.exitCode, 0);
  } finally {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    process.exitCode = originalExitCode;
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    await rm(childCwd, { recursive: true, force: true });
  }
});

test("wrapper mode sends session and parsed child stdout/stderr events while preserving output and exit code", async () => {
  const received = [];
  const processRegistrations = [];
  const server = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (request.url === "/v1/process/registrations") {
        processRegistrations.push(body);
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ ok: true, event: "notch.process.registered" }));
        return;
      }
      received.push(body);
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true, event: body.event, type: body.payload?.event?.type ?? null }));
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const childCwd = await mkdtemp(path.join(tmpdir(), "notch-wrapper-"));

  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;
  const originalExitCode = process.exitCode;
  let stdoutText = "";
  let stderrText = "";

  process.stdout.write = (chunk, encoding, callback) => {
    stdoutText += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
    if (typeof encoding === "function") encoding();
    if (typeof callback === "function") callback();
    return true;
  };
  process.stderr.write = (chunk, encoding, callback) => {
    stderrText += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
    if (typeof encoding === "function") encoding();
    if (typeof callback === "function") callback();
    return true;
  };

  try {
    process.exitCode = undefined;
    await runRealCliAdapter([
      "wrapper",
      "--url",
      baseUrl,
      "--profile",
      "claude-code-cli",
      "--cwd",
      childCwd,
      "--",
      process.execPath,
      "-e",
      [
        "console.log('Approve command: rm -rf ./tmp/generated && git clean -fd');",
        "console.log('Result ready: generated 6 cards');",
        "console.error('Error: fixture failed');",
        "process.exitCode = 7;",
      ].join(" "),
    ]);

    assert.equal(process.exitCode, 7);
    assert.match(stdoutText, /Approve command/);
    assert.match(stdoutText, /Result ready: generated 6 cards/);
    assert.match(stdoutText, /"mode": "wrapper"/);
    assert.match(stderrText, /Error: fixture failed/);

    assert.equal(received[0].event, "notch.session.upserted");
    assert.equal(received[0].payload.session.cwd, childCwd);
    assert.equal(received[0].payload.session.name, "Claude Code CLI");
    assert.equal(received[0].payload.session.sourceMode, "wrapper");
    assert.equal(received[0].source.sourceMode, "wrapper");
    assert.equal(processRegistrations.length, 1);
    assert.equal(processRegistrations[0].sessionId, received[0].payload.session.id);
    assert.equal(processRegistrations[0].adapterId, "cli-adapter-real:claude-code-cli");
    assert.equal(processRegistrations[0].cwd, childCwd);
    assert.equal(processRegistrations[0].executable, process.execPath);
    assert.match(processRegistrations[0].command, /fixture failed/);
    assert.match(processRegistrations[0].launchProfileHash, /^launch_[a-f0-9]{8}$/);
    assert.match(processRegistrations[0].supervisorTokenHash, /^supervisor_[a-f0-9]{16}$/);

    const ended = received.find((body) => body.event === "notch.session.ended");
    assert.equal(ended.payload.sessionId, received[0].payload.session.id);
    assert.equal(ended.payload.state, "failed");
    assert.equal(ended.payload.exitCode, 7);
    assert.equal(ended.payload.reason, "exitCode:7");

    const events = received
      .filter((body) => body.event === "notch.event.created")
      .map((body) => body.payload.event);
    assert.deepEqual(
      events.map((event) => event.type).sort(),
      ["confirm", "error", "result"]
    );
    assert.equal(
      events.find((event) => event.type === "confirm").command,
      "rm -rf ./tmp/generated && git clean -fd"
    );
    assert.match(events.find((event) => event.type === "error").evidence.logExcerpt, /fixture failed/);
  } finally {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    process.exitCode = originalExitCode;
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    await rm(childCwd, { recursive: true, force: true });
  }
});
