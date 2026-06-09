import type { ActionResultStatus, EventStatus } from "@notch-ai-monitor/shared";
export interface ActionResolutionSmokeOptions {
    baseUrl: string;
    actionId: string;
    prepareFailure: boolean;
    expectedSessionState: "failed";
    expectedExitCode: number;
    expectedEndReason: string;
    expectedResultStatus: ActionResultStatus;
    expectedEventStatus: EventStatus;
    expectedResolvedEventStatus: EventStatus | null;
    expectedActiveEvents: number;
}
export declare function parseActionResolutionSmokeArgs(argv: string[]): ActionResolutionSmokeOptions;
export declare function runActionResolutionSmoke(argv?: string[]): Promise<void>;
//# sourceMappingURL=action-resolution-smoke.d.ts.map