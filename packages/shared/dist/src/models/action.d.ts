import type { ActionStyle, SideEffect } from "./primitives.js";
export interface Action {
    id: string;
    label: string;
    style?: ActionStyle;
    resolves: boolean;
    requiresConfirm?: boolean;
    sideEffect: SideEffect;
    enabled: boolean;
    disabledReason?: string;
}
//# sourceMappingURL=action.d.ts.map