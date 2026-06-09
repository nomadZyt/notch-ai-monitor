import type { NotchEvent } from "../models/event.js";
import type { Mood, RestingShellState } from "../models/primitives.js";
export interface ViewHints {
    mood: Mood;
    restingState: RestingShellState;
    shouldAutoPeek: boolean;
}
export declare function deriveViewHints(event: Pick<NotchEvent, "type"> | null | undefined): ViewHints;
//# sourceMappingURL=view-state.d.ts.map