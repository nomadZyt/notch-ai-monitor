import { expect, test } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../..", import.meta.url));
const apiBin = path.join(repoRoot, "packages/local-manager-api/dist/src/bin/server.js");
const notchRunBin = path.join(repoRoot, "packages/cli-adapter-real/dist/src/bin/notch-run.js");
const pendingActionTimeoutMs = 900;
const pendingActionSweepIntervalMs = 150;
const timeoutChildExitDelayMs = 2500;

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
  expect(response.ok, `${init.method ?? "GET"} ${url.href}`).toBe(true);
  return body;
}

async function waitForValue(label, predicate, timeoutMs = 10_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = await predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

function startProcess(command, args) {
  const child = spawn(command, args, {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (chunk) => {
    stdout += String(chunk);
  });
  child.stderr?.on("data", (chunk) => {
    stderr += String(chunk);
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

async function startTemporaryApi() {
  const tempDir = await mkdtemp(path.join(tmpdir(), "notch-real-link-browser-qa-"));
  const eventHistoryFile = path.join(tempDir, "event-history.json");
  const api = startProcess(process.execPath, [
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
    String(pendingActionTimeoutMs),
    "--pending-action-sweep-interval-ms",
    String(pendingActionSweepIntervalMs),
  ]);

  try {
    const apiUrl = await waitForValue("temporary API startup", () => {
      const match = api.stdout.match(/listening at (http:\/\/127\.0\.0\.1:\d+)/);
      return match?.[1] ?? null;
    });
    await requestJson(apiUrl, "/health");
    return {
      apiUrl,
      async close() {
        api.child.kill("SIGTERM");
        await api.exit;
        await rm(tempDir, { recursive: true, force: true });
      },
    };
  } catch (error) {
    api.child.kill("SIGTERM");
    await api.exit.catch(() => undefined);
    await rm(tempDir, { recursive: true, force: true });
    throw error;
  }
}

function startNotchRun(baseUrl, label) {
  const childCode = [
    `console.error(${JSON.stringify(`Error: ${label} active`)});`,
    "process.on('SIGTERM', () => {",
    `  setTimeout(() => process.exit(0), ${timeoutChildExitDelayMs});`,
    "});",
    "setInterval(() => {}, 1000);",
  ].join("\n");

  return startProcess(process.execPath, [
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
  ]);
}

async function findSmokeEvent(baseUrl, label) {
  return waitForValue(`${label} event`, async () => {
    const body = await requestJson(baseUrl, "/v1/snapshot");
    const snapshot = body.snapshot;
    const event = snapshot.events.find((item) => item.summary === `Error: ${label} active`);
    if (!event) return null;
    const session = snapshot.sessions.find((item) => item.id === event.sessionId);
    if (!session || session.sourceMode !== "live" || session.state !== "running") return null;
    return { event, session };
  });
}

function actionEnvelope(payload) {
  return {
    protocol: "notch-ai-monitor",
    version: 1,
    id: `real_link_browser_qa_${Date.now().toString(36)}`,
    event: "notch.action.requested",
    ts: new Date().toISOString(),
    source: {
      kind: "ui",
      name: "real-link-browser-qa",
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
    body: JSON.stringify(actionEnvelope(payload)),
  });
  const result = body?.result?.envelope?.payload;
  expect(isRecord(result)).toBe(true);
  expect(result.requestId).toBe(payload.requestId);
  return result;
}

async function pendingAction(baseUrl, eventId, requestId) {
  const body = await requestJson(baseUrl, `/v1/action-requests?eventId=${encodeURIComponent(eventId)}`);
  return body.actions.find((action) => action.requestId === requestId) ?? null;
}

async function prepareRealLinkExpiredPending(baseUrl) {
  const label = "real link browser timeout";
  const notchRun = startNotchRun(baseUrl, label);
  let finished = false;

  try {
    const { event, session } = await findSmokeEvent(baseUrl, label);
    const requestId = "real_link_browser_timeout_confirmed";
    const accepted = await requestAction(baseUrl, {
      requestId,
      eventId: event.id,
      actionId: "terminate",
      confirmed: true,
    });
    expect(accepted.status).toBe("accepted");
    expect(accepted.effects?.[0]?.mocked).toBe(false);

    const expired = await waitForValue("expired pending action", () =>
      pendingAction(baseUrl, event.id, requestId).then(
        (action) => action?.status === "expired" && action
      )
    );
    expect(expired.resultStatus).toBe("failed");
    expect(expired.errorCode).toBe("pending_action_timeout");

    const exit = await notchRun.exit;
    finished = true;
    expect(exit.code).toBe(0);

    const lateAction = await pendingAction(baseUrl, event.id, requestId);
    expect(lateAction.status).toBe("expired");
    return { eventId: event.id, requestId, sessionId: session.id };
  } finally {
    if (!finished) notchRun.child.kill("SIGTERM");
  }
}

test("renders real-link timeout pending action as expired in Session Hub", async ({ page }) => {
  const api = await startTemporaryApi();

  try {
    const prepared = await prepareRealLinkExpiredPending(api.apiUrl);
    const query = new URLSearchParams({
      manager: "api",
      managerUrl: api.apiUrl,
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/?${query.toString()}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#desktop")).toBeVisible();
    await expect(page.locator("#sessionHubMeta")).toContainText("1 已结束");
    await expect(page.locator("#rightCapsule")).toContainText("错误");

    await page.mouse.move(360, 24);
    await expect(page.locator("#desktop")).toHaveAttribute("data-state", "peek");
    await page.locator("#leftCapsule").click();
    const detail = page.locator("#sessionDetail");
    await expect(detail).toContainText("动作状态");
    await expect(detail).toContainText("已过期");
    await expect(detail).toContainText("终止旧服务");
    await expect(detail).toContainText("动作等待完成超时");
    await expect(detail).toContainText("事件历史");
    await expect(detail).toContainText("待处理");

    const snapshot = await requestJson(api.apiUrl, "/v1/snapshot");
    expect(snapshot.snapshot.activeEventIds).toContain(prepared.eventId);
    const pending = await pendingAction(api.apiUrl, prepared.eventId, prepared.requestId);
    expect(pending.status).toBe("expired");
  } finally {
    await page.close().catch(() => undefined);
    await api.close();
  }
});
