import { deriveViewHints } from "../state-machine/view-state.js";
import { applyP0Dedupe } from "./dedupe.js";
function timestampValue(value) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
}
export function compareEventsForQueue(a, b) {
    if (a.priority !== b.priority)
        return b.priority - a.priority;
    const aTime = timestampValue(a.createdAt);
    const bTime = timestampValue(b.createdAt);
    if (aTime !== bTime)
        return bTime - aTime;
    return b.id.localeCompare(a.id);
}
export function sortEventsForQueue(events) {
    return [...events].sort(compareEventsForQueue);
}
export function activeEvents(events) {
    return sortEventsForQueue(events.filter((event) => event.status === "active"));
}
export function activeEventIds(events) {
    return activeEvents(events).map((event) => event.id);
}
export function nextEvent(events) {
    return activeEvents(events)[0] ?? null;
}
export function nextEventId(events) {
    return nextEvent(events)?.id ?? null;
}
function toQueueUpdate(events, updatedEvent) {
    return {
        events,
        activeEventIds: activeEventIds(events),
        nextEventId: nextEventId(events),
        ...(updatedEvent ? { updatedEvent } : {}),
    };
}
export function enqueueEvent(events, event) {
    const deduped = applyP0Dedupe([...events, { ...event }]);
    const updatedEvent = deduped.find((item) => item.id === event.id);
    return toQueueUpdate(deduped, updatedEvent);
}
export function replaceEvents(events) {
    const deduped = applyP0Dedupe(events);
    return toQueueUpdate(deduped);
}
function updateEventStatus(events, eventId, status, options) {
    let updatedEvent;
    const nextEvents = events.map((event) => {
        if (event.id !== eventId)
            return { ...event };
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
export function resolveEvent(events, eventId, options) {
    return updateEventStatus(events, eventId, "resolved", options);
}
export function ignoreEvent(events, eventId, options) {
    return updateEventStatus(events, eventId, "ignored", options);
}
export function expireEvent(events, eventId, options) {
    return updateEventStatus(events, eventId, "expired", options);
}
export function buildManagerSnapshot(sessions, events) {
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
            activeSessions: sessions.filter((session) => session.state === "running" || session.state === "waiting").length,
            activeEvents: ids.length,
        },
        viewHints: deriveViewHints(current),
    };
}
