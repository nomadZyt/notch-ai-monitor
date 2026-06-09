const desktop = document.querySelector(".desktop-v2");
const notchZone = document.getElementById("notchZone");
const notchHit = document.getElementById("notchHit");
const leftCapsule = document.getElementById("leftCapsule");
const rightCapsule = document.getElementById("rightCapsule");
const sessionsPanel = document.getElementById("sessionsPanel");
const actionPanel = document.getElementById("actionPanel");
const sessionsList = document.getElementById("sessionsList");
const sessionTabs = document.getElementById("sessionTabs");
const actionButtons = document.getElementById("actionButtons");
const eventBody = document.getElementById("eventBody");
const liveRegion = document.getElementById("liveRegion");
const toast = document.getElementById("toast");

const sessionHubTitle = document.getElementById("sessionHubTitle");
const sessionHubMeta = document.getElementById("sessionHubMeta");
const activeSessionBadge = document.getElementById("activeSessionBadge");
const alertTitle = document.getElementById("alertTitle");
const alertMeta = document.getElementById("alertMeta");
const eventCount = document.getElementById("eventCount");
const eventKind = document.getElementById("eventKind");
const eventPanelTitle = document.getElementById("eventPanelTitle");
const eventPanelMeta = document.getElementById("eventPanelMeta");
const severityChip = document.getElementById("severityChip");
const pagerText = document.getElementById("pagerText");
const prevEvent = document.getElementById("prevEvent");
const nextEvent = document.getElementById("nextEvent");

const demoToggle = document.getElementById("demoToggle");
const demoTray = document.getElementById("demoTray");
const demoClose = document.getElementById("demoClose");
const scenarioGrid = document.getElementById("scenarioGrid");
const forcePeek = document.getElementById("forcePeek");
const forceAction = document.getElementById("forceAction");
const resetEvents = document.getElementById("resetEvents");
const quietAllBtn = document.getElementById("quietAllBtn");
const openPrefsBtn = document.getElementById("openPrefsBtn");

const SESSIONS = [
  { id: "qwen", name: "Qwen CLI", tool: "qwen", mark: "QW", source: "Terminal", project: "autoXhs", state: "waiting", since: "2 分钟前" },
  { id: "claude", name: "Claude CLI", tool: "claude", mark: "CL", source: "iTerm", project: "notch-ai-monitor", state: "running", since: "12 分钟" },
  { id: "codex", name: "Codex CLI", tool: "codex", mark: "CX", source: "Terminal", project: "wBot", state: "running", since: "8 分钟" },
];

const EVENT_SEED = [
  {
    id: "risk-rm",
    sessionId: "qwen",
    type: "risk",
    priority: 100,
    title: "已拦截危险命令",
    summary: "删除范围过大，可能影响草稿和未跟踪文件。",
    command: "rm -rf ~/Documents/xhs-drafts/* && git clean -fd",
    source: "Terminal · autoXhs",
    time: "刚刚",
    evidence: {
      reason: "命令会删除非临时目录，且包含不可恢复的 git clean。",
      impact: "~/Documents/xhs-drafts、当前仓库未跟踪文件",
      origin: "AI 生成，尚未执行",
      rollback: "无自动撤销，需要先备份或改写命令",
    },
    reasons: ["删除范围过宽", "包含 git clean", "没有备份步骤"],
    actions: [
      { id: "reject", label: "拒绝执行", style: "danger", resolves: true },
      { id: "allow-once", label: "允许一次", style: "primary", resolves: true },
      { id: "locate", label: "定位终端" },
      { id: "copy", label: "复制命令" },
    ],
  },
  {
    id: "confirm-qwen",
    sessionId: "qwen",
    type: "confirm",
    priority: 80,
    title: "需要确认",
    summary: "Qwen 想运行草稿整理脚本。",
    command: "python scripts/prepare_xhs_batch.py --drafts ./drafts --limit 6",
    source: "Terminal · autoXhs",
    time: "2 分钟前",
    evidence: {
      reason: "命令会读取本地 drafts 目录并生成批处理输出。",
      impact: "./drafts、./outputs/xhs-batch",
      origin: "AI 生成，等待用户批准",
      rollback: "输出目录可删除，不影响源文件",
    },
    actions: [
      { id: "approve", label: "批准运行", style: "primary", resolves: true },
      { id: "reject", label: "拒绝", resolves: true },
      { id: "locate", label: "定位终端" },
      { id: "copy", label: "复制命令" },
    ],
  },
  {
    id: "result-claude",
    sessionId: "claude",
    type: "result",
    priority: 55,
    title: "结果已就绪",
    summary: "Claude 生成了视觉方向草案。",
    command: "open output/strategy/notch-monitor-routes.md",
    source: "iTerm · notch-ai-monitor",
    time: "5 分钟前",
    evidence: {
      reason: "长任务已产出可查看文件。",
      impact: "output/strategy/notch-monitor-routes.md",
      origin: "Claude CLI",
      rollback: "标记已读不会删除结果",
    },
    actions: [
      { id: "open-result", label: "打开结果", style: "primary", resolves: true },
      { id: "copy-summary", label: "复制摘要" },
      { id: "mark-read", label: "标记已读", resolves: true },
      { id: "locate", label: "定位会话" },
    ],
  },
  {
    id: "error-codex",
    sessionId: "codex",
    type: "error",
    priority: 70,
    title: "运行失败",
    summary: "本地端口被占用，预览服务没有启动。",
    command: "python3 -m http.server 4173 --directory prototype",
    source: "Terminal · wBot",
    time: "7 分钟前",
    evidence: {
      reason: "端口 4173 已被另一个进程占用。",
      impact: "本地预览无法刷新",
      origin: "Codex CLI",
      rollback: "关闭旧服务后可重试",
    },
    actions: [
      { id: "retry", label: "重试", style: "primary", resolves: true },
      { id: "view-log", label: "查看日志" },
      { id: "terminate", label: "终止旧服务", resolves: true },
      { id: "ignore", label: "忽略", resolves: true },
    ],
  },
];

const TYPE_META = {
  risk: { mood: "angry", label: "Risk", short: "风险" },
  confirm: { mood: "waiting", label: "Confirm", short: "确认" },
  result: { mood: "happy", label: "Done", short: "完成" },
  error: { mood: "sad", label: "Error", short: "失败" },
};

let events = cloneEvents();
let selectedEventId = null;
let selectedSessionId = "qwen";
let state = "dormant";
let panel = "none";
let autoState = true;
let toastTimer = null;

function cloneEvents() {
  return EVENT_SEED.map((event) => ({ ...event, resolved: false, resolution: "" }));
}

function activeEvents() {
  return events
    .filter((event) => !event.resolved)
    .sort((a, b) => b.priority - a.priority);
}

function sessionById(id) {
  return SESSIONS.find((session) => session.id === id) || SESSIONS[0];
}

function currentEvent() {
  const active = activeEvents();
  if (!active.length) return null;
  const selected = active.find((event) => event.id === selectedEventId);
  return selected || active[0];
}

function moodForEvent(event) {
  if (!event) return "none";
  return TYPE_META[event.type]?.mood || "waiting";
}

function restingStateForMood(mood) {
  if (mood === "none") return "dormant";
  if (mood === "angry") return "peek";
  return "glance";
}

function setState(nextState, { manual = false } = {}) {
  state = nextState;
  if (manual) autoState = false;
  render();
}

function syncStateFromEvent() {
  const mood = moodForEvent(currentEvent());
  state = restingStateForMood(mood);
  if (!currentEvent()) panel = "none";
}

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("show");
  toast.setAttribute("aria-hidden", "false");
  liveRegion.textContent = message;
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
    toast.setAttribute("aria-hidden", "true");
  }, 2100);
}

function openPanel(which) {
  const event = currentEvent();
  if (which === "action" && !event) {
    showToast("当前没有需要处理的事件");
    return;
  }
  if (state === "expanded" && panel === which) {
    collapse();
    return;
  }
  panel = which;
  autoState = false;
  setState("expanded", { manual: true });
  requestAnimationFrame(() => {
    (which === "sessions" ? sessionsPanel : actionPanel).focus({ preventScroll: true });
  });
}

function collapse() {
  panel = "none";
  autoState = true;
  syncStateFromEvent();
  render();
}

function render() {
  const event = currentEvent();
  const mood = moodForEvent(event);
  desktop.dataset.state = state;
  desktop.dataset.mood = mood;
  desktop.dataset.panel = panel;

  const active = activeEvents();
  if (!event && selectedEventId) selectedEventId = null;
  if (event && !selectedEventId) selectedEventId = event.id;
  if (event) selectedSessionId = event.sessionId;

  renderCapsules(event, active);
  renderSessions(active);
  renderActionPanel(event, active);
  renderDemoState();

  leftCapsule.setAttribute("aria-expanded", String(state === "expanded" && panel === "sessions"));
  rightCapsule.setAttribute("aria-expanded", String(state === "expanded" && panel === "action"));
  leftCapsule.tabIndex = event && (state === "peek" || state === "expanded") ? 0 : -1;
  rightCapsule.tabIndex = event ? 0 : -1;
}

function renderCapsules(event, active) {
  const runningCount = SESSIONS.filter((session) => session.state === "running" || session.state === "waiting").length;
  sessionHubTitle.textContent = `${SESSIONS.length} 个会话`;
  sessionHubMeta.textContent = `${runningCount} 活跃 · ${active.length} 事件`;
  activeSessionBadge.textContent = String(SESSIONS.length);

  if (!event) {
    alertTitle.textContent = "全部安静";
    alertMeta.textContent = "没有待处理事件";
    eventCount.textContent = "0";
    rightCapsule.setAttribute("aria-label", "没有待处理事件");
    return;
  }

  const session = sessionById(event.sessionId);
  const meta = TYPE_META[event.type];
  alertTitle.textContent = meta.short;
  alertMeta.textContent = `${session.name} · ${event.time}`;
  eventCount.textContent = String(active.length);
  rightCapsule.setAttribute("aria-label", `${session.name} ${meta.short}，${active.length} 项待处理`);
}

function renderSessions(active) {
  sessionsList.innerHTML = SESSIONS.map((session) => {
    const count = active.filter((event) => event.sessionId === session.id).length;
    const selected = session.id === selectedSessionId ? " selected" : "";
    const stateText = count ? `${count} 待处理` : session.state === "running" ? "运行中" : "空闲";
    return `
      <button class="session-row${selected}" type="button" data-session="${session.id}">
        <span class="tool-avatar ${session.tool}">${session.mark}</span>
        <span class="row-copy">
          <strong>${session.name}</strong>
          <small>${session.source} · ${session.project}</small>
        </span>
        <span class="row-status">
          <span class="mini-count">${count || "·"}</span>
          <span>${stateText}</span>
        </span>
      </button>
    `;
  }).join("");

  sessionsList.querySelectorAll("[data-session]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedSessionId = button.dataset.session;
      const firstSessionEvent = activeEvents().find((event) => event.sessionId === selectedSessionId);
      if (firstSessionEvent) {
        selectedEventId = firstSessionEvent.id;
        panel = "action";
        setState("expanded", { manual: true });
      } else {
        render();
        showToast(`${sessionById(selectedSessionId).name} 当前没有待处理事件`);
      }
    });
  });
}

function renderActionPanel(event, active) {
  if (!event) {
    eventKind.textContent = "Quiet";
    eventPanelTitle.textContent = "当前没有事件";
    eventPanelMeta.textContent = "AI 会话正常运行";
    severityChip.textContent = "none";
    sessionTabs.innerHTML = "";
    eventBody.innerHTML = `<div class="empty-state">所有 AI 会话都在安静运行。</div>`;
    pagerText.textContent = "0 / 0";
    prevEvent.disabled = true;
    nextEvent.disabled = true;
    actionButtons.innerHTML = "";
    return;
  }

  const session = sessionById(event.sessionId);
  const meta = TYPE_META[event.type];
  const index = active.findIndex((item) => item.id === event.id);

  eventKind.textContent = meta.label;
  eventPanelTitle.textContent = event.title;
  eventPanelMeta.textContent = `${session.name} · ${event.time}`;
  severityChip.textContent = event.type;
  pagerText.textContent = `${index + 1} / ${active.length}`;
  prevEvent.disabled = active.length <= 1;
  nextEvent.disabled = active.length <= 1;

  sessionTabs.innerHTML = SESSIONS.map((item) => {
    const count = active.filter((activeEvent) => activeEvent.sessionId === item.id).length;
    const selected = item.id === event.sessionId ? " selected" : "";
    return `<button type="button" class="${selected}" data-tab-session="${item.id}">${item.name}${count ? ` · ${count}` : ""}</button>`;
  }).join("");

  sessionTabs.querySelectorAll("[data-tab-session]").forEach((button) => {
    button.addEventListener("click", () => {
      const next = activeEvents().find((item) => item.sessionId === button.dataset.tabSession);
      selectedSessionId = button.dataset.tabSession;
      if (next) selectedEventId = next.id;
      render();
    });
  });

  eventBody.innerHTML = renderEventBody(event);
  actionButtons.innerHTML = event.actions.slice(0, 2).map((action) => {
    const style = action.style ? ` ${action.style}` : "";
    return `<button type="button" class="${style.trim()}" data-action="${action.id}">${action.label}</button>`;
  }).join("");

  actionButtons.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => handleAction(button.dataset.action));
  });
}

function renderEventBody(event) {
  const evidence = event.evidence;
  const riskList = event.reasons?.length
    ? `<ul class="risk-reasons">${event.reasons.map((reason) => `<li>${reason}</li>`).join("")}</ul>`
    : "";

  return `
    <div class="event-summary">
      <p>${event.summary}</p>
      ${riskList}
    </div>
    <div class="command-box">
      <span>${event.type === "result" ? "结果入口" : "命令预览"}</span>
      <code>${event.command}</code>
    </div>
    <details class="event-details">
      <summary>详情</summary>
      <div class="detail-list">
        <p><b>原因</b> ${evidence.reason}</p>
        <p><b>影响</b> ${evidence.impact}</p>
        <p><b>来源</b> ${evidence.origin}</p>
        <p><b>撤销</b> ${evidence.rollback}</p>
      </div>
    </details>
  `;
}

function handleAction(actionId) {
  const event = currentEvent();
  if (!event) return;
  const action = event.actions.find((item) => item.id === actionId);
  if (!action) return;

  if (actionId === "copy" || actionId === "copy-summary") {
    showToast(actionId === "copy" ? "命令已复制到剪贴板候选区" : "摘要已复制到剪贴板候选区");
    return;
  }

  if (actionId === "locate") {
    showToast(`已定位到 ${event.source}`);
    return;
  }

  if (actionId === "view-log") {
    showToast("日志面板已加入下一版范围");
    return;
  }

  if (action?.resolves) {
    event.resolved = true;
    event.resolution = action.label;
    const next = activeEvents()[0];
    selectedEventId = next?.id || null;
    selectedSessionId = next?.sessionId || selectedSessionId;
    showToast(`${event.title}：${action.label}`);
    if (!next) {
      panel = "none";
      autoState = true;
      syncStateFromEvent();
    }
    render();
    return;
  }

  showToast(action.label);
}

function moveEvent(delta) {
  const active = activeEvents();
  if (active.length <= 1) return;
  const event = currentEvent();
  const index = active.findIndex((item) => item.id === event.id);
  const next = active[(index + delta + active.length) % active.length];
  selectedEventId = next.id;
  selectedSessionId = next.sessionId;
  render();
}

function setScenario(scenario) {
  events = cloneEvents();
  if (scenario !== "all") {
    events.forEach((event) => {
      const keep =
        (scenario === "risk" && event.type === "risk") ||
        (scenario === "waiting" && event.type === "confirm") ||
        (scenario === "result" && event.type === "result") ||
        (scenario === "error" && event.type === "error");
      event.resolved = scenario === "idle" ? true : !keep;
    });
  }
  selectedEventId = activeEvents()[0]?.id || null;
  selectedSessionId = selectedEventId ? currentEvent().sessionId : "qwen";
  panel = "none";
  autoState = true;
  syncStateFromEvent();
  render();
}

function renderDemoState() {
  const event = currentEvent();
  const currentType = event?.type || "idle";
  scenarioGrid.querySelectorAll("[data-scenario]").forEach((button) => {
    const scenario = button.dataset.scenario;
    const isActive =
      (scenario === "idle" && !event) ||
      (scenario === "risk" && currentType === "risk") ||
      (scenario === "waiting" && currentType === "confirm") ||
      (scenario === "result" && currentType === "result") ||
      (scenario === "error" && currentType === "error") ||
      (scenario === "all" && activeEvents().length > 1);
    button.classList.toggle("active", isActive);
  });
  forcePeek.classList.toggle("active", state === "peek");
  forceAction.classList.toggle("active", state === "expanded" && panel === "action");
}

notchZone.addEventListener("mouseenter", () => {
  if (state === "expanded" || !currentEvent()) return;
  autoState = true;
  setState("peek");
});

notchZone.addEventListener("mouseleave", () => {
  if (state === "expanded" || !autoState) return;
  setState(restingStateForMood(moodForEvent(currentEvent())));
});

notchZone.addEventListener("focusin", () => {
  if (state !== "expanded" && currentEvent()) setState("peek");
});

leftCapsule.addEventListener("click", (event) => {
  event.stopPropagation();
  openPanel("sessions");
});

rightCapsule.addEventListener("click", (event) => {
  event.stopPropagation();
  openPanel("action");
});

document.addEventListener("click", (event) => {
  if (state !== "expanded") return;
  if (notchZone.contains(event.target)) return;
  if (demoTray.contains(event.target) || demoToggle.contains(event.target)) return;
  collapse();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    collapse();
    demoTray.classList.remove("open");
    demoTray.setAttribute("aria-hidden", "true");
    demoToggle.setAttribute("aria-expanded", "false");
  }
  if (state === "expanded" && panel === "action" && event.key === "ArrowRight") moveEvent(1);
  if (state === "expanded" && panel === "action" && event.key === "ArrowLeft") moveEvent(-1);
});

prevEvent.addEventListener("click", () => moveEvent(-1));
nextEvent.addEventListener("click", () => moveEvent(1));

demoToggle.addEventListener("click", () => {
  const open = !demoTray.classList.contains("open");
  demoTray.classList.toggle("open", open);
  demoTray.setAttribute("aria-hidden", String(!open));
  demoToggle.setAttribute("aria-expanded", String(open));
});

demoClose.addEventListener("click", () => {
  demoTray.classList.remove("open");
  demoTray.setAttribute("aria-hidden", "true");
  demoToggle.setAttribute("aria-expanded", "false");
});

scenarioGrid.querySelectorAll("[data-scenario]").forEach((button) => {
  button.addEventListener("click", () => setScenario(button.dataset.scenario));
});

forcePeek.addEventListener("click", () => {
  if (!currentEvent()) setScenario("waiting");
  setState("peek", { manual: true });
});

forceAction.addEventListener("click", () => {
  if (!currentEvent()) setScenario("waiting");
  openPanel("action");
});

resetEvents.addEventListener("click", () => {
  setScenario("all");
  showToast("事件队列已重置");
});

quietAllBtn.addEventListener("click", () => showToast("普通运行会话已保持安静"));
openPrefsBtn.addEventListener("click", () => showToast("偏好设置已加入下一版范围"));

function activatePeekFromPointer() {
  if (state === "expanded" || !currentEvent()) return;
  autoState = true;
  setState("peek");
}

function settleFromPointer() {
  if (state === "expanded" || !autoState) return;
  setState(restingStateForMood(moodForEvent(currentEvent())));
}

notchHit.addEventListener("mouseenter", activatePeekFromPointer);
notchHit.addEventListener("pointerenter", activatePeekFromPointer);
notchHit.addEventListener("mousemove", activatePeekFromPointer);
notchHit.addEventListener("mouseleave", settleFromPointer);

document.addEventListener("mousemove", (event) => {
  if (!currentEvent() || state === "expanded") return;
  const rect = notchZone.getBoundingClientRect();
  const inside =
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.top + 72;
  if (inside) {
    activatePeekFromPointer();
  } else if (autoState && state === "peek") {
    settleFromPointer();
  }
});

setScenario("all");
