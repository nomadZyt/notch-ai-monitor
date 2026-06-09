#!/usr/bin/env node
import { runNotchRun } from "../index.js";
try {
    await runNotchRun();
}
catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
}
