import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRiskEvent,
  commandLooksRisky,
  riskAssessmentToEvidence,
  scanCommand,
} from "../dist/src/index.js";

const fixedNow = "2026-06-06T12:00:00+08:00";

test("safe command stays low risk and does not build a risk event", () => {
  const assessment = scanCommand("npm test && git status");

  assert.equal(assessment.riskLevel, "low");
  assert.equal(assessment.isRisky, false);
  assert.equal(commandLooksRisky("npm test && git status"), false);
  assert.deepEqual(assessment.reasons, []);
  assert.equal(
    buildRiskEvent({
      command: "npm test && git status",
      sessionId: "sess_test_001",
      createdAt: fixedNow,
    }),
    undefined
  );
});

test("rm -rf detects high risk for non-temp targets and critical risk for Documents wildcard", () => {
  const highAssessment = scanCommand("rm -rf ./dist");

  assert.equal(highAssessment.riskLevel, "high");
  assert.deepEqual(highAssessment.affectedPaths, ["./dist"]);
  assert.equal(commandLooksRisky("rm -rf ./dist"), true);

  const criticalAssessment = scanCommand("rm -fr ~/Documents/xhs-drafts/*");

  assert.equal(criticalAssessment.riskLevel, "critical");
  assert.deepEqual(criticalAssessment.affectedPaths, ["~/Documents/xhs-drafts/*"]);
  assert.equal(
    criticalAssessment.reasons.some((reason) => reason.includes("Documents")),
    true
  );
  assert.equal(
    criticalAssessment.reasons.some((reason) => reason.includes("通配符")),
    true
  );
});

test("git clean -fd and -xdf are high risk and record the working tree", () => {
  const assessment = scanCommand("git clean -xdf", {
    cwd: "/Users/example/notch-ai-monitor",
  });

  assert.equal(assessment.riskLevel, "high");
  assert.deepEqual(assessment.affectedPaths, ["/Users/example/notch-ai-monitor"]);
  assert.equal(assessment.matchedRules.includes("git-clean-force-directories"), true);
  assert.equal(
    assessment.reasons.some((reason) => reason.includes("git clean -xdf")),
    true
  );
});

test("sudo is medium alone and escalates with destructive filesystem commands", () => {
  const sudoOnly = scanCommand("sudo npm install -g typescript");

  assert.equal(sudoOnly.riskLevel, "medium");
  assert.equal(sudoOnly.matchedRules.includes("sudo-privilege-escalation"), true);

  const sudoRm = scanCommand("sudo rm -rf ./build");

  assert.equal(sudoRm.riskLevel, "high");
  assert.equal(sudoRm.matchedRules.includes("sudo-privilege-escalation"), true);
  assert.equal(sudoRm.matchedRules.includes("rm-recursive-force"), true);
});

test("combination commands stack reasons and affected paths", () => {
  const assessment = scanCommand(
    "sudo rm -rf ~/Documents/xhs-drafts/* && git clean -xdf"
  );

  assert.equal(assessment.riskLevel, "critical");
  assert.equal(assessment.affectedPaths.includes("~/Documents/xhs-drafts/*"), true);
  assert.equal(assessment.affectedPaths.includes("."), true);
  assert.equal(assessment.matchedRules.includes("sudo-privilege-escalation"), true);
  assert.equal(assessment.matchedRules.includes("rm-recursive-force"), true);
  assert.equal(assessment.matchedRules.includes("git-clean-force-directories"), true);
  assert.equal(assessment.reasons.length >= 4, true);
});

test("risk assessment converts to Evidence and full Notch risk event", () => {
  const command = "chmod -R 777 ./scripts";
  const assessment = scanCommand(command, {
    origin: "AI generated command, waiting for approval",
  });
  const evidence = riskAssessmentToEvidence(assessment);

  assert.equal(evidence.riskLevel, "high");
  assert.equal(evidence.origin, "AI generated command, waiting for approval");
  assert.deepEqual(evidence.affectedPaths, ["./scripts"]);

  const event = buildRiskEvent({
    command,
    sessionId: "sess_test_001",
    source: "Terminal · notch-ai-monitor",
    createdAt: fixedNow,
    assessment,
  });

  assert.equal(event?.type, "risk");
  assert.equal(event?.priority, 100);
  assert.equal(event?.status, "active");
  assert.equal(event?.evidence?.riskLevel, "high");
  assert.deepEqual(
    event?.actions.map((action) => action.id),
    ["reject", "allow-once", "locate", "copy"]
  );
  assert.equal(
    event?.actions.find((action) => action.id === "allow-once")?.requiresConfirm,
    true
  );
});
