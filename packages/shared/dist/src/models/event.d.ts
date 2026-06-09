import type { Action } from "./action.js";
import type { Evidence } from "./evidence.js";
import type { EventStatus, EventType, ISODateTimeString } from "./primitives.js";
export interface NotchEvent {
    id: string;
    sessionId: string;
    type: EventType;
    priority: number;
    status: EventStatus;
    title: string;
    summary: string;
    command?: string;
    commandHash?: string;
    source: string;
    createdAt: ISODateTimeString;
    updatedAt?: ISODateTimeString;
    evidence?: Evidence;
    reasons?: string[];
    actions: Action[];
    resolvedAt?: ISODateTimeString;
    resolution?: string;
    occurrenceCount?: number;
    errorKey?: string;
}
//# sourceMappingURL=event.d.ts.map