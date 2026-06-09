import type { Action, ActionRequestPayload, ActionResultPayload, EventStatus, EventHistoryRecord, EventTimelineEntry, EventType, ISODateTimeString, ManagerSnapshot, NotchEvent, PendingActionRecord, PendingActionVisibilityStatus, Session } from "@notch-ai-monitor/shared";
export type ManagerClock = () => ISODateTimeString;
export type ManagerSnapshotListener = (snapshot: ManagerSnapshot) => void;
export type LooseActionInput = Partial<Action> & {
    id: string;
    label?: string;
};
export type MockNotchEventInput = Partial<Omit<NotchEvent, "actions">> & Pick<NotchEvent, "sessionId" | "type"> & {
    actions?: LooseActionInput[];
};
export interface MockLocalAgentManagerOptions {
    sessions?: readonly Session[];
    events?: readonly MockNotchEventInput[];
    clock?: ManagerClock;
    pendingActionTimeoutMs?: number | null;
    processSideEffectMode?: ProcessSideEffectMode;
    processPersistence?: ProcessPersistenceStore;
    eventHistoryPersistence?: EventHistoryPersistenceStore;
    processOwnership?: readonly ProcessOwnershipInput[];
    retryLaunchProfiles?: readonly RetryLaunchProfileInput[];
    processSupervisor?: ProcessSupervisor;
}
export type ProcessSideEffectMode = "mock" | "supervised";
export type ProcessActionId = "retry" | "terminate";
export type ProcessCapability = "process.retry" | "process.terminate";
export type ProcessAuditSource = "desktop-ui" | "api" | "smoke";
export type RiskReplayMode = "required" | "approved";
export type RetryRiskReplayDecision = "passed" | "blocked" | "approved_skip";
export interface RetryRiskReplayRecord {
    requestId: string;
    eventId: string;
    sessionId: string;
    launchProfileHash: string;
    commandHash: string;
    decision: RetryRiskReplayDecision;
    replayedAt: ISODateTimeString;
    riskEventId?: string;
    riskLevel?: string;
    message: string;
}
export interface ProcessPersistenceSnapshot {
    processActionAudit: readonly ProcessActionAuditRecord[];
    processOwnership: readonly ProcessOwnershipRecord[];
    retryLaunchProfiles: readonly RetryLaunchProfileRecord[];
    retryRiskReplays: readonly RetryRiskReplayRecord[];
}
export interface ProcessPersistenceStore {
    load(): ProcessPersistenceSnapshot | null | undefined;
    save(snapshot: ProcessPersistenceSnapshot): void;
}
export interface EventHistoryPersistenceSnapshot {
    events: readonly EventHistoryRecord[];
    timeline: readonly EventTimelineEntry[];
    pendingActions: readonly PendingActionRecord[];
    cursorVersion: number;
}
export interface EventHistoryPersistenceStore {
    load(): EventHistoryPersistenceSnapshot | null | undefined;
    save(snapshot: EventHistoryPersistenceSnapshot): void;
}
export interface EventHistoryQuery {
    sessionId?: string;
    status?: EventStatus;
    type?: EventType;
    cursor?: string;
    limit?: number;
}
export interface ActionRequestsQuery {
    sessionId?: string;
    eventId?: string;
    status?: PendingActionVisibilityStatus;
    cursor?: string;
    limit?: number;
}
export interface EventHistoryPage {
    history: EventHistoryRecord[];
    timeline: EventTimelineEntry[];
    nextCursor: string | null;
}
export interface ActionRequestsPage {
    actions: PendingActionRecord[];
    nextCursor: string | null;
}
export interface RetryLaunchProfileInput {
    sessionId: string;
    adapterId: string;
    cwd: string;
    command: string;
    launchProfileHash: string;
    source?: string;
    executable?: string;
    commandHash?: string;
    args?: readonly string[];
    envAllowlist?: readonly string[];
    capabilities?: readonly ProcessCapability[];
    riskReplayMode?: RiskReplayMode;
    active?: boolean;
    retryAttemptActive?: boolean;
}
export interface RetryLaunchProfileRecord extends RetryLaunchProfileInput {
    owner: "notch-manager";
    commandHash: string;
    active: boolean;
    retryAttemptActive: boolean;
    riskReplayMode: RiskReplayMode;
    capabilities: readonly ProcessCapability[];
}
export interface ProcessOwnershipInput {
    sessionId: string;
    runId: string;
    adapterId: string;
    cwd: string;
    launchProfileHash: string;
    supervisorTokenHash: string;
    pid?: number;
    processStartedAt?: ISODateTimeString;
    commandHash?: string;
    capabilities?: readonly ProcessCapability[];
    active?: boolean;
}
export interface ProcessOwnershipRecord extends ProcessOwnershipInput {
    sourceMode: "live";
    owner: "notch-manager";
    capabilities: readonly ProcessCapability[];
    active: boolean;
}
export interface ProcessActionAuditRecord {
    requestId: string;
    eventId: string;
    actionId: ProcessActionId;
    sessionId: string;
    source: ProcessAuditSource;
    requestedAt: ISODateTimeString;
    confirmedAt?: ISODateTimeString;
    decision: "accepted" | "completed" | "failed" | "rejected" | "needs_confirmation";
    reason?: string;
    process?: {
        runId: string;
        pid?: number;
        processStartedAt?: ISODateTimeString;
        cwd: string;
        launchProfileHash: string;
        supervisorTokenHash: string;
    };
    launchProfile?: {
        adapterId: string;
        cwd: string;
        launchProfileHash: string;
        commandHash: string;
        riskReplayMode: RiskReplayMode;
    };
    resultMessage: string;
    errorCode?: string;
}
export type ProcessActionCompletionStatus = Extract<ProcessSupervisorStatus, "completed" | "failed">;
export interface ProcessActionCompletionInput {
    requestId?: string;
    eventId?: string;
    sessionId: string;
    actionId: ProcessActionId;
    status: ProcessActionCompletionStatus;
    message: string;
    completedAt?: ISODateTimeString;
    target?: string;
    resolution?: string;
    reason?: string;
    errorCode?: string;
}
export interface PendingActionHeartbeatInput {
    requestId: string;
    at?: ISODateTimeString;
    timeoutMs?: number;
    message?: string;
}
export interface PendingActionExpirationInput {
    at?: ISODateTimeString;
}
export type ProcessSupervisorStatus = "accepted" | "completed" | "failed";
export interface ProcessSupervisorResult {
    status: ProcessSupervisorStatus;
    message: string;
    target?: string;
    session?: Session;
    processOwnership?: ProcessOwnershipInput;
    retryLaunchProfile?: RetryLaunchProfileInput;
    endSession?: {
        state: Extract<Session["state"], "completed" | "failed">;
        exitCode?: number;
        endReason?: string;
    };
    error?: {
        code: string;
        message: string;
    };
}
export interface RetrySupervisorRequest {
    requestId: string;
    event: NotchEvent;
    session: Session;
    launchProfile: RetryLaunchProfileRecord;
    actionId: "retry";
    input?: Record<string, unknown>;
    requestedAt: ISODateTimeString;
}
export interface ProcessSupervisorRequest {
    requestId: string;
    event: NotchEvent;
    session: Session;
    ownership: ProcessOwnershipRecord;
    actionId: ProcessActionId;
    confirmed: true;
    input?: Record<string, unknown>;
    requestedAt: ISODateTimeString;
}
export interface ProcessSupervisor {
    startRetry?(request: RetrySupervisorRequest): ProcessSupervisorResult;
    terminateGracefully(request: ProcessSupervisorRequest): ProcessSupervisorResult;
}
export declare const DEFAULT_PENDING_ACTION_TIMEOUT_MS: number;
export declare const DEFAULT_ACTIONS_BY_EVENT_TYPE: {
    risk: ({
        id: string;
        label: string;
        style: "danger";
        resolves: true;
        sideEffect: "process";
        enabled: true;
        requiresConfirm?: never;
    } | {
        id: string;
        label: string;
        style: "primary";
        resolves: true;
        requiresConfirm: true;
        sideEffect: "process";
        enabled: true;
    } | {
        id: string;
        label: string;
        style: "secondary";
        resolves: false;
        sideEffect: "navigation";
        enabled: true;
        requiresConfirm?: never;
    } | {
        id: string;
        label: string;
        style: "secondary";
        resolves: false;
        sideEffect: "clipboard";
        enabled: true;
        requiresConfirm?: never;
    })[];
    confirm: ({
        id: string;
        label: string;
        style: "primary";
        resolves: true;
        sideEffect: "process";
        enabled: true;
    } | {
        id: string;
        label: string;
        style: "secondary";
        resolves: true;
        sideEffect: "process";
        enabled: true;
    } | {
        id: string;
        label: string;
        style: "secondary";
        resolves: false;
        sideEffect: "navigation";
        enabled: true;
    } | {
        id: string;
        label: string;
        style: "secondary";
        resolves: false;
        sideEffect: "clipboard";
        enabled: true;
    })[];
    result: ({
        id: string;
        label: string;
        style: "primary";
        resolves: true;
        sideEffect: "navigation";
        enabled: true;
    } | {
        id: string;
        label: string;
        style: "secondary";
        resolves: true;
        sideEffect: "none";
        enabled: true;
    } | {
        id: string;
        label: string;
        style: "secondary";
        resolves: false;
        sideEffect: "clipboard";
        enabled: true;
    } | {
        id: string;
        label: string;
        style: "secondary";
        resolves: false;
        sideEffect: "navigation";
        enabled: true;
    })[];
    error: ({
        id: string;
        label: string;
        style: "primary";
        resolves: true;
        sideEffect: "process";
        enabled: true;
        requiresConfirm?: never;
    } | {
        id: string;
        label: string;
        style: "secondary";
        resolves: false;
        sideEffect: "navigation";
        enabled: true;
        requiresConfirm?: never;
    } | {
        id: string;
        label: string;
        style: "danger";
        resolves: true;
        requiresConfirm: true;
        sideEffect: "process";
        enabled: true;
    } | {
        id: string;
        label: string;
        style: "secondary";
        resolves: true;
        sideEffect: "none";
        enabled: true;
        requiresConfirm?: never;
    })[];
};
export declare function stableCommandHash(command: string): string;
export declare class MockLocalAgentManager {
    private readonly clock;
    private readonly processSideEffectMode;
    private readonly processPersistence;
    private readonly eventHistoryPersistence;
    private readonly processSupervisor;
    private readonly pendingActionTimeoutMs;
    private readonly listeners;
    private readonly processOwnership;
    private readonly retryLaunchProfiles;
    private readonly processActionResults;
    private readonly processActionAudit;
    private readonly retryRiskReplays;
    private readonly eventHistory;
    private readonly eventTimeline;
    private readonly pendingActions;
    private sessions;
    private events;
    private generatedEventCount;
    private eventHistoryCursorVersion;
    constructor(options?: MockLocalAgentManagerOptions);
    registerProcessOwnership(input: ProcessOwnershipInput): ProcessOwnershipRecord;
    getProcessOwnership(sessionId: string): ProcessOwnershipRecord | null;
    registerRetryLaunchProfile(input: RetryLaunchProfileInput): RetryLaunchProfileRecord;
    getRetryLaunchProfile(sessionId: string): RetryLaunchProfileRecord | null;
    getProcessActionAuditRecords(): ProcessActionAuditRecord[];
    getRetryRiskReplayRecords(): RetryRiskReplayRecord[];
    getEventHistory(query?: EventHistoryQuery): EventHistoryPage;
    getPendingActions(query?: ActionRequestsQuery): ActionRequestsPage;
    heartbeatPendingAction(input: PendingActionHeartbeatInput): PendingActionRecord | null;
    expirePendingActions(input?: PendingActionExpirationInput): PendingActionRecord[];
    completeAcceptedProcessAction(input: ProcessActionCompletionInput): ActionResultPayload | null;
    upsertSession(session: Session): Session;
    endSession(sessionId: string, state: Extract<Session["state"], "completed" | "failed">, metadata?: {
        exitCode?: number;
        endReason?: string;
    }): Session | null;
    ingestEvent(event: MockNotchEventInput): NotchEvent;
    injectScenario(scenario: "idle" | "waiting" | "result" | "error" | "risk" | "all"): ManagerSnapshot;
    reset(): ManagerSnapshot;
    private hydrateProcessPersistence;
    private hydrateEventHistoryPersistence;
    private processPersistenceSnapshot;
    private persistProcessState;
    private eventHistoryPersistenceSnapshot;
    private persistEventHistoryState;
    private historySummary;
    private nextTimelineId;
    private upsertEventHistoryRecord;
    private appendTimelineEntry;
    private recordEventProjection;
    private rebuildEventHistoryFromCurrentEvents;
    private updateHistoryLatestAction;
    private recordPendingActionResult;
    private removeSupersededWaitingConfirmation;
    private rememberProcessActionResult;
    private finalizeActionResult;
    private recordProcessActionAudit;
    private recordRetryRiskReplay;
    private confirmationRequiredProcessResult;
    private validateRetryLaunchProfile;
    private replayRetryRiskPolicy;
    private requestSupervisedRetry;
    private validateTerminateOwnership;
    private requestSupervisedTerminate;
    requestAction(payload: ActionRequestPayload): ActionResultPayload;
    getSnapshot(): ManagerSnapshot;
    subscribe(listener: ManagerSnapshotListener): () => void;
    private normalizeEvent;
    private emitSnapshot;
}
export declare function createMockLocalAgentManager(options?: MockLocalAgentManagerOptions): MockLocalAgentManager;
//# sourceMappingURL=mock-local-agent-manager.d.ts.map