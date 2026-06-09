#!/usr/bin/env node
import { runRealCliAdapter } from "../index.js";
try {
    await runRealCliAdapter();
}
catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
}
