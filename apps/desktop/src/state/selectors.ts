import { moodForEvent } from "@notch-ai-monitor/shared";
import type { ManagerSnapshot, Mood, NotchEvent, Session } from "@notch-ai-monitor/shared";

export const EVENT_TYPE_META = {
  risk: { mood: "angry", label: "风险", short: "风险" },
  confirm: { mood: "waiting", label: "确认", short: "确认" },
  result: { mood: "happy", label: "结果", short: "结果" },
  error: { mood: "sad", label: "错误", short: "错误" },
} as const satisfies Record<NotchEvent["type"], { mood: Mood; label: string; short: string }>;

export const SCENARIO_LABELS = {
  idle: "安静",
  waiting: "等待确认",
  result: "结果就绪",
  error: "错误",
  risk: "风险",
  all: "全部事件",
} as const;

export type DebugScenario = keyof typeof SCENARIO_LABELS;

export function activeEventsFromSnapshot(snapshot: ManagerSnapshot): NotchEvent[] {
  const eventsById = new Map(snapshot.events.map((event) => [event.id, event]));
  return snapshot.activeEventIds
    .map((eventId) => eventsById.get(eventId))
    .filter((event): event is NotchEvent => Boolean(event));
}

export function sessionById(snapshot: ManagerSnapshot, sessionId: string | null): Session | null {
  if (!sessionId) return null;
  return snapshot.sessions.find((session) => session.id === sessionId) ?? null;
}

export function selectedEventFromSnapshot(
  snapshot: ManagerSnapshot,
  selectedEventId: string | null
): NotchEvent | null {
  const active = activeEventsFromSnapshot(snapshot);
  const selected = active.find((event) => event.id === selectedEventId);
  if (selected) return selected;

  const current = active.find((event) => event.id === snapshot.currentEventId);
  return current ?? active[0] ?? null;
}

export function activeCountBySession(snapshot: ManagerSnapshot): Map<string, number> {
  const counts = new Map<string, number>();
  for (const event of activeEventsFromSnapshot(snapshot)) {
    counts.set(event.sessionId, (counts.get(event.sessionId) ?? 0) + 1);
  }
  return counts;
}

export function moodForSelectedEvent(event: NotchEvent | null): Mood {
  return moodForEvent(event);
}

export function scenarioFromSnapshot(snapshot: ManagerSnapshot): DebugScenario {
  const active = activeEventsFromSnapshot(snapshot);
  if (active.length === 0) return "idle";
  if (active.length > 1) return "all";

  const type = active[0]?.type;
  if (type === "confirm") return "waiting";
  if (type === "result" || type === "error" || type === "risk") return type;
  return "idle";
}

export function formatClockLabel(date = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatRelativeTime(value: string | undefined): string {
  if (!value) return "刚刚";

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;

  const diffMs = Date.now() - parsed;
  const absMinutes = Math.max(0, Math.round(Math.abs(diffMs) / 60000));
  if (absMinutes < 1) return "刚刚";
  if (absMinutes < 60) return `${absMinutes} 分钟前`;

  const absHours = Math.round(absMinutes / 60);
  if (absHours < 24) return `${absHours} 小时前`;

  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(parsed));
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
