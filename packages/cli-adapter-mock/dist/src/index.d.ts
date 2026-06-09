import type { NotchEvent, ProtocolEnvelope, ProtocolSource, Session } from "@notch-ai-monitor/shared";
export declare const DEFAULT_LOCAL_MANAGER_URL = "http://127.0.0.1:4317";
export declare const DANGEROUS_CONFIRM_COMMAND = "rm -rf ~/Documents/xhs-drafts/* && git clean -fd";
export type MockCliScenario = "session" | "confirm" | "risky-confirm" | "risk" | "result" | "error" | "all";
export type MockEventInput = Partial<Omit<NotchEvent, "actions">> & Pick<NotchEvent, "id" | "sessionId" | "type" | "title" | "summary" | "source" | "createdAt"> & {
    actions?: NotchEvent["actions"];
};
export interface MockCliSenderOptions {
    baseUrl?: string;
    scenario?: MockCliScenario;
    sessionId?: string;
    now?: string;
}
export declare function createMockSession(options?: MockCliSenderOptions): Session;
export declare function createEnvelope<TEvent extends string, TPayload>(event: TEvent, payload: TPayload, source: ProtocolSource, now?: string): ProtocolEnvelope<TEvent, TPayload>;
export declare function createExampleEvent(type: Exclude<MockCliScenario, "session" | "all">, session: Session, now: string): MockEventInput;
export declare function createMockEnvelopeSequence(options?: MockCliSenderOptions): ProtocolEnvelope<string, unknown>[];
export declare function postEnvelope(baseUrl: string, envelope: ProtocolEnvelope<string, unknown>): Promise<unknown>;
export declare function runMockCliSender(argv?: string[]): Promise<void>;
//# sourceMappingURL=index.d.ts.map