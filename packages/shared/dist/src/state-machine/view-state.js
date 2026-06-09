import { moodForEvent, restingStateForMood } from "./mood.js";
export function deriveViewHints(event) {
    const mood = moodForEvent(event);
    const restingState = restingStateForMood(mood);
    return {
        mood,
        restingState,
        shouldAutoPeek: restingState === "peek",
    };
}
