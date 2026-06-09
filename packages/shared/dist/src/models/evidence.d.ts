import type { RiskLevel } from "./primitives.js";
export interface Evidence {
    reason: string;
    impact?: string;
    origin: string;
    rollback?: string;
    affectedPaths?: string[];
    riskLevel?: RiskLevel;
    logExcerpt?: string;
}
//# sourceMappingURL=evidence.d.ts.map