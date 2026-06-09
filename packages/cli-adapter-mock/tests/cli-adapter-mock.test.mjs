import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import {
  DANGEROUS_CONFIRM_COMMAND,
  createMockEnvelopeSequence,
  postEnvelope,
} from "../dist/src/index.js";

test("risky-confirm sequence sends session upsert followed by dangerous confirm command", () => {
  const envelopes = createMockEnvelopeSequence({
    scenario: "risky-confirm",
    sessionId: "sess_cli_test_001",
    now: "2026-06-06T12:00:00+08:00",
  });

  assert.equal(envelopes.length, 2);
  assert.equal(envelopes[0].event, "notch.session.upserted");
  assert.equal(envelopes[1].event, "notch.event.created");
  assert.equal(envelopes[1].payload.event.type, "confirm");
  assert.equal(envelopes[1].payload.event.command, DANGEROUS_CONFIRM_COMMAND);
});

test("all sequence includes confirm, risky confirm, risk, result, and error examples", () => {
  const envelopes = createMockEnvelopeSequence({
    scenario: "all",
    now: "2026-06-06T12:00:00+08:00",
  });

  assert.deepEqual(
    envelopes.slice(1).map((item) => item.payload.event.type),
    ["confirm", "confirm", "risk", "result", "error"]
  );
  assert.equal(envelopes[2].payload.event.command, DANGEROUS_CONFIRM_COMMAND);
});

test("postEnvelope sends JSON to /v1/envelopes", async () => {
  let server;
  const received = new Promise((resolve) => {
    server = createServer((request, response) => {
      const chunks = [];
      request.on("data", (chunk) => chunks.push(chunk));
      request.on("end", () => {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ ok: true, receivedEvent: body.event }));
        resolve({ request, body });
      });
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const envelope = createMockEnvelopeSequence({
    scenario: "session",
    now: "2026-06-06T12:00:00+08:00",
  })[0];

  try {
    const response = await postEnvelope(baseUrl, envelope);
    const captured = await received;

    assert.deepEqual(response, { ok: true, receivedEvent: "notch.session.upserted" });
    assert.equal(captured.request.method, "POST");
    assert.equal(captured.request.url, "/v1/envelopes");
    assert.equal(captured.body.event, "notch.session.upserted");
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
});
