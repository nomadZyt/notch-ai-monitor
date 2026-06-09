import { type ProcessActionCompletionInput, type ProcessSupervisor, type ProcessSupervisorRequest, type ProcessSupervisorResult, type RetrySupervisorRequest } from "@notch-ai-monitor/local-manager-mock";
import type { Session } from "@notch-ai-monitor/shared";
export interface LocalProcessSupervisorOptions {
    clock?: () => string;
    onSessionEnded?: (sessionId: string, end: {
        state: Extract<Session["state"], "completed" | "failed">;
        exitCode?: number;
        endReason?: string;
    }) => void;
    onProcessActionCompleted?: (completion: ProcessActionCompletionInput) => void;
}
export interface AdapterControlRegistration {
    sessionId: string;
    runId: string;
    launchProfileHash: string;
    supervisorTokenHash: string;
    endpoint: string;
    token: string;
    registeredAt?: string;
}
export declare class LocalProcessSupervisor implements ProcessSupervisor {
    private readonly clock;
    private readonly onSessionEnded;
    private readonly onProcessActionCompleted;
    private readonly childrenBySessionId;
    private readonly childrenByRunId;
    private readonly adapterControlsBySessionId;
    private readonly pendingTerminateBySessionId;
    constructor(options?: LocalProcessSupervisorOptions);
    registerAdapterControl(input: AdapterControlRegistration): void;
    handleSessionEnded(sessionId: string, end: {
        state: Extract<Session["state"], "completed" | "failed">;
        exitCode?: number;
        endReason?: string;
    }): void;
    startRetry(request: RetrySupervisorRequest): ProcessSupervisorResult;
    terminateGracefully(request: ProcessSupervisorRequest): ProcessSupervisorResult;
    close(): void;
    private requestAdapterGracefulStop;
    private rememberPendingTerminate;
    private failPendingTerminate;
    private adapterControlFailureFromPayload;
}
//# sourceMappingURL=local-process-supervisor.d.ts.map