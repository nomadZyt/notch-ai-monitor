import assert from "node:assert/strict";
import test from "node:test";

import {
  activeEvents,
  allEventsFixture,
  confirmEventFixture,
  duplicateConfirmEventFixture,
  duplicateErrorEventFixture,
  duplicateResultEventFixture,
  enqueueEvent,
  errorEventFixture,
  resultEventFixture,
  resolveEvent,
  riskEventFixture,
} from "../dist/src/index.js";

test("sorts active events by priority, then createdAt newest first", () => {
  const olderResult = {
    ...resultEventFixture,
    id: "evt_result_old",
    sessionId: "sess_custom_001",
    createdAt: "2026-06-06T11:20:00+08:00",
  };
  const newerResult = {
    ...resultEventFixture,
    id: "evt_result_new",
    sessionId: "sess_custom_002",
    createdAt: "2026-06-06T11:45:00+08:00",
  };

  assert.deepEqual(
    activeEvents([olderResult, newerResult, errorEventFixture, riskEventFixture]).map(
      (event) => event.id
    ),
    ["evt_risk_rm_001", "evt_error_codex_001", "evt_result_new", "evt_result_old"]
  );
});

test("resolve marks current event and returns nextEventId", () => {
  const result = resolveEvent(allEventsFixture, "evt_risk_rm_001", {
    at: "2026-06-06T11:44:00+08:00",
    resolution: "拒绝执行",
  });

  assert.equal(result.updatedEvent?.status, "resolved");
  assert.equal(result.updatedEvent?.resolvedAt, "2026-06-06T11:44:00+08:00");
  assert.equal(result.nextEventId, "evt_confirm_qwen_001");
  assert.deepEqual(result.activeEventIds, [
    "evt_confirm_qwen_001",
    "evt_error_codex_001",
    "evt_result_claude_001",
  ]);
});

test("risk allow-once action requires second confirmation", () => {
  const action = riskEventFixture.actions.find((item) => item.id === "allow-once");

  assert.equal(action?.requiresConfirm, true);
  assert.equal(action?.sideEffect, "process");
  assert.equal(action?.enabled, true);
  assert.equal(action?.resolves, true);
});

test("dedupes repeated result events by expiring older result", () => {
  const result = enqueueEvent([resultEventFixture], duplicateResultEventFixture);
  const active = activeEvents(result.events);
  const oldEvent = result.events.find((event) => event.id === resultEventFixture.id);

  assert.deepEqual(active.map((event) => event.id), ["evt_result_claude_002"]);
  assert.equal(oldEvent?.status, "expired");
});

test("dedupes repeated confirm commands by sessionId and commandHash", () => {
  const result = enqueueEvent([confirmEventFixture], duplicateConfirmEventFixture);
  const active = activeEvents(result.events);
  const merged = result.events.find((event) => event.id === confirmEventFixture.id);
  const duplicate = result.events.find((event) => event.id === duplicateConfirmEventFixture.id);

  assert.deepEqual(active.map((event) => event.id), ["evt_confirm_qwen_001"]);
  assert.equal(merged?.summary, duplicateConfirmEventFixture.summary);
  assert.equal(merged?.occurrenceCount, 2);
  assert.equal(duplicate?.status, "expired");
});

test("dedupes repeated errors by sessionId and errorKey", () => {
  const result = enqueueEvent([errorEventFixture], duplicateErrorEventFixture);
  const active = activeEvents(result.events);
  const merged = result.events.find((event) => event.id === errorEventFixture.id);
  const duplicate = result.events.find((event) => event.id === duplicateErrorEventFixture.id);

  assert.deepEqual(active.map((event) => event.id), ["evt_error_codex_001"]);
  assert.equal(merged?.summary, duplicateErrorEventFixture.summary);
  assert.equal(merged?.occurrenceCount, 2);
  assert.equal(duplicate?.status, "expired");
});
