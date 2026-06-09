import type { NotchEvent } from "../models/event.js";
import type { Mood, RestingShellState } from "../models/primitives.js";
import { moodForEvent, restingStateForMood } from "./mood.js";

export interface ViewHints {
  mood: Mood;
  restingState: RestingShellState;
  shouldAutoPeek: boolean;
}

export function deriveViewHints(event: Pick<NotchEvent, "type"> | null | undefined): ViewHints {
  const mood = moodForEvent(event);
  const restingState = restingStateForMood(mood);

  return {
    mood,
    restingState,
    shouldAutoPeek: restingState === "peek",
  };
}
