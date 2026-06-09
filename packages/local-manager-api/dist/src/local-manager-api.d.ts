import { type Server } from "node:http";
import { type MockLocalAgentManager, type ProcessSideEffectMode, type ProcessSupervisor } from "@notch-ai-monitor/local-manager-mock";
import type { ManagerSnapshot, PendingActionRecord } from "@notch-ai-monitor/shared";
export interface LocalManagerApiOptions {
    manager?: MockLocalAgentManager;
    clock?: () => string;
    logger?: LocalManagerApiLogger;
    serviceName?: string;
    processPersistenceFile?: string;
    eventHistoryPersistenceFile?: string;
    pendingActionTimeoutMs?: number | null;
    pendingActionSweepIntervalMs?: number | null;
    processSideEffectMode?: ProcessSideEffectMode;
    processSupervisor?: ProcessSupervisor;
}
export interface LocalManagerApiListenResult {
    host: string;
    port: number;
    url: string;
}
export interface LocalManagerApiLogger {
    info(message: string, details?: Record<string, unknown>): void;
    warn(message: string, details?: Record<string, unknown>): void;
    error(message: string, details?: Record<string, unknown>): void;
}
export interface EnvelopeIngestionResponse {
    ok: true;
    event: string;
    result?: unknown;
    snapshot: ManagerSnapshot;
}
export interface JsonErrorResponse {
    ok: false;
    error: {
        code: string;
        message: string;
        details?: unknown;
    };
}
export interface DebugExpirePendingActionsResponse {
    ok: true;
    event: "notch.debug.pending-actions.expired";
    expiredActions: PendingActionRecord[];
    snapshot: ManagerSnapshot;
}
export declare class LocalManagerApiServer {
    readonly manager: MockLocalAgentManager;
    readonly server: Server;
    private readonly clock;
    private readonly logger;
    private readonly serviceName;
    private readonly pendingActionSweepIntervalMs;
    private readonly processSupervisor;
    private readonly unsubscribeManager;
    private readonly sseClients;
    private pendingActionSweepTimer;
    private messageCount;
    private listening;
    constructor(options?: LocalManagerApiOptions);
    listen(port?: number, host?: string): Promise<LocalManagerApiListenResult>;
    close(): Promise<void>;
    private startPendingActionSweepScheduler;
    private stopPendingActionSweepScheduler;
    private runPendingActionSweep;
    private handle;
    private logRequestFailure;
    private eventHistoryResponse;
    private actionRequestsResponse;
    private expirePendingActionsResponse;
    private ingestEnvelope;
    private completeSessionEnd;
    private registerProcess;
    private ok;
    private createEnvelope;
    private openSse;
    private broadcastSnapshot;
    private writeError;
}
export declare function createLocalManagerApi(options?: LocalManagerApiOptions): LocalManagerApiServer;
//# sourceMappingURL=local-manager-api.d.ts.map