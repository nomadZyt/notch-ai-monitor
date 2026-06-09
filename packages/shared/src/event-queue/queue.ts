import type { NotchEvent } from "../models/event.js";
import type { EventStatus, ISODateTimeString } from "../models/primitives.js";
import { deriveViewHints } from "../state-machine/view-state.js";
import type { ManagerSnapshot } from "../protocol/envelope.js";
import type { Session } from "../models/session.js";
import { applyP0Dedupe } from "./dedupe.js";

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

function timestampValue(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function compareEventsForQueue(a: NotchEvent, b: NotchEvent): number {
  if (a.priority !== b.priority) return b.priority - a.priority;

  const aTime = timestampValue(a.createdAt);
  const bTime = timestampValue(b.createdAt);
  if (aTime !== bTime) return bTime - aTime;

  return b.id.localeCompare(a.id);
}

export function sortEventsForQueue(events: readonly NotchEvent[]): NotchEvent[] {
  return [...events].sort(compareEventsForQueue);
}

export function activeEvents(events: readonly NotchEvent[]): NotchEvent[] {
  return sortEventsForQueue(events.filter((event) => event.status === "active"));
}

export function activeEventIds(events: readonly NotchEvent[]): string[] {
  return activeEvents(events).map((event) => event.id);
}

export function nextEvent(events: readonly NotchEvent[]): NotchEvent | null {
  return activeEvents(events)[0] ?? null;
}

export function nextEventId(events: readonly NotchEvent[]): string | null {
  return nextEvent(events)?.id ?? null;
}

function toQueueUpdate(events: NotchEvent[], updatedEvent?: NotchEvent): EventQueueUpdate {
  return {
    events,
    activeEventIds: activeEventIds(events),
    nextEventId: nextEventId(events),
    ...(updatedEvent ? { updatedEvent } : {}),
  };
}

export function enqueueEvent(
  events: readonly NotchEvent[],
  event: NotchEvent
): EventQueueUpdate {
  const deduped = applyP0Dedupe([...events, { ...event }]);
  const updatedEvent = deduped.find((item) => item.id === event.id);
  return toQueueUpdate(deduped, updatedEvent);
}

export function replaceEvents(events: readonly NotchEvent[]): EventQueueUpdate {
  const deduped = applyP0Dedupe(events);
  return toQueueUpdate(deduped);
}

function updateEventStatus(
  events: readonly NotchEvent[],
  eventId: string,
  status: EventStatus,
  options: EventStatusUpdateOptions
): EventQueueUpdate {
  let updatedEvent: NotchEvent | undefined;
  const nextEvents = events.map((event) => {
    if (event.id !== eventId) return { ...event };

    updatedEvent = {
      ...event,
      status,
      updatedAt: options.at,
      resolvedAt: options.at,
      ...(options.resolution ? { resolution: options.resolution } : {}),
    };
    return updatedEvent;
  });

  return toQueueUpdate(nextEvents, updatedEvent);
}

export function resolveEvent(
  events: readonly NotchEvent[],
  eventId: string,
  options: EventStatusUpdateOptions
): EventQueueUpdate {
  return updateEventStatus(events, eventId, "resolved", options);
}

export function ignoreEvent(
  events: readonly NotchEvent[],
  eventId: string,
  options: EventStatusUpdateOptions
): EventQueueUpdate {
  return updateEventStatus(events, eventId, "ignored", options);
}

export function expireEvent(
  events: readonly NotchEvent[],
  eventId: string,
  options: EventStatusUpdateOptions
): EventQueueUpdate {
  return updateEventStatus(events, eventId, "expired", options);
}

export function buildManagerSnapshot(
  sessions: readonly Session[],
  events: readonly NotchEvent[]
): ManagerSnapshot {
  const deduped = applyP0Dedupe(events);
  const ids = activeEventIds(deduped);
  const current = nextEvent(deduped);

  return {
    sessions: sessions.map((session) => ({ ...session })),
    events: deduped,
    activeEventIds: ids,
    currentEventId: current?.id ?? null,
    counts: {
      sessions: sessions.length,
      activeSessions: sessions.filter(
        (session) => session.state === "running" || session.state === "waiting"
      ).length,
      activeEvents: ids.length,
    },
    viewHints: deriveViewHints(current),
  };
}
