#!/usr/bin/env node
import { runNotchRunSmoke } from "../smoke/notch-run-smoke.js";

try {
  await runNotchRunSmoke();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
