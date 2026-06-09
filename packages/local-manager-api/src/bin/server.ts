#!/usr/bin/env node
import { createLocalManagerApi, type LocalManagerApiLogger } from "../index.js";
import type { ProcessSideEffectMode } from "@notch-ai-monitor/local-manager-mock";

const HELP_TEXT = `notch-local-manager-api

Usage:
  notch-local-manager-api [options]

Options:
  --host <host>                              Host to bind. Default: 127.0.0.1
  --port <port>                              Port to bind. Default: 4317
  --process-side-effects <mock|supervised>   Enable mocked or supervised process side effects. Default: mock
  --process-persistence-file <path>          Persist process ownership/audit state to JSON
  --event-history-persistence-file <path>    Persist event history and pending action projection to JSON
  --pending-action-timeout-ms <ms>           Dev/test override for pending action timeout. Unset uses Manager default; 0 disables deadline
  --pending-action-sweep-interval-ms <ms>    Opt-in scheduler interval for pending action timeout sweep. 0 disables scheduler
  -h, --help                                 Show this help

Environment:
  NOTCH_LOCAL_MANAGER_HOST
  NOTCH_LOCAL_MANAGER_PORT
  NOTCH_PROCESS_SIDE_EFFECT_MODE
  NOTCH_PROCESS_PERSISTENCE_FILE
  NOTCH_EVENT_HISTORY_PERSISTENCE_FILE
  NOTCH_PENDING_ACTION_TIMEOUT_MS
  NOTCH_PENDING_ACTION_SWEEP_INTERVAL_MS
`;

function parseProcessSideEffectMode(value: string): ProcessSideEffectMode {
  if (value === "mock" || value === "supervised") return value;
  throw new Error("Expected process side effect mode to be one of: mock, supervised.");
}

function parseOptionalIntervalMs(value: string | undefined, label: string): number | undefined {
  if (value === undefined || value.length === 0) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Expected ${label} to be a non-negative integer number of milliseconds.`);
  }
  return parsed;
}

function parseArgs(argv: string[]): {
  host: string;
  port: number;
  processPersistenceFile?: string;
  eventHistoryPersistenceFile?: string;
  pendingActionTimeoutMs?: number;
  pendingActionSweepIntervalMs?: number;
  processSideEffectMode: ProcessSideEffectMode;
} {
  let host = process.env.NOTCH_LOCAL_MANAGER_HOST ?? "127.0.0.1";
  let port = Number.parseInt(process.env.NOTCH_LOCAL_MANAGER_PORT ?? "4317", 10);
  let processPersistenceFile = process.env.NOTCH_PROCESS_PERSISTENCE_FILE;
  let eventHistoryPersistenceFile = process.env.NOTCH_EVENT_HISTORY_PERSISTENCE_FILE;
  let pendingActionTimeoutMs = parseOptionalIntervalMs(
    process.env.NOTCH_PENDING_ACTION_TIMEOUT_MS,
    "NOTCH_PENDING_ACTION_TIMEOUT_MS"
  );
  let pendingActionSweepIntervalMs = parseOptionalIntervalMs(
    process.env.NOTCH_PENDING_ACTION_SWEEP_INTERVAL_MS,
    "NOTCH_PENDING_ACTION_SWEEP_INTERVAL_MS"
  );
  let processSideEffectMode = parseProcessSideEffectMode(
    process.env.NOTCH_PROCESS_SIDE_EFFECT_MODE ?? "mock"
  );

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--host" && next) {
      host = next;
      index += 1;
    } else if (arg === "--port" && next) {
      port = Number.parseInt(next, 10);
      index += 1;
    } else if (arg === "--process-persistence-file" && next) {
      processPersistenceFile = next;
      index += 1;
    } else if (arg === "--event-history-persistence-file" && next) {
      eventHistoryPersistenceFile = next;
      index += 1;
    } else if (arg === "--process-side-effects" && next) {
      processSideEffectMode = parseProcessSideEffectMode(next);
      index += 1;
    } else if (arg === "--pending-action-timeout-ms" && next) {
      pendingActionTimeoutMs = parseOptionalIntervalMs(next, "--pending-action-timeout-ms");
      index += 1;
    } else if (arg === "--pending-action-sweep-interval-ms" && next) {
      pendingActionSweepIntervalMs = parseOptionalIntervalMs(next, "--pending-action-sweep-interval-ms");
      index += 1;
    }
  }

  if (!Number.isFinite(port) || port < 0 || port > 65535) {
    throw new Error("Expected --port to be a number between 0 and 65535.");
  }

  return {
    host,
    port,
    processSideEffectMode,
    ...(processPersistenceFile ? { processPersistenceFile } : {}),
    ...(eventHistoryPersistenceFile ? { eventHistoryPersistenceFile } : {}),
    ...(pendingActionTimeoutMs !== undefined ? { pendingActionTimeoutMs } : {}),
    ...(pendingActionSweepIntervalMs !== undefined ? { pendingActionSweepIntervalMs } : {}),
  };
}

function createAppManagedLogger(): LocalManagerApiLogger | undefined {
  if (process.env.NOTCH_APP_MANAGED !== "1") return undefined;

  const write = (level: "info" | "warn" | "error", message: string, details?: Record<string, unknown>): void => {
    const suffix = details ? ` ${JSON.stringify(details)}` : "";
    console.error(`[notch-manager] ${level} ${message}${suffix}`);
  };

  return {
    info: (message, details) => write("info", message, details),
    warn: (message, details) => write("warn", message, details),
    error: (message, details) => write("error", message, details),
  };
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(HELP_TEXT);
  process.exit(0);
}

const {
  host,
  port,
  processPersistenceFile,
  eventHistoryPersistenceFile,
  pendingActionTimeoutMs,
  pendingActionSweepIntervalMs,
  processSideEffectMode,
} = parseArgs(process.argv.slice(2));
const appManagedLogger = createAppManagedLogger();
const api = createLocalManagerApi({
  processSideEffectMode,
  ...(appManagedLogger ? { logger: appManagedLogger } : {}),
  ...(processPersistenceFile ? { processPersistenceFile } : {}),
  ...(eventHistoryPersistenceFile ? { eventHistoryPersistenceFile } : {}),
  ...(pendingActionTimeoutMs !== undefined ? { pendingActionTimeoutMs } : {}),
  ...(pendingActionSweepIntervalMs !== undefined ? { pendingActionSweepIntervalMs } : {}),
});
const address = await api.listen(port, host);

console.log(
  `Notch local manager API listening at ${address.url} (process side effects: ${processSideEffectMode}, pending action scheduler: ${
    pendingActionSweepIntervalMs && pendingActionSweepIntervalMs > 0
      ? `${pendingActionSweepIntervalMs}ms`
      : "off"
  }, pending action timeout: ${
    pendingActionTimeoutMs === undefined
      ? "default"
      : pendingActionTimeoutMs > 0
        ? `${pendingActionTimeoutMs}ms`
        : "off"
  })`
);

async function shutdown(): Promise<void> {
  await api.close();
  process.exit(0);
}

process.once("SIGINT", () => {
  void shutdown();
});
process.once("SIGTERM", () => {
  void shutdown();
});
