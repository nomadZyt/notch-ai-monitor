import { type ChildProcess } from "node:child_process";
import type { EventType, NotchEvent, ProtocolEnvelope, ProtocolSource, Session, SessionState, SourceMode, ToolKind } from "@notch-ai-monitor/shared";
export declare const DEFAULT_LOCAL_MANAGER_URL = "http://127.0.0.1:4317";
export declare const DEFAULT_PROFILE_ID = "custom";
export type SourceProfileId = "codex-cli" | "claude-code-cli" | "qwen-cli" | "cursor-app" | "codex-app" | "custom";
export interface SourceProfile {
    id: SourceProfileId;
    tool: ToolKind;
    name: string;
    mark: string;
    source: string;
}
export interface SourceProfileOverrides {
    name?: string;
    mark?: string;
    source?: string;
}
export declare const SOURCE_PROFILES: Record<SourceProfileId, SourceProfile>;
export type RealAdapterMode = "scan" | "stdin" | "emit" | "wrapper";
export type RealEventInput = Partial<Omit<NotchEvent, "actions">> & Pick<NotchEvent, "id" | "sessionId" | "type" | "title" | "summary" | "source" | "createdAt"> & {
    actions?: NotchEvent["actions"];
};
export interface CreateSessionOptions {
    sessionId?: string;
    processId?: number;
    cwd?: string;
    project?: string;
    sourceMode?: SourceMode;
    state?: SessionState;
    now?: string;
}
export interface ParsedProcess {
    pid: number;
    command: string;
}
export interface DiscoveredProcess extends ParsedProcess {
    profileId: Exclude<SourceProfileId, "custom">;
    profile: SourceProfile;
}
export interface ParsedOutputEvent {
    type: Extract<EventType, "confirm" | "result" | "error">;
    command?: string;
    summary: string;
    evidenceReason?: string;
    logExcerpt?: string;
}
export type WrapperStdioMode = "capture" | "inherit";
export interface CreateEventOptions {
    now?: string;
    sequence?: number;
    title?: string;
    summary?: string;
    command?: string;
    message?: string;
}
export interface CliOptions extends SourceProfileOverrides {
    mode: RealAdapterMode;
    baseUrl: string;
    profileId: SourceProfileId;
    childArgs: string[];
    childCommand?: string;
    stdioMode?: WrapperStdioMode;
    sessionId?: string;
    cwd?: string;
    project?: string;
    processId?: number;
    sourceMode?: SourceMode;
    type?: EventType;
    command?: string;
    summary?: string;
    title?: string;
    message?: string;
}
export type ProcessRegistrationCapability = "process.retry" | "process.terminate";
export type ProcessRegistrationRiskReplayMode = "required" | "approved";
export interface ProcessRegistrationPayload {
    sessionId: string;
    runId: string;
    adapterId: string;
    cwd: string;
    command: string;
    executable: string;
    launchProfileHash: string;
    supervisorTokenHash: string;
    commandHash: string;
    capabilities: readonly ProcessRegistrationCapability[];
    riskReplayMode: ProcessRegistrationRiskReplayMode;
    pid?: number;
    processStartedAt?: string;
    source?: string;
    args?: readonly string[];
    controlEndpoint?: string;
    controlToken?: string;
}
export interface CreateProcessRegistrationOptions {
    session: Session;
    profile: SourceProfile;
    childCommand: string;
    childArgs: readonly string[];
    cwd: string;
    childProcessId?: number;
    now?: string;
    controlEndpoint?: string;
    controlToken?: string;
}
export interface WrapperControlServer {
    endpoint: string;
    token: string;
    setExpectedRegistration(input: {
        runId: string;
        launchProfileHash: string;
    }): void;
    close(): Promise<void>;
}
export declare function formatLaunchCommand(command: string, args?: readonly string[]): string;
export declare function createProcessRegistrationPayload(options: CreateProcessRegistrationOptions): ProcessRegistrationPayload;
export declare function resolveSourceProfile(profileId?: SourceProfileId, overrides?: SourceProfileOverrides): SourceProfile;
export declare function createSession(profile: SourceProfile, options?: CreateSessionOptions): Session;
export declare function createEnvelope<TEvent extends string, TPayload>(event: TEvent, payload: TPayload, source: ProtocolSource, now?: string): ProtocolEnvelope<TEvent, TPayload>;
export declare function createSessionUpsertEnvelope(session: Session, profile: SourceProfile, now?: string): ProtocolEnvelope<"notch.session.upserted", {
    session: Session;
}>;
export declare function createEventCreatedEnvelope(event: RealEventInput, session: Session, profile: SourceProfile, now?: string): ProtocolEnvelope<"notch.event.created", {
    event: RealEventInput;
}>;
export declare function createSessionEndedEnvelope(session: Session, profile: SourceProfile, exitCode: number | null, signal: NodeJS.Signals | null, now?: string): ProtocolEnvelope<"notch.session.ended", {
    sessionId: string;
    state: Extract<SessionState, "completed" | "failed">;
    exitCode?: number;
    reason?: string;
}>;
export declare function createEventFromType(type: EventType, session: Session, profile: SourceProfile, options?: CreateEventOptions): RealEventInput;
export declare function extractCommandFromLine(line: string): string;
export declare function classifyOutputLine(line: string): ParsedOutputEvent | null;
export declare function classifyOutputLineForProfile(line: string, profileOrId: SourceProfile | SourceProfileId): ParsedOutputEvent | null;
export declare function createEventFromLine(line: string, session: Session, profile: SourceProfile, options?: Pick<CreateEventOptions, "now" | "sequence">): RealEventInput | null;
export declare function parsePsLine(line: string): ParsedProcess | null;
export declare function detectProfileIdFromCommand(command: string): Exclude<SourceProfileId, "custom"> | null;
export declare function parsePsOutput(output: string): DiscoveredProcess[];
export declare function scanRunningProcesses(): Promise<DiscoveredProcess[]>;
export declare function postEnvelope(baseUrl: string, envelope: ProtocolEnvelope<string, unknown>): Promise<unknown>;
export declare function postProcessRegistration(baseUrl: string, registration: ProcessRegistrationPayload): Promise<unknown>;
export declare function createWrapperControlServer(input: {
    sessionId: string;
    child: ChildProcess;
}): Promise<WrapperControlServer>;
export declare function sendEnvelopeSequence(baseUrl: string, envelopes: Array<ProtocolEnvelope<string, unknown>>): Promise<unknown[]>;
export declare function parseCliArgs(argv: string[]): CliOptions;
export declare function runRealCliAdapter(argv?: string[]): Promise<void>;
export declare function runNotchRun(argv?: string[]): Promise<void>;
//# sourceMappingURL=index.d.ts.map