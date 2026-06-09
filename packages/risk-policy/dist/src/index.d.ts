import type { Evidence, ISODateTimeString, NotchEvent, RiskLevel } from "@notch-ai-monitor/shared";
export interface CommandRiskContext {
    cwd?: string;
    origin?: string;
    source?: string;
}
export interface RiskAssessment {
    command: string;
    riskLevel: RiskLevel;
    isRisky: boolean;
    reasons: string[];
    affectedPaths: string[];
    impact: string;
    rollback: string;
    origin: string;
    matchedRules: string[];
}
export interface BuildRiskEventInput extends CommandRiskContext {
    command: string;
    sessionId: string;
    createdAt: ISODateTimeString;
    id?: string;
    updatedAt?: ISODateTimeString;
    commandHash?: string;
    assessment?: RiskAssessment;
}
export declare function stableCommandHash(command: string): string;
export declare function scanCommand(command: string, context?: CommandRiskContext): RiskAssessment;
export declare function commandLooksRisky(command: string, context?: CommandRiskContext): boolean;
export declare function riskAssessmentToEvidence(assessment: RiskAssessment): Evidence;
export declare function buildRiskEvent(input: BuildRiskEventInput): NotchEvent | undefined;
//# sourceMappingURL=index.d.ts.map