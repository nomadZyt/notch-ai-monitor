import type { EventType, Mood, RestingShellState } from "../models/primitives.js";
import type { NotchEvent } from "../models/event.js";

export const MOOD_BY_EVENT_TYPE: Record<EventType, Mood> = {
  risk: "angry",
  confirm: "waiting",
  result: "happy",
  error: "sad",
};

export function moodForEvent(event: Pick<NotchEvent, "type"> | null | undefined): Mood {
  if (!event) return "none";
  return MOOD_BY_EVENT_TYPE[event.type];
}

export function restingStateForMood(mood: Mood): RestingShellState {
  if (mood === "none") return "dormant";
  if (mood === "angry") return "peek";
  return "glance";
}
