import type { EventType, Mood, RestingShellState } from "../models/primitives.js";
import type { NotchEvent } from "../models/event.js";
export declare const MOOD_BY_EVENT_TYPE: Record<EventType, Mood>;
export declare function moodForEvent(event: Pick<NotchEvent, "type"> | null | undefined): Mood;
export declare function restingStateForMood(mood: Mood): RestingShellState;
//# sourceMappingURL=mood.d.ts.map