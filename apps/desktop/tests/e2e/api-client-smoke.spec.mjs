import { expect, test } from "@playwright/test";

const fixedNow = "2026-06-06T12:00:00+08:00";
let messageCount = 0;

function envelope(event, payload, source = { kind: "debug", name: "desktop-api-client-test" }) {
  messageCount += 1;
  return {
    protocol: "notch-ai-monitor",
    version: 1,
    id: `desktop_api_msg_${messageCount.toString().padStart(4, "0")}`,
    event,
    ts: fixedNow,
    source,
    payload,
  };
}

function session(id = "sess_desktop_lifecycle_001") {
  return {
    id,
    tool: "codex",
    name: "Codex CLI",
    mark: "CX",
    source: "Terminal",
    sourceMode: "live",
    project: "notch-ai-monitor",
    cwd: "/Users/example/notch-ai-monitor",
    processId: 4317,
    state: "running",
    since: fixedNow,
    lastActiveAt: fixedNow,
    muted: false,
  };
}

function historyEvent(sessionId, index) {
  const padded = String(index).padStart(2, "0");
  return {
    id: `evt_desktop_history_page_${padded}`,
    sessionId,
    type: index % 2 === 0 ? "error" : "result",
    priority: 40 + index,
    status: "active",
    title: `历史分页事件 ${padded}`,
    summary: `History pagination item ${padded}`,
    source: "Terminal",
    createdAt: `2026-06-06T12:00:${padded}+08:00`,
    actions: [],
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

  expect(response.ok).toBe(true);
  return response.json();
}

async function getSnapshot(baseUrl) {
  const response = await fetch(`${baseUrl}/v1/snapshot`);
  expect(response.ok).toBe(true);
  return response.json();
}

async function openApiDesktopApp(page, managerUrl) {
  const query = new URLSearchParams({
    manager: "api",
    managerUrl,
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/?${query.toString()}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#desktop")).toBeVisible();
}

async function closePageAndApi(page, api) {
  await page.close().catch(() => undefined);
  await api.close();
}

async function createTestApi() {
  const { createLocalManagerApi } = await import(
    "../../../../packages/local-manager-api/dist/src/index.js"
  );
  return createLocalManagerApi({ clock: () => fixedNow });
}

test("loads initial snapshot from LocalManagerApiClient and resolves action through POST", async ({
  page,
}) => {
  const api = await createTestApi();
  const address = await api.listen(0, "127.0.0.1");

  try {
    await postEnvelope(
      address.url,
      envelope("notch.debug.injected", { scenario: "waiting" })
    );

    await openApiDesktopApp(page, address.url);

    const desktop = page.locator("#desktop");
    await expect(desktop).toHaveAttribute("data-state", "glance");
    await expect(desktop).toHaveAttribute("data-mood", "waiting");
    await expect(page.locator("#eventCount")).toHaveText("1");
    await expect(page.locator("#alertTitle")).toHaveText("确认");

    await page.locator("#rightCapsule").click();
    await expect(desktop).toHaveAttribute("data-panel", "action");
    await expect(page.locator("#rightCapsule")).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#actionPanel")).toHaveAttribute("role", "dialog");
    await expect(page.locator("#actionPanel")).toHaveAttribute("aria-modal", "false");
    await expect(page.locator("#actionPanel")).toHaveAttribute("aria-labelledby", "eventPanelTitle");
    await expect(page.locator("#actionPanel")).toHaveAttribute("aria-hidden", "false");
    await expect(page.locator("#sessionsPanel")).toHaveAttribute("aria-hidden", "true");
    await expect(page.locator("#eventPanelTitle")).toHaveText("需要确认");

    await page.locator('[data-action="approve"]').click();
    await expect(page.locator("#liveRegion")).toHaveText("已模拟批准运行");
    await expect(page.locator("#eventCount")).toHaveText("0");
    await expect(desktop).toHaveAttribute("data-state", "dormant");
    await expect(desktop).toHaveAttribute("data-mood", "none");

    const snapshot = await getSnapshot(address.url);
    expect(snapshot.snapshot.counts.activeEvents).toBe(0);

    await page.locator("#leftCapsule").click();
    await expect(page.locator("#sessionDetail")).toContainText("动作状态");
    await expect(page.locator("#sessionDetail")).toContainText("已完成");
    await expect(page.locator("#sessionDetail")).toContainText("批准运行");
    await expect(page.locator("#sessionDetail")).toContainText("事件历史");
    await expect(page.locator("#sessionDetail")).toContainText("已解决");
  } finally {
    await closePageAndApi(page, api);
  }
});

test("renders completed live session lifecycle from LocalManagerApiClient", async ({
  page,
}) => {
  const api = await createTestApi();
  const address = await api.listen(0, "127.0.0.1");

  try {
    const testSession = session();
    await postEnvelope(
      address.url,
      envelope(
        "notch.session.upserted",
        { session: testSession },
        {
          kind: "cli",
          tool: "codex",
          sessionId: testSession.id,
          processId: testSession.processId,
          sourceMode: "live",
        }
      )
    );
    await postEnvelope(
      address.url,
      envelope(
        "notch.event.created",
        {
          event: {
            id: "evt_desktop_lifecycle_result_001",
            sessionId: testSession.id,
            type: "result",
            title: "结果已就绪",
            summary: "Completed: lifecycle UI smoke",
            source: "Terminal",
            createdAt: fixedNow,
          },
        },
        { kind: "cli", tool: "codex", sessionId: testSession.id, sourceMode: "live" }
      )
    );
    await postEnvelope(
      address.url,
      envelope(
        "notch.session.ended",
        {
          sessionId: testSession.id,
          state: "completed",
          exitCode: 0,
        },
        { kind: "cli", tool: "codex", sessionId: testSession.id, sourceMode: "live" }
      )
    );

    await openApiDesktopApp(page, address.url);

    await expect(page.locator("#sessionHubMeta")).toHaveText("0 活跃 · 1 已结束 · 1 事件");
    await expect(page.locator("#alertMeta")).toContainText("接入方式: 真实接入 · 运行状态: 运行完成");

    await page.mouse.move(360, 24);
    await expect(page.locator("#desktop")).toHaveAttribute("data-state", "peek");
    await page.locator("#leftCapsule").click();
    const row = page.locator('[data-session="sess_desktop_lifecycle_001"]');
    await expect(row).toContainText("Codex CLI");
    await expect(row).toContainText("真实接入");
    await expect(row).toContainText("运行完成");
    await row.click();
    await expect(page.locator("#sessionDetail")).toContainText("退出码");
    await expect(page.locator("#sessionDetail")).toContainText("正常退出 (0)");

    await page.locator("#rightCapsule").click();
    await expect(page.locator("#eventKind")).toHaveText("结果");
    await expect(page.locator("#severityChip")).toHaveText("结果");
    await expect(page.locator("#eventPanelMeta")).toContainText("接入方式: 真实接入 · 运行状态: 运行完成");
    await expect(page.locator("#eventBody")).toContainText("类型");
    await expect(page.locator("#eventBody")).toContainText("结果");
    await expect(page.locator("#eventBody")).toContainText("运行状态");
    await expect(page.locator("#eventBody")).toContainText("运行完成");
    await expect(page.locator("#eventBody")).toContainText("原因");
    await expect(page.locator("#eventBody")).toContainText("影响范围");
    await expect(page.locator("#eventBody")).toContainText("证据来源");
    await expect(page.locator("#eventBody")).toContainText("回滚方式");
    await expect(page.locator("#eventBody")).not.toContainText("Reason");
    await expect(page.locator("#eventBody")).not.toContainText("Impact");
  } finally {
    await closePageAndApi(page, api);
  }
});

test("paginates Session Hub history from LocalManagerApiClient", async ({
  page,
}) => {
  const api = await createTestApi();
  const address = await api.listen(0, "127.0.0.1");

  try {
    const testSession = session("sess_desktop_history_page_001");
    await postEnvelope(
      address.url,
      envelope(
        "notch.session.upserted",
        { session: testSession },
        {
          kind: "cli",
          tool: "codex",
          sessionId: testSession.id,
          processId: testSession.processId,
          sourceMode: "live",
        }
      )
    );

    for (let index = 1; index <= 6; index += 1) {
      await postEnvelope(
        address.url,
        envelope(
          "notch.event.created",
          { event: historyEvent(testSession.id, index) },
          { kind: "cli", tool: "codex", sessionId: testSession.id, sourceMode: "live" }
        )
      );
    }

    await openApiDesktopApp(page, address.url);
    await page.mouse.move(360, 24);
    await expect(page.locator("#desktop")).toHaveAttribute("data-state", "peek");
    await page.locator("#leftCapsule").click();

    await expect(page.locator("#sessionDetail")).toContainText("事件历史");
    await expect(page.locator("#sessionDetail .session-history-row")).toHaveCount(5);
    await expect(page.locator("#sessionDetail")).toContainText("历史分页事件 06");
    await expect(page.locator("#sessionDetail")).not.toContainText("历史分页事件 01");
    await expect(page.locator('[data-history-page="next"]')).toBeEnabled();
    await expect(page.locator('[data-history-page="previous"]')).toBeDisabled();

    await page.locator('[data-history-page="next"]').click();
    await expect(page.locator("#sessionDetail .session-history-row")).toHaveCount(1);
    await expect(page.locator("#sessionDetail")).toContainText("历史分页事件 01");
    await expect(page.locator('[data-history-page="previous"]')).toBeEnabled();
    await expect(page.locator('[data-history-page="next"]')).toBeDisabled();

    await page.locator('[data-history-page="previous"]').click();
    await expect(page.locator("#sessionDetail .session-history-row")).toHaveCount(5);

    await page.locator('[data-history-type="error"]').click();
    await expect(page.locator('[data-history-type="error"]')).toHaveClass(/active/);
    await expect(page.locator("#sessionDetail .session-history-row")).toHaveCount(3);
    await expect(page.locator("#sessionDetail")).toContainText("错误");
  } finally {
    await closePageAndApi(page, api);
  }
});

test("renders a running live session without active events as quiet lifecycle", async ({
  page,
}) => {
  const api = await createTestApi();
  const address = await api.listen(0, "127.0.0.1");

  try {
    const testSession = session("sess_desktop_running_quiet_001");
    await postEnvelope(
      address.url,
      envelope(
        "notch.session.upserted",
        { session: testSession },
        {
          kind: "cli",
          tool: "codex",
          sessionId: testSession.id,
          processId: testSession.processId,
          sourceMode: "live",
        }
      )
    );

    await openApiDesktopApp(page, address.url);

    const desktop = page.locator("#desktop");
    await expect(desktop).toHaveAttribute("data-state", "dormant");
    await expect(desktop).toHaveAttribute("data-mood", "none");
    await expect(page.locator("#sessionHubTitle")).toHaveText("1 个会话");
    await expect(page.locator("#sessionHubMeta")).toHaveText("1 活跃 · 0 事件");
    await expect(page.locator("#eventCount")).toHaveText("0");
    await expect(page.locator("#alertTitle")).toHaveText("全部安静");
    await expect(page.locator("#alertMeta")).toHaveText("没有待处理事件");
    await expect(page.locator("#rightCapsule")).toHaveAttribute("aria-label", "没有待处理事件");
    await expect(page.locator("#leftCapsule")).toHaveAttribute(
      "aria-label",
      "查看全部 AI 会话，1 个会话，1 活跃 · 0 事件"
    );
    await expect(page.locator("#leftCapsule")).toHaveAttribute("tabindex", "0");
    await expect(page.locator("#sessionsPanel")).toHaveAttribute("aria-hidden", "true");
    await expect(page.locator("#actionPanel")).toHaveAttribute("aria-hidden", "true");

    await page.locator("#leftCapsule").click();
    await expect(desktop).toHaveAttribute("data-state", "expanded");
    await expect(desktop).toHaveAttribute("data-panel", "sessions");
    await expect(page.locator("#leftCapsule")).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#sessionsPanel")).toHaveAttribute("role", "dialog");
    await expect(page.locator("#sessionsPanel")).toHaveAttribute("aria-modal", "false");
    await expect(page.locator("#sessionsPanel")).toHaveAttribute("aria-labelledby", "sessionsPanelTitle");
    await expect(page.locator("#sessionsPanel")).toHaveAttribute("aria-hidden", "false");
    await expect(page.locator("#actionPanel")).toHaveAttribute("aria-hidden", "true");
    const row = page.locator('[data-session="sess_desktop_running_quiet_001"]');
    await expect(row).toContainText("Codex CLI");
    await expect(row).toContainText("真实接入");
    await expect(row).toContainText("运行中");
    await expect(row).toHaveAttribute("aria-current", "true");
    await expect(row).toHaveAttribute("aria-label", "Codex CLI，真实接入，运行中，没有待处理事件");
    await row.click();
    await expect(desktop).toHaveAttribute("data-panel", "sessions");
    const detail = page.locator("#sessionDetail");
    await expect(detail).toContainText("Codex CLI");
    await expect(detail).toContainText("0 待处理事件");
    await expect(detail).toContainText("运行状态");
    await expect(detail).toContainText("运行中");
    await expect(detail).toContainText("接入方式");
    await expect(detail).toContainText("真实接入");
    await expect(detail).toContainText("来源");
    await expect(detail).toContainText("进程 ID");
    await expect(detail).toContainText("开始时间");
    await expect(detail).toContainText("最近活动");
    await expect(detail).toContainText("项目");
    await expect(detail).toContainText("工作目录");
    await expect(detail).toContainText("/Users/example/notch-ai-monitor");

    const snapshot = await getSnapshot(address.url);
    expect(snapshot.snapshot.counts.activeSessions).toBe(1);
    expect(snapshot.snapshot.counts.activeEvents).toBe(0);
  } finally {
    await closePageAndApi(page, api);
  }
});

test("renders failed live session lifecycle from LocalManagerApiClient", async ({
  page,
}) => {
  const api = await createTestApi();
  const address = await api.listen(0, "127.0.0.1");

  try {
    const testSession = {
      ...session("sess_desktop_failed_001"),
      tool: "claude",
      name: "Claude Code CLI",
      mark: "CL",
      processId: 4318,
    };
    await postEnvelope(
      address.url,
      envelope(
        "notch.session.upserted",
        { session: testSession },
        {
          kind: "cli",
          tool: "claude",
          sessionId: testSession.id,
          processId: testSession.processId,
          sourceMode: "live",
        }
      )
    );
    await postEnvelope(
      address.url,
      envelope(
        "notch.event.created",
        {
          event: {
            id: "evt_desktop_lifecycle_error_001",
            sessionId: testSession.id,
            type: "error",
            title: "运行失败",
            summary: "Error: lifecycle UI smoke failed",
            source: "Terminal",
            createdAt: fixedNow,
            evidence: {
              reason: "CLI process exited with code 1",
              impact: "用户需要查看失败原因",
              origin: "cli-adapter-real",
              rollback: "无需回滚",
              affectedPaths: ["/Users/example/notch-ai-monitor/logs/claude-error.log"],
              logExcerpt: "fixture failed",
            },
          },
        },
        { kind: "cli", tool: "claude", sessionId: testSession.id, sourceMode: "live" }
      )
    );
    await postEnvelope(
      address.url,
      envelope(
        "notch.session.ended",
        {
          sessionId: testSession.id,
          state: "failed",
          exitCode: 1,
          reason: "exitCode:1",
        },
        { kind: "cli", tool: "claude", sessionId: testSession.id, sourceMode: "live" }
      )
    );

    await openApiDesktopApp(page, address.url);

    const desktop = page.locator("#desktop");
    await expect(desktop).toHaveAttribute("data-state", "glance");
    await expect(desktop).toHaveAttribute("data-mood", "sad");
    await expect(page.locator("#sessionHubMeta")).toHaveText("0 活跃 · 1 已结束 · 1 事件");
    await expect(page.locator("#alertTitle")).toHaveText("错误");
    await expect(page.locator("#alertMeta")).toContainText("接入方式: 真实接入 · 运行状态: 运行失败");

    await page.mouse.move(360, 24);
    await expect(desktop).toHaveAttribute("data-state", "peek");
    await page.locator("#leftCapsule").click();
    const row = page.locator('[data-session="sess_desktop_failed_001"]');
    await expect(row).toContainText("Claude Code CLI");
    await expect(row).toContainText("真实接入");
    await expect(row).toContainText("运行失败");
    await row.click();
    await expect(page.locator("#hubSummary")).toContainText("失败");
    await expect(page.locator("#sessionDetail .session-event-row")).toHaveCount(1);
    await expect(page.locator("#sessionDetail .session-event-row")).toContainText("运行失败");
    await expect(page.locator("#sessionDetail")).toContainText("退出码");
    await expect(page.locator("#sessionDetail")).toContainText("进程退出码 1");
    await expect(page.locator("#sessionDetail")).toContainText("结束原因");
    await expect(page.locator("#sessionDetail")).toContainText("进程以退出码 1 结束");

    await page.locator('[data-session-event="evt_desktop_lifecycle_error_001"]').click();
    await expect(page.locator("#eventPanelTitle")).toHaveText("运行失败");
    await expect(page.locator("#eventKind")).toHaveText("错误");
    await expect(page.locator("#severityChip")).toHaveText("错误");
    await expect(page.locator("#eventPanelMeta")).toContainText("接入方式: 真实接入 · 运行状态: 运行失败");
    await expect(page.locator("#eventBody")).toContainText("类型");
    await expect(page.locator("#eventBody")).toContainText("错误");
    await expect(page.locator("#eventBody")).toContainText("运行状态");
    await expect(page.locator("#eventBody")).toContainText("运行失败");
    await expect(page.locator("#eventBody")).toContainText("原因");
    await expect(page.locator("#eventBody")).toContainText("影响范围");
    await expect(page.locator("#eventBody")).toContainText("证据来源");
    await expect(page.locator("#eventBody")).toContainText("回滚方式");
    await expect(page.locator("#eventBody")).toContainText("日志");
    await expect(page.locator("#eventBody")).not.toContainText("Reason");
    await expect(page.locator("#eventBody")).not.toContainText("Log");
    await expect(page.locator("#eventBody")).toContainText("fixture failed");

    await page.locator('[data-action="view-log"]').click();
    await expect(page.locator("#liveRegion")).toHaveText(
      "日志位置：/Users/example/notch-ai-monitor/logs/claude-error.log"
    );
    await expect(page.locator("#eventCount")).toHaveText("1");
    await expect(page.locator("#eventPanelTitle")).toHaveText("运行失败");

    await page.locator("#leftCapsule").click();
    await expect(page.locator("#sessionDetail")).toContainText("动作状态");
    await expect(page.locator("#sessionDetail")).toContainText("已查看");
    await expect(page.locator("#sessionDetail")).toContainText("查看日志");
    await expect(page.locator("#sessionDetail")).toContainText("事件历史");
    await expect(page.locator("#sessionDetail")).toContainText("待处理");
  } finally {
    await closePageAndApi(page, api);
  }
});

test("keeps the desktop visible when the local API is unavailable", async ({
  page,
}) => {
  const api = await createTestApi();
  const address = await api.listen(0, "127.0.0.1");
  await api.close();

  await openApiDesktopApp(page, address.url);

  await expect(page.locator("#desktop")).toHaveAttribute("data-state", "dormant");
  await expect(page.locator("#liveRegion")).toContainText("无法连接本地 Manager API");
  await expect(page.locator("#eventCount")).toHaveText("0");
});
