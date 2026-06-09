#!/usr/bin/env node
import { runMockCliSender } from "../index.js";

try {
  await runMockCliSender();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
