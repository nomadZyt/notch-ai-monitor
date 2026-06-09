import type { NotchEvent } from "../models/event.js";
import type { ISODateTimeString } from "../models/primitives.js";
import type { ManagerSnapshot } from "../protocol/envelope.js";
import type { Session } from "../models/session.js";
export interface EventQueueUpdate {
    events: NotchEvent[];
    activeEventIds: string[];
    nextEventId: string | null;
    updatedEvent?: NotchEvent;
}
export interface EventStatusUpdateOptions {
    at: ISODateTimeString;
    resolution?: string;
}
export declare function compareEventsForQueue(a: NotchEvent, b: NotchEvent): number;
export declare function sortEventsForQueue(events: readonly NotchEvent[]): NotchEvent[];
export declare function activeEvents(events: readonly NotchEvent[]): NotchEvent[];
export declare function activeEventIds(events: readonly NotchEvent[]): string[];
export declare function nextEvent(events: readonly NotchEvent[]): NotchEvent | null;
export declare function nextEventId(events: readonly NotchEvent[]): string | null;
export declare function enqueueEvent(events: readonly NotchEvent[], event: NotchEvent): EventQueueUpdate;
export declare function replaceEvents(events: readonly NotchEvent[]): EventQueueUpdate;
export declare function resolveEvent(events: readonly NotchEvent[], eventId: string, options: EventStatusUpdateOptions): EventQueueUpdate;
export declare function ignoreEvent(events: readonly NotchEvent[], eventId: string, options: EventStatusUpdateOptions): EventQueueUpdate;
export declare function expireEvent(events: readonly NotchEvent[], eventId: string, options: EventStatusUpdateOptions): EventQueueUpdate;
export declare function buildManagerSnapshot(sessions: readonly Session[], events: readonly NotchEvent[]): ManagerSnapshot;
//# sourceMappingURL=queue.d.ts.map