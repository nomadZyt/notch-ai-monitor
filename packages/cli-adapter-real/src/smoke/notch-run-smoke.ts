import path from "node:path";

import type { EventType, ManagerSnapshot } from "@notch-ai-monitor/shared";

import {
  DEFAULT_LOCAL_MANAGER_URL,
  type SourceProfileId,
  runNotchRun,
} from "../index.js";

export interface NotchRunSmokeOptions {
  baseUrl: string;
  profileId: SourceProfileId;
  cwd: string;
  reset: boolean;
  preset: NotchRunSmokePreset;
  expectType: Extract<EventType, "confirm" | "result" | "error"> | null;
  expectedExitCode: number;
  expectedEndReason: string | null;
  childCommand: string;
  childArgs: string[];
}

export type NotchRunSmokePreset = "node-result" | "node-exit-7" | "codex-version" | "claude-version";

interface NotchRunSmokePresetDefinition {
  profileId: SourceProfileId;
  expectType: NotchRunSmokeOptions["expectType"];
  expectedExitCode: number;
  expectedEndReason: string | null;
  childCommand: string;
  childArgs: string[];
}

const SMOKE_PROFILES = new Set<SourceProfileId>([
  "codex-cli",
  "claude-code-cli",
  "qwen-cli",
  "cursor-app",
  "codex-app",
  "custom",
]);

const SMOKE_EXPECTED_EVENT_TYPES = new Set<NotchRunSmokeOptions["expectType"]>([
  "confirm",
  "result",
  "error",
  null,
]);

function defaultChildCommand(): [string, string[]] {
  return [
    process.execPath,
    ["-e", "console.log('Completed: notch-run live smoke')"],
  ];
}

const [defaultCommand, defaultArgs] = defaultChildCommand();

const SMOKE_PRESETS: Record<NotchRunSmokePreset, NotchRunSmokePresetDefinition> = {
  "node-result": {
    profileId: "codex-cli",
    expectType: "result",
    expectedExitCode: 0,
    expectedEndReason: null,
    childCommand: defaultCommand,
    childArgs: defaultArgs,
  },
  "node-exit-7": {
    profileId: "codex-cli",
    expectType: "error",
    expectedExitCode: 7,
    expectedEndReason: "exitCode:7",
    childCommand: process.execPath,
    childArgs: ["-e", "console.error('Error: notch-run failure smoke'); process.exit(7)"],
  },
  "codex-version": {
    profileId: "codex-cli",
    expectType: null,
    expectedExitCode: 0,
    expectedEndReason: null,
    childCommand: "codex",
    childArgs: ["--version"],
  },
  "claude-version": {
    profileId: "claude-code-cli",
    expectType: null,
    expectedExitCode: 0,
    expectedEndReason: null,
    childCommand: "claude",
    childArgs: ["--version"],
  },
};

function parseProfileId(value: string): SourceProfileId {
  if (SMOKE_PROFILES.has(value as SourceProfileId)) return value as SourceProfileId;
  throw new Error("Profile must be one of: codex-cli, claude-code-cli, qwen-cli, cursor-app, codex-app, custom.");
}

function parseExpectedType(value: string): NotchRunSmokeOptions["expectType"] {
  if (value === "none") return null;
  if (SMOKE_EXPECTED_EVENT_TYPES.has(value as NotchRunSmokeOptions["expectType"])) {
    return value as NotchRunSmokeOptions["expectType"];
  }
  throw new Error("Expected type must be one of: confirm, result, error, none.");
}

function parseSmokePreset(value: string): NotchRunSmokePreset {
  if (Object.hasOwn(SMOKE_PRESETS, value)) return value as NotchRunSmokePreset;
  throw new Error("Smoke preset must be one of: node-result, node-exit-7, codex-version, claude-version.");
}

export function parseNotchRunSmokeArgs(argv: string[]): NotchRunSmokeOptions {
  const separatorIndex = argv.indexOf("--");
  const smokeArgs = separatorIndex >= 0 ? argv.slice(0, separatorIndex) : argv;
  const childArgs = separatorIndex >= 0 ? argv.slice(separatorIndex + 1) : [];
  let presetId: NotchRunSmokePreset = "node-result";
  let baseUrl = process.env.NOTCH_LOCAL_MANAGER_URL ?? DEFAULT_LOCAL_MANAGER_URL;
  let profileIdOverride: SourceProfileId | undefined;
  let cwd = process.cwd();
  let reset = true;
  let expectTypeOverride: NotchRunSmokeOptions["expectType"] | undefined;

  for (let index = 0; index < smokeArgs.length; index += 1) {
    const arg = smokeArgs[index];
    const next = smokeArgs[index + 1];

    if (arg === "--url" && next) {
      baseUrl = next;
      index += 1;
    } else if (arg === "--profile" && next) {
      profileIdOverride = parseProfileId(next);
      index += 1;
    } else if (arg === "--cwd" && next) {
      cwd = next;
      index += 1;
    } else if (arg === "--expect-type" && next) {
      expectTypeOverride = parseExpectedType(next);
      index += 1;
    } else if (arg === "--preset" && next) {
      presetId = parseSmokePreset(next);
      index += 1;
    } else if (arg === "--no-reset") {
      reset = false;
    } else {
      throw new Error(`Unknown smoke argument: ${arg}`);
    }
  }

  const preset = SMOKE_PRESETS[presetId];
  return {
    baseUrl,
    profileId: profileIdOverride ?? preset.profileId,
    cwd,
    reset,
    preset: presetId,
    expectType: expectTypeOverride !== undefined ? expectTypeOverride : preset.expectType,
    expectedExitCode: preset.expectedExitCode,
    expectedEndReason: preset.expectedEndReason,
    childCommand: childArgs[0] ?? preset.childCommand,
    childArgs: childArgs.length > 0 ? childArgs.slice(1) : [...preset.childArgs],
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

function validateLiveSnapshot(snapshot: ManagerSnapshot, options: NotchRunSmokeOptions): void {
  const session = snapshot.sessions.find((item) => item.sourceMode === "live");
  if (!session) {
    throw new Error("Smoke failed: no live sourceMode session found in snapshot.");
  }
  if (session.cwd !== path.resolve(options.cwd)) {
    throw new Error(`Smoke failed: live session cwd mismatch. Expected ${path.resolve(options.cwd)}, got ${session.cwd}.`);
  }
  const expectedState = options.expectedExitCode === 0 ? "completed" : "failed";
  if (session.state !== expectedState) {
    throw new Error(`Smoke failed: live session state mismatch. Expected ${expectedState}, got ${session.state}.`);
  }
  if (session.exitCode !== options.expectedExitCode) {
    throw new Error(
      `Smoke failed: live session exitCode mismatch. Expected ${options.expectedExitCode}, got ${session.exitCode}.`
    );
  }
  if (options.expectedEndReason === null && session.endReason !== undefined) {
    throw new Error(`Smoke failed: live session endReason should be absent, got ${session.endReason}.`);
  }
  if (options.expectedEndReason !== null && session.endReason !== options.expectedEndReason) {
    throw new Error(
      `Smoke failed: live session endReason mismatch. Expected ${options.expectedEndReason}, got ${session.endReason}.`
    );
  }

  if (options.expectType === null) {
    return;
  }

  const event = snapshot.events.find((item) => item.status === "active" && item.type === options.expectType);
  if (!event) {
    throw new Error(`Smoke failed: no active ${options.expectType} event found in snapshot.`);
  }
  if (event.sessionId !== session.id) {
    throw new Error("Smoke failed: active event does not belong to the live session.");
  }
}

export async function runNotchRunSmoke(argv: string[] = process.argv.slice(2)): Promise<void> {
  const options = parseNotchRunSmokeArgs(argv);

  await requestJson(options.baseUrl, "/health");
  if (options.reset) {
    await requestJson(options.baseUrl, "/v1/debug/reset", { method: "POST" });
  }

  const previousExitCode = process.exitCode;
  await runNotchRun([
    "--url",
    options.baseUrl,
    "--profile",
    options.profileId,
    "--cwd",
    path.resolve(options.cwd),
    "--",
    options.childCommand,
    ...options.childArgs,
  ]);
  const observedExitCode = process.exitCode ?? 0;
  if (observedExitCode !== options.expectedExitCode) {
    throw new Error(`Smoke failed: child command exited with code ${observedExitCode}.`);
  }
  process.exitCode = previousExitCode;

  const snapshotResponse = await requestJson(options.baseUrl, "/v1/snapshot");
  const snapshot = snapshotFromResponse(snapshotResponse, "GET /v1/snapshot");
  validateLiveSnapshot(snapshot, options);

  const liveSession = snapshot.sessions.find((item) => item.sourceMode === "live");
  const activeTypes = snapshot.events
    .filter((event) => event.status === "active")
    .map((event) => event.type);

  console.log(
    JSON.stringify(
      {
        mode: "notch-run-smoke",
        ok: true,
        preset: options.preset,
        profile: options.profileId,
        expectType: options.expectType ?? "none",
        expectedExitCode: options.expectedExitCode,
        sourceMode: liveSession?.sourceMode ?? null,
        sessionState: liveSession?.state ?? null,
        sessionExitCode: liveSession?.exitCode ?? null,
        sessionEndReason: liveSession?.endReason ?? null,
        sessionId: liveSession?.id ?? null,
        eventTypes: activeTypes,
        currentEventId: snapshot.currentEventId,
        counts: snapshot.counts,
      },
      null,
      2
    )
  );
}
