import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

const artifactDir = fileURLToPath(
  new URL("../../../../tests/artifacts/qa-p0", import.meta.url)
);

async function ensureArtifactDir() {
  await fs.mkdir(artifactDir, { recursive: true });
}

async function openDesktopApp(page, viewport = { width: 1280, height: 800 }) {
  await page.setViewportSize(viewport);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?manager=mock", { waitUntil: "networkidle" });
  await expect(page.locator("#desktop")).toBeVisible();
}

async function selectScenario(page, scenario) {
  await page.locator("#demoToggle").click();
  await page.locator(`#scenarioGrid [data-scenario="${scenario}"]`).click();
  await expect(page.locator("#demoTray")).toHaveAttribute("aria-hidden", "true");
}

async function openActionPanel(page) {
  await page.locator("#rightCapsule").click();
  await expect(page.locator("#desktop")).toHaveAttribute("data-state", "expanded");
  await expect(page.locator("#desktop")).toHaveAttribute("data-panel", "action");
  await expect(page.locator("#actionPanel")).toBeVisible();
  await expect(page.locator("#rightCapsule")).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#actionPanel")).toHaveAttribute("role", "dialog");
  await expect(page.locator("#actionPanel")).toHaveAttribute("aria-modal", "false");
  await expect(page.locator("#actionPanel")).toHaveAttribute("aria-labelledby", "eventPanelTitle");
  await expect(page.locator("#actionPanel")).toHaveAttribute("aria-hidden", "false");
  await expect(page.locator("#sessionsPanel")).toHaveAttribute("aria-hidden", "true");
}

async function capture(page, name) {
  await ensureArtifactDir();
  await page.screenshot({
    path: `${artifactDir}/${name}.png`,
    fullPage: true,
  });
}

async function collectResponsiveMetrics(page) {
  return page.evaluate(() => {
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
    };

    const rectFor = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        selector,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        inViewport:
          rect.left >= -1 &&
          rect.top >= -1 &&
          rect.right <= window.innerWidth + 1 &&
          rect.bottom <= window.innerHeight + 1,
      };
    };

    const actionButtons = Array.from(
      document.querySelectorAll("#actionButtons button")
    ).map((button) => {
      const rect = button.getBoundingClientRect();
      return {
        action: button.getAttribute("data-action"),
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        inViewport:
          rect.left >= -1 &&
          rect.top >= -1 &&
          rect.right <= window.innerWidth + 1 &&
          rect.bottom <= window.innerHeight + 1,
      };
    });

    return {
      viewport,
      elements: {
        rightCapsule: rectFor("#rightCapsule"),
        actionPanel: rectFor("#actionPanel"),
        actionButtons: rectFor("#actionButtons"),
      },
      actionButtons,
      hasHorizontalOverflow:
        viewport.scrollWidth > viewport.width + 1 ||
        viewport.bodyScrollWidth > viewport.width + 1,
    };
  });
}

test.beforeEach(async ({ page }) => {
  await openDesktopApp(page);
});

test("loads the initial all-events risk peek and resolves risk to confirm", async ({
  page,
}) => {
  const desktop = page.locator("#desktop");

  await expect(desktop).toHaveAttribute("data-state", "peek");
  await expect(desktop).toHaveAttribute("data-mood", "angry");
  await expect(desktop).toHaveAttribute("data-panel", "none");
  await expect(page.locator("#eventCount")).toHaveText("4");
  await expect(page.locator("#alertTitle")).toHaveText("风险");

  await openActionPanel(page);
  await expect(page.locator("#eventPanelTitle")).toHaveText("已拦截危险命令");
  await expect(page.locator("#eventKind")).toHaveText("风险");
  await expect(page.locator("#severityChip")).toHaveText("风险 · 高");
  await expect(page.locator("#eventBody")).toContainText("原因");
  await expect(page.locator("#eventBody")).toContainText("影响范围");
  await expect(page.locator("#eventBody")).toContainText("证据来源");
  await expect(page.locator("#eventBody")).toContainText("回滚方式");
  await expect(page.locator("#eventBody")).not.toContainText("Reason");
  await expect(page.locator("#eventBody")).not.toContainText("Impact");
  await expect(page.locator("#pagerText")).toHaveText("1 / 4");
  await expect(page.locator('[data-tab-session="sess_qwen_001"]')).toHaveAttribute("aria-current", "true");
  await expect(page.locator('[data-tab-session="sess_qwen_001"]')).toHaveAttribute(
    "aria-label",
    "Qwen CLI，2 个待处理事件"
  );

  await page.locator('[data-action="reject"]').click();

  await expect(desktop).toHaveAttribute("data-state", "expanded");
  await expect(desktop).toHaveAttribute("data-mood", "waiting");
  await expect(desktop).toHaveAttribute("data-panel", "action");
  await expect(page.locator("#eventCount")).toHaveText("3");
  await expect(page.locator("#alertTitle")).toHaveText("确认");
  await expect(page.locator("#eventPanelTitle")).toHaveText("需要确认");
  await expect(page.locator("#eventKind")).toHaveText("确认");
  await expect(page.locator("#severityChip")).toHaveText("确认");
  await expect(page.locator("#pagerText")).toHaveText("1 / 3");
});

test("pages active events with ArrowLeft and ArrowRight", async ({ page }) => {
  await openActionPanel(page);

  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#eventPanelTitle")).toHaveText("需要确认");
  await expect(page.locator("#eventKind")).toHaveText("确认");
  await expect(page.locator("#pagerText")).toHaveText("2 / 4");

  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#eventPanelTitle")).toHaveText("运行失败");
  await expect(page.locator("#eventKind")).toHaveText("错误");
  await expect(page.locator("#severityChip")).toHaveText("错误");
  await expect(page.locator("#eventBody")).toContainText("日志");
  await expect(page.locator("#eventBody")).not.toContainText("Log");
  await expect(page.locator("#pagerText")).toHaveText("3 / 4");

  await page.keyboard.press("ArrowLeft");
  await expect(page.locator("#eventPanelTitle")).toHaveText("需要确认");
  await expect(page.locator("#eventKind")).toHaveText("确认");
  await expect(page.locator("#pagerText")).toHaveText("2 / 4");
});

test("requires a second confirmation for terminate and keeps idle taps as toast only", async ({
  page,
}) => {
  const desktop = page.locator("#desktop");

  await selectScenario(page, "error");
  await expect(desktop).toHaveAttribute("data-mood", "sad");
  await expect(page.locator("#eventCount")).toHaveText("1");

  await openActionPanel(page);
  await page.locator('[data-action="terminate"]').click();
  await expect(page.locator("#liveRegion")).toHaveText(
    "终止旧服务 需要二次确认"
  );
  await expect(page.locator('[data-action="terminate"]')).toHaveText(
    "确认 终止旧服务"
  );
  await expect(page.locator("#eventCount")).toHaveText("1");

  await page.locator('[data-action="terminate"]').click();
  await expect(page.locator("#liveRegion")).toHaveText("已模拟终止旧服务");
  await expect(desktop).toHaveAttribute("data-state", "dormant");
  await expect(desktop).toHaveAttribute("data-mood", "none");
  await expect(desktop).toHaveAttribute("data-panel", "none");
  await expect(page.locator("#eventCount")).toHaveText("0");

  await selectScenario(page, "idle");
  await expect(desktop).toHaveAttribute("data-state", "dormant");
  await expect(desktop).toHaveAttribute("data-mood", "none");
  await expect(page.locator("#eventCount")).toHaveText("0");

  await page.locator("#rightCapsule").click();
  await expect(page.locator("#liveRegion")).toHaveText(
    "当前没有需要处理的事件"
  );
  await expect(desktop).toHaveAttribute("data-panel", "none");
  await expect(page.locator("#actionPanel")).toBeHidden();
});

test("persists the quiet normal run preference across reloads", async ({
  page,
}) => {
  const desktop = page.locator("#desktop");

  await page.locator("#leftCapsule").click();
  await expect(desktop).toHaveAttribute("data-panel", "sessions");
  await expect(page.locator("#leftCapsule")).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#sessionsPanel")).toHaveAttribute("role", "dialog");
  await expect(page.locator("#sessionsPanel")).toHaveAttribute("aria-modal", "false");
  await expect(page.locator("#sessionsPanel")).toHaveAttribute("aria-labelledby", "sessionsPanelTitle");
  await expect(page.locator("#sessionsPanel")).toHaveAttribute("aria-hidden", "false");
  await expect(page.locator("#actionPanel")).toHaveAttribute("aria-hidden", "true");
  await expect(desktop).toHaveAttribute("data-quiet-normal-runs", "false");
  await expect(page.locator("#quietAllBtn")).toHaveText("静音普通运行");
  await expect(page.locator("#quietAllBtn")).toHaveAttribute("aria-pressed", "false");

  await page.locator("#quietAllBtn").click();
  await expect(page.locator("#liveRegion")).toHaveText("普通运行提醒已静音");
  await expect(desktop).toHaveAttribute("data-quiet-normal-runs", "true");
  await expect(page.locator("#quietAllBtn")).toHaveText("恢复普通提醒");
  await expect(page.locator("#quietAllBtn")).toHaveAttribute("aria-pressed", "true");

  await page.locator("#openPrefsBtn").click();
  await expect(page.locator("#liveRegion")).toHaveText("偏好：普通运行已静音");

  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator("#desktop")).toBeVisible();
  await expect(page.locator("#desktop")).toHaveAttribute("data-quiet-normal-runs", "true");

  await page.locator("#leftCapsule").click();
  await expect(page.locator("#quietAllBtn")).toHaveText("恢复普通提醒");
  await expect(page.locator("#quietAllBtn")).toHaveAttribute("aria-pressed", "true");

  await page.locator("#quietAllBtn").click();
  await expect(page.locator("#liveRegion")).toHaveText("普通运行提醒已恢复");
  await expect(page.locator("#desktop")).toHaveAttribute("data-quiet-normal-runs", "false");
});

test("productized Session Hub filters, sorts, and opens session events", async ({
  page,
}) => {
  const desktop = page.locator("#desktop");

  await page.locator("#leftCapsule").click();
  await expect(desktop).toHaveAttribute("data-panel", "sessions");
  await expect(page.locator("#hubSummary .hub-stat")).toHaveCount(5);
  await expect(page.locator("#hubSummary")).toContainText("会话");
  await expect(page.locator("#hubSummary")).toContainText("待处理");
  await expect(page.locator('[data-hub-filter="all"]')).toHaveClass(/active/);
  await expect(page.locator('[data-hub-sort="attention"]')).toHaveClass(/active/);
  await expect(page.locator("#sessionsList .session-row")).toHaveCount(3);
  await expect(page.locator("#sessionDetail")).toContainText("待处理事件");
  await expect(page.locator("#sessionDetail")).toContainText("动作状态");
  await expect(page.locator("#sessionDetail")).toContainText("事件历史");
  await expect(page.locator("#sessionDetail .session-event-row")).toHaveCount(2);
  await expect(page.locator("#sessionDetail .pending-action-row")).toHaveCount(0);
  await expect(page.locator("#sessionDetail .session-history-row")).toHaveCount(2);
  await expect(page.locator('[data-history-status="all"]')).toHaveClass(/active/);
  await expect(page.locator('[data-history-type="all"]')).toHaveClass(/active/);

  await page.locator('[data-history-type="risk"]').click();
  await expect(page.locator('[data-history-type="risk"]')).toHaveClass(/active/);
  await expect(page.locator("#sessionDetail .session-history-row")).toHaveCount(1);
  await expect(page.locator("#sessionDetail")).toContainText("已拦截危险命令");

  await page.locator('[data-history-type="all"]').click();
  await page.locator('[data-history-status="active"]').click();
  await expect(page.locator('[data-history-status="active"]')).toHaveClass(/active/);
  await expect(page.locator("#sessionDetail .session-history-row")).toHaveCount(2);

  await page.locator('[data-hub-filter="ended"]').click();
  await expect(page.locator('[data-hub-filter="ended"]')).toHaveClass(/active/);
  await expect(page.locator("#sessionsList .sessions-empty")).toHaveText("当前筛选下没有会话。");
  await expect(page.locator("#sessionDetail")).toContainText("还没有可查看的 AI 会话");

  await page.locator('[data-hub-filter="all"]').click();
  await page.locator('[data-hub-sort="name"]').click();
  await expect(page.locator('[data-hub-sort="name"]')).toHaveClass(/active/);
  await page.locator('[data-session="sess_claude_001"]').click();
  await expect(page.locator("#sessionDetail")).toContainText("Claude CLI");
  await expect(page.locator("#sessionDetail")).toContainText("结果已就绪");

  await page.locator('[data-session-event="evt_result_claude_001"]').click();
  await expect(desktop).toHaveAttribute("data-panel", "action");
  await expect(page.locator("#eventPanelTitle")).toHaveText("结果已就绪");
  await expect(page.locator("#eventKind")).toHaveText("结果");
});

test("keeps capsule, panel, and actions inside 390px and 760px viewports", async ({
  page,
}) => {
  const results = [];

  for (const width of [390, 760]) {
    await openDesktopApp(page, { width, height: 760 });
    await openActionPanel(page);
    await capture(page, `p0-responsive-${width}`);

    const metrics = await collectResponsiveMetrics(page);
    results.push(metrics);

    expect(metrics.hasHorizontalOverflow).toBe(false);
    expect(metrics.elements.rightCapsule?.inViewport).toBe(true);
    expect(metrics.elements.actionPanel?.inViewport).toBe(true);
    expect(metrics.elements.actionButtons?.inViewport).toBe(true);
    for (const button of metrics.actionButtons) {
      expect(button.inViewport).toBe(true);
    }
  }

  await ensureArtifactDir();
  await fs.writeFile(
    `${artifactDir}/responsive-metrics.json`,
    `${JSON.stringify(results, null, 2)}\n`,
    "utf8"
  );
});
