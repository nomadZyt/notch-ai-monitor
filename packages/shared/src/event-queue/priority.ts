import type { EventType } from "../models/primitives.js";

export const DEFAULT_EVENT_PRIORITY: Record<EventType, number> = {
  risk: 100,
  confirm: 80,
  error: 70,
  result: 55,
};
