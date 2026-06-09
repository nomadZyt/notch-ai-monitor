import type { EventType } from "@notch-ai-monitor/shared";
import { type SourceProfileId } from "../index.js";
export interface NotchRunSmokeOptions {
    baseUrl: string;
    profileId: SourceProfileId;
    cwd: string;
    reset: boolean;
    preset: NotchRunSmokePreset;
    expectType: Extract<EventType, "confirm" | "result" | "error"> | null;
    expectedExitCode: number;
    expectedEndReason: string | null;
    childCommand: string;
    childArgs: string[];
}
export type NotchRunSmokePreset = "node-result" | "node-exit-7" | "codex-version" | "claude-version";
export declare function parseNotchRunSmokeArgs(argv: string[]): NotchRunSmokeOptions;
export declare function runNotchRunSmoke(argv?: string[]): Promise<void>;
//# sourceMappingURL=notch-run-smoke.d.ts.map