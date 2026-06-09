#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

const requiredDesignSources = [
  "docs/technical-options-and-task-plan.md",
  "docs/product-requirements-v2.md",
  "docs/效果说明.md",
  "docs/product-audit.md",
  "design/notch-ai-monitor-hifi.html",
  "output/high-fidelity-directions/01-quiet-glass.png",
  "output/interactive-v2/22-desktop-face-uncovered.png",
  "output/interactive-v2/14-left-chip-sessions-panel.png",
  "output/product-audit-2026-06-06/04-action-expanded.png",
  "output/product-audit-2026-06-06/05-sessions-expanded.png",
];

const guardedPathPrefixes = [
  "apps/desktop/",
  "apps/tauri/",
  "docs/qa/p2-p3-beta-acceptance.md",
];

const ignoredChangePrefixes = [
  "node_modules/",
  "apps/desktop/node_modules/",
  "apps/tauri/node_modules/",
  "apps/tauri/src-tauri/target/",
];

function relative(filePath) {
  return path.relative(repoRoot, filePath);
}

function fail(message, details = []) {
  console.error(`design surface guard failed: ${message}`);
  for (const detail of details) console.error(`- ${detail}`);
  process.exit(1);
}

const missing = requiredDesignSources.filter((item) => !existsSync(path.join(repoRoot, item)));
if (missing.length) {
  fail("required product design sources are missing", missing);
}

const status = execFileSync("git", ["status", "--short", "-uall"], {
  cwd: repoRoot,
  encoding: "utf8",
});
const changedFiles = status
  .split("\n")
  .map((line) => line.slice(3).trim())
  .filter(Boolean)
  .map((file) => file.replace(/^"|"$/g, ""))
  .filter((file) => !ignoredChangePrefixes.some((prefix) => file.startsWith(prefix)));
const guardedChanges = changedFiles.filter((file) =>
  guardedPathPrefixes.some((prefix) => file === prefix || file.startsWith(prefix))
);

if (!guardedChanges.length) {
  console.log(JSON.stringify({ ok: true, guardedChanges: 0 }, null, 2));
  process.exit(0);
}

const checkpointPath = path.join(repoRoot, "docs/handoffs/main-agent-context-checkpoint-p2.md");
if (!existsSync(checkpointPath)) {
  fail("checkpoint is missing while guarded UI/packaging files changed", guardedChanges);
}

const checkpoint = readFileSync(checkpointPath, "utf8");
const requiredCheckpointMarkers = [
  "P3 Product Shape Re-evaluation",
  "Tauri MVP Host",
  "docs/technical-options-and-task-plan.md",
  "Tauri app-managed Manager",
];
const missingMarkers = requiredCheckpointMarkers.filter((marker) => !checkpoint.includes(marker));
if (missingMarkers.length) {
  fail("checkpoint lacks product-shape alignment markers", missingMarkers);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      guardedChanges: guardedChanges.length,
      guardedFiles: guardedChanges,
    },
    null,
    2
  )
);
