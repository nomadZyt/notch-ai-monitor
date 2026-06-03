/* Notch AI Monitor — interactive state machine
 *
 * Four states (data-state):
 *   dormant  → nothing but the notch + a faint sleeping eye
 *   glance   → only the highest-priority capsule peeks out (badge only)
 *   peek     → capsules full + face leans out to grab attention
 *   expanded → a panel drops from the notch
 *
 * Two panels (data-panel), one per capsule:
 *   left capsule  → "sessions" : manage all running/idle sessions
 *   right capsule → "action"   : handle the thing that needs confirmation
 *
 * "Only show what needs attention": the resting state surfaces AT MOST one
 * mood, chosen by priority. Plain running sessions never claim space.
 */

const desktop = document.querySelector(".desktop");
const notchZone = document.getElementById("notchZone");
const leftCapsule = document.getElementById("leftCapsule");
const rightCapsule = document.getElementById("rightCapsule");
const deckHint = document.getElementById("deckHint");

const alertLabel = document.getElementById("alertLabel");
const alertCount = document.getElementById("alertCount");
const focusTitle = document.getElementById("focusTitle");
const focusSource = document.getElementById("focusSource");
const focusPrompt = document.getElementById("focusPrompt");
const focusIcon = document.querySelector("#expandedPanel .focus-action .tool-icon");
const sessionTabs = document.getElementById("sessionTabs");

// the three demo sessions, keyed by the value used in data-go-action
const SESSIONS = {
  claude: { tab: "Claude CLI", tool: "claude", source: "iTerm · autoXhs" },
  codex:  { tab: "Codex CLI",  tool: "codex",  source: "Terminal · wBot" },
  qwen:   { tab: "Qwen CLI",   tool: "qwen",   source: "Terminal · autoXhs" },
};

// per-mood copy. `session` points at which SESSIONS entry the action targets.
const MOOD_COPY = {
  none:    { label: "全部运行中",   count: "",  title: "所有会话运行中", prompt: "当前没有需要你处理的事。", session: "claude", hint: "休眠 — 刘海里一只眼轻轻呼吸，不占空间。" },
  waiting: { label: "等待确认",     count: "2", title: "Qwen CLI 需要确认", prompt: "运行生成的命令？", session: "qwen", hint: "等待 — 紫色。悬停可探出 · 点击可展开。" },
  happy:   { label: "结果就绪",     count: "1", title: "Claude CLI 已完成",  prompt: "输出已就绪，可以收取。", session: "claude", hint: "开心 — 绿色。你瞥一眼后自动收回。" },
  sad:     { label: "出错或超时",   count: "1", title: "Codex CLI 出错了", prompt: "会话失败 — 重试？", session: "codex", hint: "难过 — 蓝色。出了点问题。" },
  angry:   { label: "风险待处理",   count: "1", title: "已拦截高危命令", prompt: "危险命令 — 运行前请先确认。", session: "qwen", hint: "愤怒 — 红色。最高优先级，始终探出。" },
};

let state = "dormant";
let mood = "none";
let panel = "action";       // which panel an expand will show: "sessions" | "action"
let autoState = true;       // when true, state is derived from mood; manual override pauses this
let peekTimer = null;

function applyCopy() {
  const c = MOOD_COPY[mood] || MOOD_COPY.none;
  alertLabel.textContent = c.label;
  alertCount.textContent = c.count;
  alertCount.style.display = c.count ? "grid" : "none";
  focusTitle.textContent = c.title;
  focusPrompt.textContent = c.prompt;
  deckHint.textContent = c.hint;

  // keep the action panel's session in sync with the mood (fixes the
  // "happy shows Qwen/qw" mismatch). Highlight the right tab + icon + source.
  const sess = SESSIONS[c.session] || SESSIONS.claude;
  if (focusSource) focusSource.textContent = sess.source;
  if (focusIcon) focusIcon.className = `tool-icon ${sess.tool} large`;
  if (sessionTabs) {
    sessionTabs.querySelectorAll("button").forEach((b) => {
      b.classList.toggle("selected", b.textContent.trim() === sess.tab);
    });
  }
}

function render() {
  desktop.dataset.state = state;
  desktop.dataset.mood = mood;
  desktop.dataset.panel = panel;
  applyCopy();
  syncDeck();
}

/* Derive the resting state from the current mood (the "only show what
 * needs attention" rule). Angry always forces a peek. */
function restingStateForMood(m) {
  if (m === "none") return "dormant";   // nothing to show
  if (m === "angry") return "peek";     // risk always leans out
  return "glance";                      // others: quiet badge until hovered
}

function setMood(nextMood) {
  mood = nextMood;
  if (autoState) {
    state = restingStateForMood(mood);
  }
  render();
}

function setState(nextState, { manual = false } = {}) {
  state = nextState;
  if (manual) autoState = false;
  render();
}

/* ---------------- hover = peek, click = expand ---------------- */
notchZone.addEventListener("mouseenter", () => {
  if (state === "expanded") return;
  if (mood === "none") return;          // dormant stays dormant on hover
  clearTimeout(peekTimer);
  autoState = true;
  setState("peek");
});

notchZone.addEventListener("mouseleave", () => {
  if (state === "expanded") return;
  if (!autoState) return;
  // settle back to the mood's resting state
  peekTimer = setTimeout(() => setState(restingStateForMood(mood)), 160);
});

function collapse() {
  autoState = true;
  setState(restingStateForMood(mood));
}

// open a specific panel; clicking the same capsule again collapses it
function openPanel(which) {
  if (state === "expanded" && panel === which) {
    collapse();
    return;
  }
  panel = which;
  autoState = false;
  setState("expanded");
}

leftCapsule.addEventListener("click", (e) => { e.stopPropagation(); openPanel("sessions"); });
rightCapsule.addEventListener("click", (e) => { e.stopPropagation(); openPanel("action"); });

// clicking a session in the left list jumps to that session's action panel
document.querySelectorAll("[data-go-action]").forEach((item) => {
  item.addEventListener("click", (e) => {
    e.stopPropagation();
    const key = item.dataset.goAction;
    // map the chosen session onto a mood that has an action to take
    const moodForSession = { qwen: "waiting", claude: "happy", codex: "sad" };
    mood = moodForSession[key] || mood;
    panel = "action";
    autoState = false;
    setState("expanded");
  });
});

// click outside collapses an expanded panel
document.addEventListener("click", (e) => {
  if (state !== "expanded") return;
  if (notchZone.contains(e.target)) return;
  if (e.target.closest(".control-deck")) return;
  autoState = true;
  setState(restingStateForMood(mood));
});

/* ---------------- demo control deck ---------------- */
document.querySelectorAll("[data-scenario]").forEach((btn) => {
  btn.addEventListener("click", () => {
    autoState = true;
    setMood(btn.dataset.scenario === "idle" ? "none" : btn.dataset.scenario);
  });
});

document.querySelectorAll("[data-force-state]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.forceState;
    // forcing a state implies a mood that can show it
    if (target !== "dormant" && mood === "none") mood = "waiting";
    if (target === "expanded") panel = "action";   // deck defaults to the action panel
    setState(target, { manual: true });
  });
});

function syncDeck() {
  document.querySelectorAll("[data-scenario]").forEach((b) => {
    const m = b.dataset.scenario === "idle" ? "none" : b.dataset.scenario;
    b.classList.toggle("active", m === mood);
  });
  document.querySelectorAll("[data-force-state]").forEach((b) => {
    b.classList.toggle("active", b.dataset.forceState === state);
  });
}

// boot
setMood("none");
