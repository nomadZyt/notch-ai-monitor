import type {
  Action,
  ActionResultPayload,
  EventHistoryRecord,
  RiskLevel,
  ManagerSnapshot,
  NotchEvent,
  PendingActionRecord,
  Session,
  SourceMode,
} from "@notch-ai-monitor/shared";
import { DebugHarness } from "../debug/debug-harness";
import type { DesktopManagerClient } from "../manager-client";
import { managerClientErrorMessage } from "../manager-client";
import {
  EVENT_TYPE_META,
  SCENARIO_LABELS,
  activeCountBySession,
  activeEventsFromSnapshot,
  escapeHtml,
  formatClockLabel,
  formatRelativeTime,
  moodForSelectedEvent,
  scenarioFromSnapshot,
  selectedEventFromSnapshot,
  sessionById,
  type DebugScenario,
} from "../state/selectors";
import {
  UIStore,
  type HistoryStatusFilter,
  type HistoryTypeFilter,
  type SessionHubFilter,
  type SessionHubSort,
} from "../state/ui-store";

interface ShellElements {
  desktop: HTMLElement;
  notchZone: HTMLElement;
  notchHit: HTMLElement;
  leftCapsule: HTMLButtonElement;
  rightCapsule: HTMLButtonElement;
  sessionsPanel: HTMLElement;
  actionPanel: HTMLElement;
  sessionsList: HTMLElement;
  sessionDetail: HTMLElement;
  sessionTabs: HTMLElement;
  actionButtons: HTMLElement;
  eventBody: HTMLElement;
  liveRegion: HTMLElement;
  toast: HTMLElement;
  sessionHubTitle: HTMLElement;
  sessionHubMeta: HTMLElement;
  activeSessionBadge: HTMLElement;
  hubSummary: HTMLElement;
  sessionFilter: HTMLElement;
  sessionSort: HTMLElement;
  alertTitle: HTMLElement;
  alertMeta: HTMLElement;
  eventCount: HTMLElement;
  eventKind: HTMLElement;
  eventPanelTitle: HTMLElement;
  eventPanelMeta: HTMLElement;
  severityChip: HTMLElement;
  pagerText: HTMLElement;
  prevEvent: HTMLButtonElement;
  nextEvent: HTMLButtonElement;
  demoToggle: HTMLButtonElement;
  demoTray: HTMLElement;
  demoClose: HTMLButtonElement;
  scenarioGrid: HTMLElement;
  forcePeek: HTMLButtonElement;
  forceAction: HTMLButtonElement;
  resetEvents: HTMLButtonElement;
  quietAllBtn: HTMLButtonElement;
  openPrefsBtn: HTMLButtonElement;
  clockLabel: HTMLElement;
}

interface DesktopPreferences {
  quietNormalRuns: boolean;
}

type DesktopSurface = "desktop" | "tauri-mvp";
type InitialPanel = "sessions" | "action" | null;

const DESKTOP_PREFERENCES_KEY = "notch-ai-monitor:desktop-preferences:v1";
const DEFAULT_DESKTOP_PREFERENCES: DesktopPreferences = {
  quietNormalRuns: false,
};
const HISTORY_PAGE_SIZE = 5;

interface HistoryViewState {
  statusFilter: HistoryStatusFilter;
  typeFilter: HistoryTypeFilter;
  pageIndex: number;
  hasPrevious: boolean;
  hasNext: boolean;
  loading: boolean;
}

function readDesktopSurface(): DesktopSurface {
  try {
    const params = new URL(window.location.href).searchParams;
    const surface = params.get("surface");
    return surface === "tauri-mvp" ? surface : "desktop";
  } catch {
    return "desktop";
  }
}

function readInitialPanel(): InitialPanel {
  try {
    const params = new URL(window.location.href).searchParams;
    const panel = params.get("initialPanel");
    return panel === "sessions" || panel === "action" ? panel : null;
  } catch {
    return null;
  }
}

function shellHtml(surface: DesktopSurface): string {
  const surfaceClass = surface === "tauri-mvp" ? " tauri-mvp-surface" : "";
  return `
    <main id="desktop" class="desktop-v2${surfaceClass}" data-state="dormant" data-mood="none" data-panel="none">
      <div class="wallpaper" aria-hidden="true">
        <div class="terminal-window primary-terminal">
          <div class="window-bar"><span></span><span></span><span></span></div>
          <div class="terminal-lines"><i></i><i></i><i></i><i></i><i></i></div>
        </div>
        <div class="terminal-window secondary-terminal">
          <div class="window-bar"><span></span><span></span><span></span></div>
          <div class="terminal-lines compact"><i></i><i></i><i></i><i></i></div>
        </div>
      </div>

      <header class="menu-bar" aria-label="macOS menu bar">
        <div class="menu-left">
          <span class="apple-mark" aria-hidden="true"></span>
          <strong>Finder</strong>
          <span>File</span>
          <span>Edit</span>
          <span>View</span>
          <span>Window</span>
          <span>Help</span>
        </div>
        <div class="menu-right">
          <span class="status-dot"></span>
          <span class="status-word">AI Monitor</span>
          <span class="wifi-mark" aria-hidden="true"></span>
          <span class="battery-mark" aria-hidden="true"></span>
          <span id="clockLabel">${escapeHtml(formatClockLabel())}</span>
        </div>
      </header>

      <section class="notch-zone" id="notchZone" aria-label="Notch AI Monitor">
        <div class="notch-hit" id="notchHit" aria-hidden="true"></div>

        <button
          class="side-capsule session-hub left-capsule"
          id="leftCapsule"
          type="button"
          aria-controls="sessionsPanel"
          aria-expanded="false"
          aria-haspopup="dialog"
          aria-label="查看全部 AI 会话"
        >
          <span class="tool-stack" id="toolStack" aria-hidden="true">
            <i class="tool-mark claude">CL</i>
            <i class="tool-mark codex">CX</i>
            <i class="tool-mark qwen">QW</i>
          </span>
          <span class="capsule-copy">
            <b id="sessionHubTitle">0 个会话</b>
            <small id="sessionHubMeta">0 活跃 · 0 事件</small>
          </span>
        </button>

        <div class="notch" aria-hidden="true">
          <span class="camera-dot"></span>
          <span class="sleep-eye"></span>
        </div>

        <button
          class="side-capsule alert-chip right-capsule"
          id="rightCapsule"
          type="button"
          aria-controls="actionPanel"
          aria-expanded="false"
          aria-haspopup="dialog"
          aria-label="没有待处理事件"
        >
          <span class="signal-cluster" aria-hidden="true">
            <span class="event-face">
              <i class="eye left"><em class="tear"></em></i>
              <i class="eye right"><em class="tear"></em></i>
              <i class="mouth"></i>
            </span>
          </span>
          <span class="capsule-copy alert-copy">
            <b><span id="alertTitle">全部安静</span></b>
            <small id="alertMeta">没有待处理事件</small>
          </span>
          <span class="event-count" id="eventCount">0</span>
        </button>

        <section
          class="surface-panel sessions-panel"
          id="sessionsPanel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="sessionsPanelTitle"
          aria-hidden="true"
          tabindex="-1"
        >
          <header class="panel-head">
            <div>
              <p class="eyebrow">Session Hub</p>
              <h2 id="sessionsPanelTitle">全部会话</h2>
            </div>
            <span class="panel-badge" id="activeSessionBadge">0</span>
          </header>
          <section class="hub-summary" id="hubSummary" aria-label="会话概览"></section>
          <div class="hub-controls" aria-label="Session Hub 筛选与排序">
            <div class="segmented-control" id="sessionFilter" role="group" aria-label="筛选会话">
              <button type="button" data-hub-filter="all">全部</button>
              <button type="button" data-hub-filter="attention">待处理</button>
              <button type="button" data-hub-filter="active">活跃</button>
              <button type="button" data-hub-filter="ended">已结束</button>
            </div>
            <div class="segmented-control compact" id="sessionSort" role="group" aria-label="排序会话">
              <button type="button" data-hub-sort="attention">优先级</button>
              <button type="button" data-hub-sort="recent">最近</button>
              <button type="button" data-hub-sort="name">名称</button>
            </div>
          </div>
          <div class="sessions-list" id="sessionsList"></div>
          <section class="session-detail" id="sessionDetail" aria-label="选中会话详情"></section>
          <footer class="panel-footer">
            <button type="button" class="ghost-action" id="quietAllBtn" aria-pressed="false">静音普通运行</button>
            <button type="button" class="ghost-action" id="openPrefsBtn">偏好</button>
          </footer>
        </section>

        <section
          class="surface-panel action-panel"
          id="actionPanel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="eventPanelTitle"
          aria-hidden="true"
          tabindex="-1"
        >
          <header class="panel-head action-head">
            <div>
              <p class="eyebrow" id="eventKind">Event</p>
              <h2 id="eventPanelTitle">当前没有事件</h2>
              <small id="eventPanelMeta">AI 会话正常运行</small>
            </div>
            <span class="severity-chip" id="severityChip">none</span>
          </header>

          <nav class="session-tabs" id="sessionTabs" aria-label="按会话筛选"></nav>
          <div class="event-body" id="eventBody"></div>

          <div class="event-pager" aria-label="事件分页">
            <button type="button" id="prevEvent" aria-label="上一条事件">‹</button>
            <span id="pagerText">0 / 0</span>
            <button type="button" id="nextEvent" aria-label="下一条事件">›</button>
          </div>

          <div class="action-buttons" id="actionButtons"></div>
        </section>
      </section>

      <button class="demo-toggle" id="demoToggle" type="button" aria-expanded="false" aria-controls="demoTray">
        演示
      </button>

      <aside class="demo-tray" id="demoTray" aria-label="原型演示控制台" aria-hidden="true">
        <div class="demo-head">
          <strong>原型场景</strong>
          <button type="button" id="demoClose" aria-label="关闭演示控制台">×</button>
        </div>
        <div class="demo-grid" id="scenarioGrid">
          <button type="button" data-scenario="idle">安静</button>
          <button type="button" data-scenario="waiting">等待确认</button>
          <button type="button" data-scenario="result">结果就绪</button>
          <button type="button" data-scenario="error">错误</button>
          <button type="button" data-scenario="risk">风险</button>
          <button type="button" data-scenario="all">全部事件</button>
        </div>
        <div class="demo-row">
          <button type="button" id="forcePeek">探出</button>
          <button type="button" id="forceAction">操作面板</button>
          <button type="button" id="resetEvents">清空数据</button>
        </div>
      </aside>

      <div class="live-region" id="liveRegion" role="status" aria-live="polite"></div>
      <div class="toast" id="toast" aria-hidden="true"></div>
    </main>
  `;
}

function queryElement<T extends HTMLElement>(root: ParentNode, id: keyof ShellElements): T {
  const element = root.querySelector<T>(`#${id}`);
  if (!element) {
    throw new Error(`Missing desktop element #${id}`);
  }
  return element;
}

function requestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function loadDesktopPreferences(): DesktopPreferences {
  try {
    const raw = window.localStorage.getItem(DESKTOP_PREFERENCES_KEY);
    if (!raw) return { ...DEFAULT_DESKTOP_PREFERENCES };

    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return { ...DEFAULT_DESKTOP_PREFERENCES };

    return {
      quietNormalRuns:
        typeof parsed.quietNormalRuns === "boolean"
          ? parsed.quietNormalRuns
          : DEFAULT_DESKTOP_PREFERENCES.quietNormalRuns,
    };
  } catch {
    return { ...DEFAULT_DESKTOP_PREFERENCES };
  }
}

function saveDesktopPreferences(preferences: DesktopPreferences): void {
  try {
    window.localStorage.setItem(DESKTOP_PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // Preference persistence is best-effort; UI still works with in-memory state.
  }
}

const SOURCE_MODE_LABELS: Record<SourceMode | "unknown", string> = {
  mock: "内存模拟",
  fixture: "演示数据",
  wrapper: "Wrapper 接入",
  scan: "扫描",
  live: "真实接入",
  unknown: "未标记",
};

const SESSION_STATE_LABELS: Record<Session["state"], string> = {
  idle: "空闲",
  running: "运行中",
  waiting: "等待确认",
  blocked: "已阻塞",
  completed: "运行完成",
  failed: "运行失败",
};

const EVENT_STATUS_LABELS: Record<EventHistoryRecord["status"], string> = {
  active: "待处理",
  resolved: "已解决",
  ignored: "已忽略",
  expired: "已过期",
};

const PENDING_STATUS_LABELS: Record<PendingActionRecord["status"], string> = {
  waiting_confirmation: "等待确认",
  queued: "已排队",
  in_progress: "正在处理",
  completed: "已完成",
  failed: "处理失败",
  rejected: "已拒绝",
  noop: "已查看",
  expired: "已过期",
};

const HISTORY_STATUS_FILTER_OPTIONS: Array<{ value: HistoryStatusFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "active", label: "待处理" },
  { value: "resolved", label: "解决" },
  { value: "ignored", label: "忽略" },
  { value: "expired", label: "过期" },
];

const HISTORY_TYPE_FILTER_OPTIONS: Array<{ value: HistoryTypeFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "risk", label: EVENT_TYPE_META.risk.label },
  { value: "error", label: EVENT_TYPE_META.error.label },
  { value: "confirm", label: EVENT_TYPE_META.confirm.label },
  { value: "result", label: EVENT_TYPE_META.result.label },
];

function sourceModeFor(session: Session | null | undefined): SourceMode | "unknown" {
  return session?.sourceMode ?? "unknown";
}

function sourceModeLabel(session: Session | null | undefined): string {
  return SOURCE_MODE_LABELS[sourceModeFor(session)];
}

function sourceModeMetaLabel(session: Session | null | undefined): string {
  return `接入方式: ${sourceModeLabel(session)}`;
}

function sourceModeBadge(session: Session | null | undefined): string {
  const mode = sourceModeFor(session);
  return `<span class="source-mode ${escapeHtml(mode)}">${escapeHtml(SOURCE_MODE_LABELS[mode])}</span>`;
}

function sessionStateLabel(session: Session | null | undefined): string {
  return session ? SESSION_STATE_LABELS[session.state] : "未知";
}

function sessionStateMetaLabel(session: Session | null | undefined): string {
  return `运行状态: ${sessionStateLabel(session)}`;
}

function sessionStateBadge(session: Session | null | undefined): string {
  const state = session?.state ?? "unknown";
  return `<span class="session-state ${escapeHtml(state)}">${escapeHtml(sessionStateLabel(session))}</span>`;
}

function isActiveSession(session: Session): boolean {
  return session.state === "running" || session.state === "waiting";
}

function isEndedSession(session: Session): boolean {
  return session.state === "completed" || session.state === "failed";
}

function timestampForSort(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function sessionLastActivity(session: Session): number {
  return timestampForSort(session.lastActiveAt ?? session.since);
}

function eventToneClass(event: NotchEvent): string {
  return `event-${event.type}`;
}

function eventStatusClass(status: EventHistoryRecord["status"]): string {
  return `event-status-${status}`;
}

function eventStatusLabel(status: EventHistoryRecord["status"]): string {
  return EVENT_STATUS_LABELS[status];
}

function pendingStatusLabel(status: PendingActionRecord["status"]): string {
  return PENDING_STATUS_LABELS[status];
}

function isHistoryStatusFilter(value: string): value is HistoryStatusFilter {
  return value === "all" || Object.prototype.hasOwnProperty.call(EVENT_STATUS_LABELS, value);
}

function isHistoryTypeFilter(value: string): value is HistoryTypeFilter {
  return value === "all" || Object.prototype.hasOwnProperty.call(EVENT_TYPE_META, value);
}

function formatExitCode(exitCode: number): string {
  return exitCode === 0 ? "正常退出 (0)" : `进程退出码 ${exitCode}`;
}

function formatEndReason(reason: string): string {
  const exitCodeMatch = /^exitCode:(-?\d+)$/.exec(reason);
  if (exitCodeMatch?.[1]) {
    return `进程以退出码 ${exitCodeMatch[1]} 结束`;
  }

  const signalMatch = /^signal:(.+)$/.exec(reason);
  if (signalMatch?.[1]) {
    return `进程收到信号 ${signalMatch[1]}`;
  }

  if (reason === "child exited") {
    return "子进程已退出";
  }

  return reason;
}

const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  low: "低",
  medium: "中",
  high: "高",
  critical: "严重",
};

function formatRiskLevel(riskLevel: RiskLevel): string {
  return RISK_LEVEL_LABELS[riskLevel];
}

export class NotchDesktopApp {
  private readonly store = new UIStore();
  private readonly debugHarness: DebugHarness;
  private readonly elements: ShellElements;
  private readonly surface: DesktopSurface;
  private readonly initialPanel: InitialPanel;
  private snapshot: ManagerSnapshot;
  private eventHistory: EventHistoryRecord[] = [];
  private eventHistoryNextCursor: string | null = null;
  private eventHistoryPageKey = "";
  private pendingActions: PendingActionRecord[] = [];
  private preferences: DesktopPreferences;
  private toastTimer: number | null = null;
  private projectionRefreshSerial = 0;
  private nativeSurfaceExpanded: boolean | null = null;
  private initialPanelConsumed = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly manager: DesktopManagerClient
  ) {
    this.surface = readDesktopSurface();
    this.initialPanel = readInitialPanel();
    this.root.innerHTML = shellHtml(this.surface);
    document.body.classList.toggle("tauri-mvp-body", this.surface === "tauri-mvp");
    this.elements = this.bindElements();
    this.snapshot = manager.getSnapshot();
    this.preferences = loadDesktopPreferences();
    this.debugHarness = new DebugHarness(manager);

    this.manager.subscribe((snapshot) => this.handleSnapshot(snapshot));
    this.manager.subscribeErrors?.((message) => this.showToast(message));
    this.bindEvents();
    this.handleSnapshot(this.snapshot);
  }

  private bindElements(): ShellElements {
    return {
      desktop: queryElement(this.root, "desktop"),
      notchZone: queryElement(this.root, "notchZone"),
      notchHit: queryElement(this.root, "notchHit"),
      leftCapsule: queryElement(this.root, "leftCapsule"),
      rightCapsule: queryElement(this.root, "rightCapsule"),
      sessionsPanel: queryElement(this.root, "sessionsPanel"),
      actionPanel: queryElement(this.root, "actionPanel"),
      sessionsList: queryElement(this.root, "sessionsList"),
      sessionDetail: queryElement(this.root, "sessionDetail"),
      sessionTabs: queryElement(this.root, "sessionTabs"),
      actionButtons: queryElement(this.root, "actionButtons"),
      eventBody: queryElement(this.root, "eventBody"),
      liveRegion: queryElement(this.root, "liveRegion"),
      toast: queryElement(this.root, "toast"),
      sessionHubTitle: queryElement(this.root, "sessionHubTitle"),
      sessionHubMeta: queryElement(this.root, "sessionHubMeta"),
      activeSessionBadge: queryElement(this.root, "activeSessionBadge"),
      hubSummary: queryElement(this.root, "hubSummary"),
      sessionFilter: queryElement(this.root, "sessionFilter"),
      sessionSort: queryElement(this.root, "sessionSort"),
      alertTitle: queryElement(this.root, "alertTitle"),
      alertMeta: queryElement(this.root, "alertMeta"),
      eventCount: queryElement(this.root, "eventCount"),
      eventKind: queryElement(this.root, "eventKind"),
      eventPanelTitle: queryElement(this.root, "eventPanelTitle"),
      eventPanelMeta: queryElement(this.root, "eventPanelMeta"),
      severityChip: queryElement(this.root, "severityChip"),
      pagerText: queryElement(this.root, "pagerText"),
      prevEvent: queryElement(this.root, "prevEvent"),
      nextEvent: queryElement(this.root, "nextEvent"),
      demoToggle: queryElement(this.root, "demoToggle"),
      demoTray: queryElement(this.root, "demoTray"),
      demoClose: queryElement(this.root, "demoClose"),
      scenarioGrid: queryElement(this.root, "scenarioGrid"),
      forcePeek: queryElement(this.root, "forcePeek"),
      forceAction: queryElement(this.root, "forceAction"),
      resetEvents: queryElement(this.root, "resetEvents"),
      quietAllBtn: queryElement(this.root, "quietAllBtn"),
      openPrefsBtn: queryElement(this.root, "openPrefsBtn"),
      clockLabel: queryElement(this.root, "clockLabel"),
    };
  }

  private bindEvents(): void {
    const activatePeek = (): void => {
      if (this.store.value.shellState === "expanded" || !this.currentEvent()) return;
      this.store.setShellState("peek");
      this.render();
    };

    const settle = (): void => {
      this.store.settleToSnapshot(this.snapshot);
      this.render();
    };

    this.elements.notchZone.addEventListener("mouseenter", activatePeek);
    this.elements.notchZone.addEventListener("mouseleave", settle);
    this.elements.notchZone.addEventListener("focusin", activatePeek);
    this.elements.notchHit.addEventListener("mouseenter", activatePeek);
    this.elements.notchHit.addEventListener("pointerenter", activatePeek);
    this.elements.notchHit.addEventListener("mousemove", activatePeek);
    this.elements.notchHit.addEventListener("mouseleave", settle);

    this.elements.leftCapsule.addEventListener("click", (event) => {
      event.stopPropagation();
      this.openPanel("sessions");
    });

    this.elements.rightCapsule.addEventListener("click", (event) => {
      event.stopPropagation();
      this.openActionPanel();
    });

    this.elements.sessionsPanel.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    this.elements.actionPanel.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    this.elements.sessionsList.addEventListener("click", (event) => {
      event.stopPropagation();
      const button = (event.target as Element | null)?.closest<HTMLButtonElement>("[data-session]");
      if (!button) return;
      this.selectHubSession(button.dataset.session ?? "");
    });

    this.elements.sessionFilter.addEventListener("click", (event) => {
      event.stopPropagation();
      const button = (event.target as Element | null)?.closest<HTMLButtonElement>("[data-hub-filter]");
      const filter = button?.dataset.hubFilter as SessionHubFilter | undefined;
      if (!filter) return;
      this.store.setSessionHubFilter(filter);
      this.eventHistory = [];
      this.eventHistoryNextCursor = null;
      this.eventHistoryPageKey = "";
      this.render();
      void this.refreshHubProjections();
    });

    this.elements.sessionSort.addEventListener("click", (event) => {
      event.stopPropagation();
      const button = (event.target as Element | null)?.closest<HTMLButtonElement>("[data-hub-sort]");
      const sort = button?.dataset.hubSort as SessionHubSort | undefined;
      if (!sort) return;
      this.store.setSessionHubSort(sort);
      this.render();
    });

    this.elements.sessionDetail.addEventListener("click", (event) => {
      event.stopPropagation();
      const historyStatusButton = (event.target as Element | null)?.closest<HTMLButtonElement>(
        "[data-history-status]"
      );
      if (historyStatusButton) {
        this.setHistoryStatusFilter(historyStatusButton.dataset.historyStatus ?? "");
        return;
      }

      const historyTypeButton = (event.target as Element | null)?.closest<HTMLButtonElement>(
        "[data-history-type]"
      );
      if (historyTypeButton) {
        this.setHistoryTypeFilter(historyTypeButton.dataset.historyType ?? "");
        return;
      }

      const historyPageButton = (event.target as Element | null)?.closest<HTMLButtonElement>(
        "[data-history-page]"
      );
      if (historyPageButton) {
        this.moveHistoryPage(historyPageButton.dataset.historyPage ?? "");
        return;
      }

      const button = (event.target as Element | null)?.closest<HTMLButtonElement>("[data-session-event]");
      if (!button) return;
      this.openSessionEvent(button.dataset.sessionEvent ?? "");
    });

    this.elements.sessionTabs.addEventListener("click", (event) => {
      event.stopPropagation();
      const button = (event.target as Element | null)?.closest<HTMLButtonElement>("[data-tab-session]");
      if (!button) return;
      this.selectActionSession(button.dataset.tabSession ?? "");
    });

    this.elements.actionButtons.addEventListener("click", (event) => {
      event.stopPropagation();
      const button = (event.target as Element | null)?.closest<HTMLButtonElement>("[data-action]");
      if (!button || button.disabled) return;
      void this.handleAction(button.dataset.action ?? "");
    });

    this.elements.prevEvent.addEventListener("click", () => this.moveEvent(-1));
    this.elements.nextEvent.addEventListener("click", () => this.moveEvent(1));

    this.elements.demoToggle.addEventListener("click", () => {
      this.store.setDemoOpen(!this.store.value.demoOpen);
      this.render();
    });

    this.elements.demoClose.addEventListener("click", () => {
      this.store.setDemoOpen(false);
      this.render();
    });

    this.elements.scenarioGrid.addEventListener("click", (event) => {
      const button = (event.target as Element | null)?.closest<HTMLButtonElement>("[data-scenario]");
      const scenario = button?.dataset.scenario as DebugScenario | undefined;
      if (!scenario || !(scenario in SCENARIO_LABELS)) return;
      void this.setScenario(scenario);
    });

    this.elements.forcePeek.addEventListener("click", () => {
      void this.forcePeek();
    });

    this.elements.forceAction.addEventListener("click", () => {
      void this.forceActionPanel();
    });

    this.elements.resetEvents.addEventListener("click", () => {
      void this.resetEvents();
    });

    this.elements.quietAllBtn.addEventListener("click", () => {
      this.preferences = {
        ...this.preferences,
        quietNormalRuns: !this.preferences.quietNormalRuns,
      };
      saveDesktopPreferences(this.preferences);
      this.showToast(this.preferences.quietNormalRuns ? "普通运行提醒已静音" : "普通运行提醒已恢复");
      this.render();
    });

    this.elements.openPrefsBtn.addEventListener("click", () => {
      this.showToast(this.preferences.quietNormalRuns ? "偏好：普通运行已静音" : "偏好：普通运行会提醒");
    });

    document.addEventListener("click", (event) => {
      if (this.store.value.shellState !== "expanded") return;
      const target = event.target as Node | null;
      if (!target) return;
      if (this.elements.notchZone.contains(target)) return;
      if (this.elements.demoTray.contains(target) || this.elements.demoToggle.contains(target)) return;
      this.collapse();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        this.collapse();
        this.store.setDemoOpen(false);
        this.render();
      }

      const state = this.store.value;
      if (state.shellState === "expanded" && state.panel === "action" && event.key === "ArrowRight") {
        this.moveEvent(1);
      }
      if (state.shellState === "expanded" && state.panel === "action" && event.key === "ArrowLeft") {
        this.moveEvent(-1);
      }
    });

    document.addEventListener("mousemove", (event) => {
      if (!this.currentEvent() || this.store.value.shellState === "expanded") return;
      const rect = this.elements.notchZone.getBoundingClientRect();
      const inside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.top + 72;

      if (inside) {
        activatePeek();
      } else if (this.store.value.autoState && this.store.value.shellState === "peek") {
        settle();
      }
    });
  }

  private handleSnapshot(snapshot: ManagerSnapshot): void {
    this.snapshot = snapshot;
    if (snapshot.pendingActions) {
      this.pendingActions = snapshot.pendingActions.map((record) => ({ ...record }));
    }
    this.store.reconcileSnapshot(snapshot);
    this.applyInitialPanel(snapshot);
    this.render();
    void this.refreshHubProjections();
  }

  private applyInitialPanel(snapshot: ManagerSnapshot): void {
    if (this.surface !== "tauri-mvp" || this.initialPanelConsumed || !this.initialPanel) return;
    if (this.initialPanel === "sessions" && snapshot.sessions.length > 0) {
      this.initialPanelConsumed = true;
      this.store.openPanel("sessions");
      return;
    }
    if (this.initialPanel === "action" && selectedEventFromSnapshot(snapshot, this.store.value.selectedEventId)) {
      this.initialPanelConsumed = true;
      this.store.openPanel("action");
    }
  }

  private async refreshHubProjections(): Promise<void> {
    if (!this.manager.getEventHistory && !this.manager.getActionRequests) return;

    const serial = (this.projectionRefreshSerial += 1);
    const state = this.store.value;
    const selectedSession = this.selectedHubSession();
    const historyPageKey = selectedSession ? this.historyProjectionKey(selectedSession.id, state) : "";
    try {
      const [historyResponse, actionsResponse] = await Promise.all([
        selectedSession
          ? this.manager.getEventHistory?.({
              sessionId: selectedSession.id,
              limit: HISTORY_PAGE_SIZE,
              ...(state.historyStatusFilter !== "all" ? { status: state.historyStatusFilter } : {}),
              ...(state.historyTypeFilter !== "all" ? { type: state.historyTypeFilter } : {}),
              ...(state.historyCursor ? { cursor: state.historyCursor } : {}),
            })
          : undefined,
        this.manager.getActionRequests?.({ limit: 40 }),
      ]);
      if (serial !== this.projectionRefreshSerial) return;
      if (historyResponse) {
        this.eventHistory = historyResponse.history.map((record) => ({ ...record }));
        this.eventHistoryNextCursor = historyResponse.nextCursor;
        this.eventHistoryPageKey = historyPageKey;
      } else if (!selectedSession) {
        this.eventHistory = [];
        this.eventHistoryNextCursor = null;
        this.eventHistoryPageKey = "";
      }
      if (actionsResponse) this.pendingActions = actionsResponse.actions.map((record) => ({ ...record }));
      this.render();
    } catch {
      // Projection endpoints are read-only polish; keep the last snapshot-driven UI if they are unavailable.
    }
  }

  private selectedHubSession(): Session | null {
    const state = this.store.value;
    const counts = activeCountBySession(this.snapshot);
    const sortedSessions = this.sortedHubSessions(counts, state.sessionHubSort);
    const visibleSessions = this.filteredHubSessions(sortedSessions, counts, state.sessionHubFilter);
    return (
      visibleSessions.find((session) => session.id === state.selectedSessionId) ??
      visibleSessions[0] ??
      null
    );
  }

  private historyProjectionKey(sessionId: string, state = this.store.value): string {
    return [
      sessionId,
      state.historyStatusFilter,
      state.historyTypeFilter,
      state.historyCursor ?? "start",
    ].join("|");
  }

  private currentEvent(): NotchEvent | null {
    return selectedEventFromSnapshot(this.snapshot, this.store.value.selectedEventId);
  }

  private activeEvents(): NotchEvent[] {
    return activeEventsFromSnapshot(this.snapshot);
  }

  private openPanel(panel: "sessions" | "action"): void {
    this.store.setDemoOpen(false);
    this.store.openPanel(panel);
    this.render();

    window.requestAnimationFrame(() => {
      const target = panel === "sessions" ? this.elements.sessionsPanel : this.elements.actionPanel;
      target.focus({ preventScroll: true });
    });
  }

  private openActionPanel(): void {
    if (!this.currentEvent()) {
      this.showToast("当前没有需要处理的事件");
      return;
    }

    this.openPanel("action");
  }

  private collapse(): void {
    this.store.collapse(this.snapshot);
    this.render();
  }

  private selectHubSession(sessionId: string): void {
    if (!sessionId) return;
    this.store.selectSession(sessionId);
    this.eventHistory = [];
    this.eventHistoryNextCursor = null;
    this.eventHistoryPageKey = "";
    this.render();
    void this.refreshHubProjections();
  }

  private setHistoryStatusFilter(value: string): void {
    if (!isHistoryStatusFilter(value)) return;
    this.store.setHistoryStatusFilter(value);
    this.eventHistory = [];
    this.eventHistoryNextCursor = null;
    this.eventHistoryPageKey = "";
    this.render();
    void this.refreshHubProjections();
  }

  private setHistoryTypeFilter(value: string): void {
    if (!isHistoryTypeFilter(value)) return;
    this.store.setHistoryTypeFilter(value);
    this.eventHistory = [];
    this.eventHistoryNextCursor = null;
    this.eventHistoryPageKey = "";
    this.render();
    void this.refreshHubProjections();
  }

  private moveHistoryPage(direction: string): void {
    if (direction === "next" && this.eventHistoryNextCursor) {
      this.store.goToNextHistoryPage(this.eventHistoryNextCursor);
    } else if (direction === "previous") {
      this.store.goToPreviousHistoryPage();
    } else {
      return;
    }

    this.eventHistory = [];
    this.eventHistoryNextCursor = null;
    this.eventHistoryPageKey = "";
    this.render();
    void this.refreshHubProjections();
  }

  private openSessionEvent(eventId: string): void {
    if (!eventId) return;
    const event = this.activeEvents().find((item) => item.id === eventId);
    if (!event) return;
    this.store.selectEvent(event.id, event.sessionId);
    this.openPanel("action");
  }

  private selectActionSession(sessionId: string): void {
    if (!sessionId) return;
    const active = this.activeEvents();
    const firstSessionEvent = active.find((event) => event.sessionId === sessionId);
    this.store.selectSession(sessionId);

    if (firstSessionEvent) {
      this.store.selectEvent(firstSessionEvent.id, firstSessionEvent.sessionId);
      this.openPanel("action");
      return;
    }

    this.render();
    const session = sessionById(this.snapshot, sessionId);
    this.showToast(`${session?.name ?? "该会话"} 当前没有待处理事件`);
  }

  private moveEvent(delta: number): void {
    const active = this.activeEvents();
    if (active.length <= 1) return;

    const current = this.currentEvent();
    const index = Math.max(0, active.findIndex((event) => event.id === current?.id));
    const next = active[(index + delta + active.length) % active.length];
    this.store.selectEvent(next?.id ?? null, next?.sessionId ?? null);
    this.render();
  }

  private async handleAction(actionId: string): Promise<void> {
    const event = this.currentEvent();
    if (!event || !actionId) return;

    const action = event.actions.find((item) => item.id === actionId);
    if (!action) return;

    const pending = this.store.value.pendingConfirmation;
    const confirmed = pending?.eventId === event.id && pending.actionId === action.id;

    try {
      const result = await this.manager.requestAction({
        requestId: requestId(),
        eventId: event.id,
        actionId: action.id,
        ...(confirmed ? { confirmed: true } : {}),
        uiContext: {
          selectedEventId: event.id,
          panel: this.store.value.panel,
        },
      });

      this.handleActionResult(result, action);
    } catch (error) {
      this.showToast(managerClientErrorMessage(error));
      this.render();
    }
  }

  private handleActionResult(result: ActionResultPayload, action: Action): void {
    if (result.status === "needs_confirmation") {
      this.store.setPendingConfirmation({
        eventId: result.eventId,
        actionId: result.actionId,
      });
      this.showToast(`${action.label} 需要二次确认`);
      this.render();
      return;
    }

    this.store.setPendingConfirmation(null);

    if (result.nextEventId) {
      const next = this.snapshot.events.find((event) => event.id === result.nextEventId);
      this.store.selectEvent(next?.id ?? result.nextEventId, next?.sessionId ?? null);
    }

    if (this.snapshot.counts.activeEvents === 0) {
      this.store.collapse(this.snapshot);
    }

    this.showToast(result.message);
    this.render();
  }

  private async forcePeek(): Promise<void> {
    if (!this.currentEvent()) {
      const injected = await this.setScenario("waiting", { quiet: true });
      if (!injected || !this.currentEvent()) return;
    }

    this.store.setShellState("peek", { manual: true });
    this.render();
  }

  private async forceActionPanel(): Promise<void> {
    if (!this.currentEvent()) {
      const injected = await this.setScenario("waiting", { quiet: true });
      if (!injected || !this.currentEvent()) return;
    }

    this.openActionPanel();
  }

  private async resetEvents(): Promise<void> {
    this.store.resetInteraction();
    this.store.setDemoOpen(false);
    try {
      const snapshot = await this.manager.resetSnapshot();
      this.handleSnapshot(snapshot);
      this.showToast("本地数据已清空");
    } catch (error) {
      this.showToast(managerClientErrorMessage(error));
      this.render();
    }
  }

  private async setScenario(scenario: DebugScenario, options: { quiet?: boolean } = {}): Promise<boolean> {
    this.store.resetInteraction();
    this.store.setDemoOpen(false);
    try {
      const snapshot = await this.debugHarness.injectScenario(scenario);
      this.handleSnapshot(snapshot);
      if (!options.quiet) this.showToast(`场景：${SCENARIO_LABELS[scenario]}`);
      return true;
    } catch (error) {
      this.showToast(managerClientErrorMessage(error));
      this.render();
      return false;
    }
  }

  private showToast(message: string): void {
    if (this.toastTimer) window.clearTimeout(this.toastTimer);
    this.elements.toast.textContent = message;
    this.elements.liveRegion.textContent = message;
    this.elements.toast.classList.add("show");
    this.elements.toast.setAttribute("aria-hidden", "false");
    this.toastTimer = window.setTimeout(() => {
      this.elements.toast.classList.remove("show");
      this.elements.toast.setAttribute("aria-hidden", "true");
    }, 2200);
  }

  private render(): void {
    const state = this.store.value;
    const event = this.currentEvent();
    const mood = moodForSelectedEvent(event);
    const hasSessions = this.snapshot.sessions.length > 0;

    this.elements.desktop.dataset.state = state.shellState;
    this.elements.desktop.dataset.mood = mood;
    this.elements.desktop.dataset.panel = state.panel;
    this.elements.desktop.dataset.hasSessions = String(hasSessions);
    this.elements.desktop.dataset.quietNormalRuns = String(this.preferences.quietNormalRuns);
    this.elements.clockLabel.textContent = formatClockLabel();

    this.renderCapsules(event);
    this.renderSessions();
    this.renderActionPanel(event);
    this.renderDemoState();

    const sessionsOpen = state.shellState === "expanded" && state.panel === "sessions";
    const actionOpen = state.shellState === "expanded" && state.panel === "action";
    this.elements.leftCapsule.setAttribute(
      "aria-expanded",
      String(sessionsOpen)
    );
    this.elements.rightCapsule.setAttribute(
      "aria-expanded",
      String(actionOpen)
    );
    this.elements.sessionsPanel.setAttribute("aria-hidden", String(!sessionsOpen));
    this.elements.actionPanel.setAttribute("aria-hidden", String(!actionOpen));
    this.elements.leftCapsule.tabIndex =
      hasSessions && (!event || state.shellState === "peek" || state.shellState === "expanded")
        ? 0
        : -1;
    this.elements.rightCapsule.tabIndex = 0;
    this.elements.demoToggle.setAttribute("aria-expanded", String(state.demoOpen));
    this.elements.demoTray.setAttribute("aria-hidden", String(!state.demoOpen));
    this.elements.demoTray.classList.toggle("open", state.demoOpen);
    this.elements.quietAllBtn.textContent = this.preferences.quietNormalRuns ? "恢复普通提醒" : "静音普通运行";
    this.elements.quietAllBtn.setAttribute("aria-pressed", String(this.preferences.quietNormalRuns));
    this.elements.quietAllBtn.classList.toggle("active", this.preferences.quietNormalRuns);
    void this.syncNativeSurfaceFrame();
  }

  private async syncNativeSurfaceFrame(): Promise<void> {
    if (this.surface !== "tauri-mvp") return;
    const expanded = this.store.value.shellState === "expanded";
    if (this.nativeSurfaceExpanded === expanded) return;
    this.nativeSurfaceExpanded = expanded;

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("set_surface_expanded", { expanded });
    } catch (error) {
      this.nativeSurfaceExpanded = null;
      console.warn("Unable to sync Tauri surface frame", error);
    }
  }

  private renderCapsules(event: NotchEvent | null): void {
    const active = this.activeEvents();
    const sessionCount = this.snapshot.counts.sessions;
    const activeSessionCount = this.snapshot.counts.activeSessions;
    const endedSessionCount = this.snapshot.sessions.filter((session) =>
      session.state === "completed" || session.state === "failed"
    ).length;

    this.elements.sessionHubTitle.textContent = `${sessionCount} 个会话`;
    const sessionHubMeta = endedSessionCount
      ? `${activeSessionCount} 活跃 · ${endedSessionCount} 已结束 · ${active.length} 事件`
      : `${activeSessionCount} 活跃 · ${active.length} 事件`;
    this.elements.sessionHubMeta.textContent = sessionHubMeta;
    this.elements.activeSessionBadge.textContent = String(sessionCount);
    this.elements.eventCount.textContent = String(active.length);
    this.elements.leftCapsule.setAttribute(
      "aria-label",
      sessionCount ? `查看全部 AI 会话，${sessionCount} 个会话，${sessionHubMeta}` : "没有 AI 会话"
    );

    if (!event) {
      this.elements.alertTitle.textContent = "全部安静";
      this.elements.alertMeta.textContent = "没有待处理事件";
      this.elements.rightCapsule.setAttribute("aria-label", "没有待处理事件");
      return;
    }

    const session = sessionById(this.snapshot, event.sessionId);
    const meta = EVENT_TYPE_META[event.type];
    this.elements.alertTitle.textContent = meta.short;
    const alertMeta = `${session?.name ?? event.source} · ${sourceModeMetaLabel(session)} · ${sessionStateMetaLabel(session)} · ${formatRelativeTime(
      event.updatedAt ?? event.createdAt
    )}`;
    this.elements.alertMeta.textContent = alertMeta;
    this.elements.rightCapsule.setAttribute(
      "aria-label",
      `${session?.name ?? "AI 会话"} ${meta.short}，${active.length} 项待处理`
    );
  }

  private renderSessions(): void {
    const state = this.store.value;
    const counts = activeCountBySession(this.snapshot);
    const active = this.activeEvents();
    const sortedSessions = this.sortedHubSessions(counts, state.sessionHubSort);
    const visibleSessions = this.filteredHubSessions(sortedSessions, counts, state.sessionHubFilter);
    const selectedSession =
      visibleSessions.find((session) => session.id === state.selectedSessionId) ??
      visibleSessions[0] ??
      null;
    const selectedSessionEvents = selectedSession
      ? active.filter((event) => event.sessionId === selectedSession.id)
      : [];
    const selectedPending = selectedSession
      ? this.pendingActions.filter((record) => record.sessionId === selectedSession.id)
      : [];
    const expectedHistoryKey = selectedSession ? this.historyProjectionKey(selectedSession.id, state) : "";
    const historyReady = expectedHistoryKey.length > 0 && this.eventHistoryPageKey === expectedHistoryKey;
    const selectedHistory = historyReady
      ? this.eventHistory.filter((record) => record.sessionId === selectedSession?.id)
      : [];
    const historyView: HistoryViewState = {
      statusFilter: state.historyStatusFilter,
      typeFilter: state.historyTypeFilter,
      pageIndex: state.historyCursorStack.length + 1,
      hasPrevious: state.historyCursorStack.length > 0,
      hasNext: historyReady && Boolean(this.eventHistoryNextCursor),
      loading: Boolean(selectedSession && this.manager.getEventHistory && !historyReady),
    };

    this.elements.hubSummary.innerHTML = this.renderHubSummary(active);
    this.renderHubControls(state.sessionHubFilter, state.sessionHubSort);
    this.elements.sessionsList.innerHTML = visibleSessions.length
      ? visibleSessions
          .map((session) => this.renderSessionRow(session, counts.get(session.id) ?? 0, selectedSession?.id ?? null))
          .join("")
      : `<div class="sessions-empty">当前筛选下没有会话。</div>`;
    this.elements.sessionDetail.innerHTML = this.renderSessionDetail(
      selectedSession,
      selectedSession ? counts.get(selectedSession.id) ?? 0 : 0,
      selectedSessionEvents,
      selectedPending,
      selectedHistory,
      historyView
    );
  }

  private sortedHubSessions(
    counts: Map<string, number>,
    sort: SessionHubSort
  ): Session[] {
    const sessions = [...this.snapshot.sessions];
    return sessions.sort((left, right) => {
      if (sort === "attention") {
        const countDelta = (counts.get(right.id) ?? 0) - (counts.get(left.id) ?? 0);
        if (countDelta !== 0) return countDelta;
        const activeDelta = Number(isActiveSession(right)) - Number(isActiveSession(left));
        if (activeDelta !== 0) return activeDelta;
      }
      if (sort === "name") {
        return left.name.localeCompare(right.name, "zh-CN");
      }
      return sessionLastActivity(right) - sessionLastActivity(left);
    });
  }

  private filteredHubSessions(
    sessions: readonly Session[],
    counts: Map<string, number>,
    filter: SessionHubFilter
  ): Session[] {
    if (filter === "attention") return sessions.filter((session) => (counts.get(session.id) ?? 0) > 0);
    if (filter === "active") return sessions.filter(isActiveSession);
    if (filter === "ended") return sessions.filter(isEndedSession);
    return [...sessions];
  }

  private renderHubSummary(active: readonly NotchEvent[]): string {
    const activeSessionCount = this.snapshot.sessions.filter(isActiveSession).length;
    const endedSessionCount = this.snapshot.sessions.filter(isEndedSession).length;
    const failedSessionCount = this.snapshot.sessions.filter((session) => session.state === "failed").length;
    const stats = [
      { label: "会话", value: this.snapshot.sessions.length, tone: "neutral" },
      { label: "活跃", value: activeSessionCount, tone: "live" },
      { label: "待处理", value: active.length, tone: active.length ? "attention" : "neutral" },
      { label: "失败", value: failedSessionCount, tone: failedSessionCount ? "danger" : "neutral" },
      { label: "已结束", value: endedSessionCount, tone: "done" },
    ];

    return stats
      .map(
        (item) => `
          <div class="hub-stat ${escapeHtml(item.tone)}">
            <b>${escapeHtml(item.value)}</b>
            <span>${escapeHtml(item.label)}</span>
          </div>
        `
      )
      .join("");
  }

  private renderHubControls(filter: SessionHubFilter, sort: SessionHubSort): void {
    this.elements.sessionFilter.querySelectorAll<HTMLButtonElement>("[data-hub-filter]").forEach((button) => {
      const selected = button.dataset.hubFilter === filter;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    this.elements.sessionSort.querySelectorAll<HTMLButtonElement>("[data-hub-sort]").forEach((button) => {
      const selected = button.dataset.hubSort === sort;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  }

  private renderSessionRow(session: Session, activeCount: number, selectedSessionId: string | null): string {
    const selected = session.id === selectedSessionId ? " selected" : "";
    const activeText = activeCount ? `<span class="session-event-status">${activeCount} 待处理</span>` : "";
    const rowLabel = [
      session.name,
      sourceModeLabel(session),
      sessionStateLabel(session),
      activeCount ? `${activeCount} 个待处理事件` : "没有待处理事件",
    ].join("，");

    return `
      <button
        class="session-row${selected}"
        type="button"
        data-session="${escapeHtml(session.id)}"
        aria-current="${selected ? "true" : "false"}"
        aria-label="${escapeHtml(rowLabel)}"
      >
        <span class="tool-avatar ${escapeHtml(session.tool)}">${escapeHtml(session.mark)}</span>
        <span class="row-copy">
          <strong>${escapeHtml(session.name)}</strong>
          <small>${escapeHtml(session.source)} · ${sourceModeBadge(session)} · ${escapeHtml(
            session.project ?? session.cwd ?? "local"
          )}</small>
        </span>
        <span class="row-status">
          <span class="mini-count">${activeCount || "·"}</span>
          <span class="session-state ${escapeHtml(session.state)}">${escapeHtml(sessionStateLabel(session))}</span>
          ${activeText}
        </span>
      </button>
    `;
  }

  private renderSessionDetail(
    session: Session | null,
    activeCount: number,
    sessionEvents: readonly NotchEvent[],
    pendingActions: readonly PendingActionRecord[],
    history: readonly EventHistoryRecord[],
    historyView: HistoryViewState
  ): string {
    if (!session) {
      return `<div class="session-detail-empty">还没有可查看的 AI 会话。</div>`;
    }

    const activeSummary = activeCount ? `${activeCount} 待处理事件` : "0 待处理事件";
    const started = session.since ? formatRelativeTime(session.since) : "未提供";
    const lastActive = session.lastActiveAt ? formatRelativeTime(session.lastActiveAt) : "未提供";
    const pid = session.processId ? String(session.processId) : "未提供";
    const project = session.project ?? "未标记";
    const cwd = session.cwd ?? "未提供";
    const locationItems = [
      session.windowId ? `<div><dt>窗口</dt><dd>${escapeHtml(session.windowId)}</dd></div>` : "",
      session.tabId ? `<div><dt>标签页</dt><dd>${escapeHtml(session.tabId)}</dd></div>` : "",
    ].join("");
    const exitItems = [
      session.exitCode !== undefined ? `<div><dt>退出码</dt><dd>${escapeHtml(formatExitCode(session.exitCode))}</dd></div>` : "",
      session.endReason ? `<div class="wide"><dt>结束原因</dt><dd>${escapeHtml(formatEndReason(session.endReason))}</dd></div>` : "",
    ].join("");

    return `
      <div class="session-detail-head">
        <span class="tool-avatar ${escapeHtml(session.tool)}">${escapeHtml(session.mark)}</span>
        <div>
          <strong>${escapeHtml(session.name)}</strong>
          <small>${escapeHtml(activeSummary)}</small>
        </div>
      </div>
      ${this.renderPendingActions(pendingActions)}
      ${this.renderSessionEvents(sessionEvents)}
      ${this.renderSessionHistory(history, historyView)}
      <dl class="session-detail-grid">
        <div><dt>运行状态</dt><dd>${sessionStateBadge(session)}</dd></div>
        <div><dt>接入方式</dt><dd>${sourceModeBadge(session)}</dd></div>
        <div><dt>来源</dt><dd>${escapeHtml(session.source)}</dd></div>
        <div><dt>进程 ID</dt><dd>${escapeHtml(pid)}</dd></div>
        <div><dt>开始时间</dt><dd>${escapeHtml(started)}</dd></div>
        <div><dt>最近活动</dt><dd>${escapeHtml(lastActive)}</dd></div>
        ${exitItems}
        <div class="wide"><dt>项目</dt><dd>${escapeHtml(project)}</dd></div>
        <div class="wide"><dt>工作目录</dt><dd>${escapeHtml(cwd)}</dd></div>
        ${locationItems}
      </dl>
    `;
  }

  private renderPendingActions(pendingActions: readonly PendingActionRecord[]): string {
    const visible = pendingActions.slice(0, 4);
    if (visible.length === 0) {
      return `
        <section class="pending-actions quiet" aria-label="动作状态">
          <header><span>动作状态</span><b>0</b></header>
          <p>这个会话当前没有待展示的动作状态。</p>
        </section>
      `;
    }

    return `
      <section class="pending-actions" aria-label="动作状态">
        <header><span>动作状态</span><b>${pendingActions.length}</b></header>
        <div class="pending-action-list">
          ${visible
            .map(
              (record) => `
                <div class="pending-action-row ${escapeHtml(record.status)}">
                  <span>${escapeHtml(pendingStatusLabel(record.status))}</span>
                  <strong>${escapeHtml(record.label)}</strong>
                  <small>${escapeHtml(record.message)}</small>
                </div>
              `
            )
            .join("")}
        </div>
      </section>
    `;
  }

  private renderSessionEvents(sessionEvents: readonly NotchEvent[]): string {
    if (sessionEvents.length === 0) {
      return `
        <section class="session-events quiet" aria-label="待处理事件">
          <header><span>待处理事件</span><b>0</b></header>
          <p>这个会话当前没有需要处理的事件。</p>
        </section>
      `;
    }

    return `
      <section class="session-events" aria-label="待处理事件">
        <header><span>待处理事件</span><b>${sessionEvents.length}</b></header>
        <div class="session-event-list">
          ${sessionEvents
            .map((event) => {
              const meta = EVENT_TYPE_META[event.type];
              return `
                <button
                  type="button"
                  class="session-event-row ${eventToneClass(event)}"
                  data-session-event="${escapeHtml(event.id)}"
                  aria-label="${escapeHtml(`${meta.label}，${event.title}，处理事件`)}"
                >
                  <span>${escapeHtml(meta.label)}</span>
                  <strong>${escapeHtml(event.title)}</strong>
                  <small>${escapeHtml(formatRelativeTime(event.updatedAt ?? event.createdAt))}</small>
                </button>
              `;
            })
            .join("")}
        </div>
      </section>
    `;
  }

  private renderSessionHistory(history: readonly EventHistoryRecord[], view: HistoryViewState): string {
    const controls = this.renderHistoryControls(view);
    const pager = this.renderHistoryPager(history.length, view);
    if (view.loading) {
      return `
        <section class="session-history quiet" aria-label="事件历史">
          <header><span>事件历史</span><b>…</b></header>
          ${controls}
          <p>正在读取事件历史。</p>
          ${pager}
        </section>
      `;
    }

    const visible = history.slice(0, HISTORY_PAGE_SIZE);
    if (visible.length === 0) {
      return `
        <section class="session-history quiet" aria-label="事件历史">
          <header><span>事件历史</span><b>0</b></header>
          ${controls}
          <p>当前筛选下没有历史事件。</p>
          ${pager}
        </section>
      `;
    }

    return `
      <section class="session-history" aria-label="事件历史">
        <header><span>事件历史</span><b>${history.length}</b></header>
        ${controls}
        <div class="session-history-list">
          ${visible
            .map((record) => {
              const meta = EVENT_TYPE_META[record.type];
              return `
                <div class="session-history-row ${eventStatusClass(record.status)}">
                  <span>${escapeHtml(meta.label)}</span>
                  <strong>${escapeHtml(record.title)}</strong>
                  <small>${escapeHtml(eventStatusLabel(record.status))} · ${escapeHtml(
                    formatRelativeTime(record.updatedAt ?? record.resolvedAt ?? record.createdAt)
                  )}</small>
                </div>
              `;
            })
            .join("")}
        </div>
        ${pager}
      </section>
    `;
  }

  private renderHistoryControls(view: HistoryViewState): string {
    const statusButtons = HISTORY_STATUS_FILTER_OPTIONS.map(
      (option) => `
        <button
          type="button"
          data-history-status="${escapeHtml(option.value)}"
          class="${option.value === view.statusFilter ? "active" : ""}"
          aria-pressed="${option.value === view.statusFilter ? "true" : "false"}"
        >${escapeHtml(option.label)}</button>
      `
    ).join("");
    const typeButtons = HISTORY_TYPE_FILTER_OPTIONS.map(
      (option) => `
        <button
          type="button"
          data-history-type="${escapeHtml(option.value)}"
          class="${option.value === view.typeFilter ? "active" : ""}"
          aria-pressed="${option.value === view.typeFilter ? "true" : "false"}"
        >${escapeHtml(option.label)}</button>
      `
    ).join("");

    return `
      <div class="history-controls" aria-label="事件历史筛选">
        <div class="segmented-control compact history-status-filter" role="group" aria-label="按状态筛选历史">
          ${statusButtons}
        </div>
        <div class="segmented-control compact history-type-filter" role="group" aria-label="按类型筛选历史">
          ${typeButtons}
        </div>
      </div>
    `;
  }

  private renderHistoryPager(visibleCount: number, view: HistoryViewState): string {
    const pageMeta = view.loading
      ? `第 ${view.pageIndex} 页 · 读取中`
      : `第 ${view.pageIndex} 页 · 本页 ${visibleCount} 条`;
    return `
      <div class="history-pager" aria-label="事件历史分页">
        <button
          type="button"
          data-history-page="previous"
          aria-label="上一页历史"
          ${view.hasPrevious && !view.loading ? "" : "disabled"}
        >‹</button>
        <span>${escapeHtml(pageMeta)}</span>
        <button
          type="button"
          data-history-page="next"
          aria-label="下一页历史"
          ${view.hasNext && !view.loading ? "" : "disabled"}
        >›</button>
      </div>
    `;
  }

  private renderActionPanel(event: NotchEvent | null): void {
    const active = this.activeEvents();
    const state = this.store.value;

    if (!event) {
      this.elements.eventKind.textContent = "Quiet";
      this.elements.eventPanelTitle.textContent = "当前没有事件";
      this.elements.eventPanelMeta.textContent = "AI 会话正常运行";
      this.elements.severityChip.textContent = "none";
      this.elements.sessionTabs.innerHTML = "";
      this.elements.eventBody.innerHTML = `<div class="empty-state">所有 AI 会话都在安静运行。</div>`;
      this.elements.pagerText.textContent = "0 / 0";
      this.elements.prevEvent.disabled = true;
      this.elements.nextEvent.disabled = true;
      this.elements.actionButtons.innerHTML = "";
      return;
    }

    const session = sessionById(this.snapshot, event.sessionId);
    const meta = EVENT_TYPE_META[event.type];
    const index = active.findIndex((item) => item.id === event.id);
    const riskLevel = event.evidence?.riskLevel ? ` · ${formatRiskLevel(event.evidence.riskLevel)}` : "";

    this.elements.eventKind.textContent = meta.label;
    this.elements.eventPanelTitle.textContent = event.title;
    this.elements.eventPanelMeta.textContent = `${session?.name ?? event.source} · ${event.source} · ${sourceModeMetaLabel(
      session
    )} · ${sessionStateMetaLabel(session)} · ${formatRelativeTime(
      event.updatedAt ?? event.createdAt
    )}`;
    this.elements.severityChip.textContent = `${meta.label}${riskLevel}`;
    this.elements.pagerText.textContent = `${index + 1} / ${active.length}`;
    this.elements.prevEvent.disabled = active.length <= 1;
    this.elements.nextEvent.disabled = active.length <= 1;

    const counts = activeCountBySession(this.snapshot);
    this.elements.sessionTabs.innerHTML = this.snapshot.sessions
      .map((item) => {
        const count = counts.get(item.id) ?? 0;
        const selected = item.id === event.sessionId;
        const className = selected ? "selected" : "";
        const tabLabel = `${item.name}${count ? `，${count} 个待处理事件` : "，没有待处理事件"}`;
        return `<button type="button" class="${className}" data-tab-session="${escapeHtml(
          item.id
        )}" aria-current="${selected ? "true" : "false"}" aria-label="${escapeHtml(tabLabel)}">${escapeHtml(
          item.name
        )}${count ? ` · ${count}` : ""}</button>`;
      })
      .join("");

    this.elements.eventBody.innerHTML = this.renderEventBody(event, session);
    this.elements.actionButtons.innerHTML = event.actions
      .map((action) => this.renderActionButton(action, state.pendingConfirmation, event.id))
      .join("");
  }

  private renderEventBody(event: NotchEvent, session: Session | null): string {
    const evidence = event.evidence;
    const reasons = event.reasons?.length
      ? `<ul class="risk-reasons">${event.reasons
          .map((reason) => `<li>${escapeHtml(reason)}</li>`)
          .join("")}</ul>`
      : "";
    const command = event.command
      ? `<div class="command-box">
          <span>${event.type === "result" ? "结果入口" : "命令预览"}</span>
          <code>${escapeHtml(event.command)}</code>
        </div>`
      : "";
    const logExcerpt = evidence?.logExcerpt
      ? `<div class="evidence-item wide"><span>日志</span><b>${escapeHtml(evidence.logExcerpt)}</b></div>`
      : "";

    return `
      <div class="event-summary">
        <p>${escapeHtml(event.summary)}</p>
        <dl class="event-facts">
          <div><dt>类型</dt><dd>${escapeHtml(EVENT_TYPE_META[event.type].label)}</dd></div>
          <div><dt>会话</dt><dd>${escapeHtml(session?.name ?? event.sessionId)}</dd></div>
          <div><dt>来源</dt><dd>${escapeHtml(event.source)}</dd></div>
          <div><dt>接入方式</dt><dd>${sourceModeBadge(session)}</dd></div>
          <div><dt>运行状态</dt><dd>${sessionStateBadge(session)}</dd></div>
          <div><dt>时间</dt><dd>${escapeHtml(formatRelativeTime(event.updatedAt ?? event.createdAt))}</dd></div>
        </dl>
        ${reasons}
      </div>
      ${command}
      <div class="evidence-grid">
        <div class="evidence-item"><span>原因</span><b>${escapeHtml(evidence?.reason ?? "未提供")}</b></div>
        <div class="evidence-item"><span>影响范围</span><b>${escapeHtml(evidence?.impact ?? "未提供")}</b></div>
        <div class="evidence-item"><span>证据来源</span><b>${escapeHtml(evidence?.origin ?? "未提供")}</b></div>
        <div class="evidence-item"><span>回滚方式</span><b>${escapeHtml(evidence?.rollback ?? "未提供")}</b></div>
        ${logExcerpt}
      </div>
    `;
  }

  private renderActionButton(
    action: Action,
    pending: { eventId: string; actionId: string } | null,
    eventId: string
  ): string {
    const isPendingConfirm = pending?.eventId === eventId && pending.actionId === action.id;
    const style = action.style ?? "secondary";
    const disabled = action.enabled ? "" : " disabled";
    const disabledReason = action.disabledReason ? ` title="${escapeHtml(action.disabledReason)}"` : "";
    const label = isPendingConfirm ? `确认 ${action.label}` : action.label;

    return `<button type="button" class="${escapeHtml(style)}" data-action="${escapeHtml(
      action.id
    )}"${disabled}${disabledReason}>${escapeHtml(label)}</button>`;
  }

  private renderDemoState(): void {
    const activeScenario = scenarioFromSnapshot(this.snapshot);
    this.elements.scenarioGrid.querySelectorAll<HTMLButtonElement>("[data-scenario]").forEach((button) => {
      const scenario = button.dataset.scenario as DebugScenario | undefined;
      button.classList.toggle("active", scenario === activeScenario);
    });

    const state = this.store.value;
    this.elements.forcePeek.classList.toggle("active", state.shellState === "peek");
    this.elements.forceAction.classList.toggle(
      "active",
      state.shellState === "expanded" && state.panel === "action"
    );
  }
}
