import type { NotchEvent } from "../models/event.js";

function timestampValue(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function isNewer(a: NotchEvent, b: NotchEvent): boolean {
  const aTime = timestampValue(a.createdAt);
  const bTime = timestampValue(b.createdAt);
  if (aTime !== bTime) return aTime > bTime;
  return a.id > b.id;
}

function mergeIntoExisting(existing: NotchEvent, incoming: NotchEvent): NotchEvent {
  const merged: NotchEvent = {
    ...existing,
    title: incoming.title,
    summary: incoming.summary,
    source: incoming.source,
    updatedAt: incoming.updatedAt ?? incoming.createdAt,
    actions: incoming.actions,
    occurrenceCount: (existing.occurrenceCount ?? 1) + (incoming.occurrenceCount ?? 1),
  };

  const command = incoming.command ?? existing.command;
  if (command !== undefined) merged.command = command;

  const commandHash = incoming.commandHash ?? existing.commandHash;
  if (commandHash !== undefined) merged.commandHash = commandHash;

  const evidence = incoming.evidence ?? existing.evidence;
  if (evidence !== undefined) merged.evidence = evidence;

  const reasons = incoming.reasons ?? existing.reasons;
  if (reasons !== undefined) merged.reasons = reasons;

  const errorKey = incoming.errorKey ?? existing.errorKey;
  if (errorKey !== undefined) merged.errorKey = errorKey;

  return merged;
}

function expireMergedDuplicate(event: NotchEvent, updatedAt: string): NotchEvent {
  return {
    ...event,
    status: "expired",
    updatedAt,
    resolvedAt: updatedAt,
    resolution: "merged_duplicate",
  };
}

export function applyP0Dedupe(events: readonly NotchEvent[]): NotchEvent[] {
  const next = events.map((event) => ({ ...event }));

  const resultGroups = new Map<string, number[]>();
  next.forEach((event, index) => {
    if (event.status !== "active" || event.type !== "result") return;
    const key = `${event.sessionId}:result`;
    resultGroups.set(key, [...(resultGroups.get(key) ?? []), index]);
  });

  resultGroups.forEach((indexes) => {
    if (indexes.length <= 1) return;
    const keeperIndex = indexes.reduce((keeper, current) =>
      isNewer(next[current]!, next[keeper]!) ? current : keeper
    );
    indexes.forEach((index) => {
      if (index === keeperIndex) return;
      next[index] = expireMergedDuplicate(next[index]!, next[keeperIndex]!.createdAt);
    });
  });

  const confirmByCommand = new Map<string, number>();
  next.forEach((event, index) => {
    if (event.status !== "active" || event.type !== "confirm" || !event.commandHash) return;
    const key = `${event.sessionId}:${event.commandHash}`;
    const existingIndex = confirmByCommand.get(key);
    if (existingIndex === undefined) {
      confirmByCommand.set(key, index);
      return;
    }

    next[existingIndex] = mergeIntoExisting(next[existingIndex]!, event);
    next[index] = expireMergedDuplicate(event, next[existingIndex]!.updatedAt ?? event.createdAt);
  });

  const errorByKey = new Map<string, number>();
  next.forEach((event, index) => {
    if (event.status !== "active" || event.type !== "error" || !event.errorKey) return;
    const key = `${event.sessionId}:error:${event.errorKey}`;
    const existingIndex = errorByKey.get(key);
    if (existingIndex === undefined) {
      errorByKey.set(key, index);
      return;
    }

    next[existingIndex] = mergeIntoExisting(next[existingIndex]!, event);
    next[index] = expireMergedDuplicate(event, next[existingIndex]!.updatedAt ?? event.createdAt);
  });

  return next;
}
