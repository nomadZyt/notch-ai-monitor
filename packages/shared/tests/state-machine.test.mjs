import assert from "node:assert/strict";
import test from "node:test";

import {
  confirmEventFixture,
  deriveViewHints,
  errorEventFixture,
  moodForEvent,
  restingStateForMood,
  resultEventFixture,
  riskEventFixture,
} from "../dist/src/index.js";

test("maps event types to contract moods", () => {
  assert.equal(moodForEvent(null), "none");
  assert.equal(moodForEvent(riskEventFixture), "angry");
  assert.equal(moodForEvent(confirmEventFixture), "waiting");
  assert.equal(moodForEvent(resultEventFixture), "happy");
  assert.equal(moodForEvent(errorEventFixture), "sad");
});

test("maps moods to resting shell states", () => {
  assert.equal(restingStateForMood("none"), "dormant");
  assert.equal(restingStateForMood("angry"), "peek");
  assert.equal(restingStateForMood("waiting"), "glance");
  assert.equal(restingStateForMood("happy"), "glance");
  assert.equal(restingStateForMood("sad"), "glance");
});

test("derives view hints for risk auto-peek and idle dormant", () => {
  assert.deepEqual(deriveViewHints(riskEventFixture), {
    mood: "angry",
    restingState: "peek",
    shouldAutoPeek: true,
  });

  assert.deepEqual(deriveViewHints(null), {
    mood: "none",
    restingState: "dormant",
    shouldAutoPeek: false,
  });
});
