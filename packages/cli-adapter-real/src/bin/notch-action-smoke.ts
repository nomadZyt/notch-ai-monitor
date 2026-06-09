#!/usr/bin/env node
import { runActionResolutionSmoke } from "../smoke/action-resolution-smoke.js";

try {
  await runActionResolutionSmoke();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
