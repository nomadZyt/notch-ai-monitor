export declare const riskEventFixture: {
    id: string;
    sessionId: string;
    type: "risk";
    priority: number;
    status: "active";
    title: string;
    summary: string;
    command: string;
    commandHash: string;
    source: string;
    createdAt: string;
    updatedAt: string;
    evidence: {
        reason: string;
        impact: string;
        origin: string;
        rollback: string;
        affectedPaths: string[];
        riskLevel: "high";
    };
    reasons: string[];
    actions: ({
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
};
export declare const confirmEventFixture: {
    id: string;
    sessionId: string;
    type: "confirm";
    priority: number;
    status: "active";
    title: string;
    summary: string;
    command: string;
    commandHash: string;
    source: string;
    createdAt: string;
    updatedAt: string;
    evidence: {
        reason: string;
        impact: string;
        origin: string;
        rollback: string;
        affectedPaths: string[];
    };
    actions: ({
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
};
export declare const resultEventFixture: {
    id: string;
    sessionId: string;
    type: "result";
    priority: number;
    status: "active";
    title: string;
    summary: string;
    command: string;
    commandHash: string;
    source: string;
    createdAt: string;
    updatedAt: string;
    evidence: {
        reason: string;
        impact: string;
        origin: string;
        rollback: string;
    };
    actions: ({
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
        resolves: false;
        sideEffect: "clipboard";
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
        sideEffect: "navigation";
        enabled: true;
    })[];
};
export declare const errorEventFixture: {
    id: string;
    sessionId: string;
    type: "error";
    priority: number;
    status: "active";
    title: string;
    summary: string;
    command: string;
    commandHash: string;
    source: string;
    createdAt: string;
    updatedAt: string;
    evidence: {
        reason: string;
        impact: string;
        origin: string;
        rollback: string;
        logExcerpt: string;
    };
    occurrenceCount: number;
    errorKey: string;
    actions: ({
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
export declare const allEventsFixture: ({
    id: string;
    sessionId: string;
    type: "risk";
    priority: number;
    status: "active";
    title: string;
    summary: string;
    command: string;
    commandHash: string;
    source: string;
    createdAt: string;
    updatedAt: string;
    evidence: {
        reason: string;
        impact: string;
        origin: string;
        rollback: string;
        affectedPaths: string[];
        riskLevel: "high";
    };
    reasons: string[];
    actions: ({
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
} | {
    id: string;
    sessionId: string;
    type: "confirm";
    priority: number;
    status: "active";
    title: string;
    summary: string;
    command: string;
    commandHash: string;
    source: string;
    createdAt: string;
    updatedAt: string;
    evidence: {
        reason: string;
        impact: string;
        origin: string;
        rollback: string;
        affectedPaths: string[];
    };
    actions: ({
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
} | {
    id: string;
    sessionId: string;
    type: "result";
    priority: number;
    status: "active";
    title: string;
    summary: string;
    command: string;
    commandHash: string;
    source: string;
    createdAt: string;
    updatedAt: string;
    evidence: {
        reason: string;
        impact: string;
        origin: string;
        rollback: string;
    };
    actions: ({
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
        resolves: false;
        sideEffect: "clipboard";
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
        sideEffect: "navigation";
        enabled: true;
    })[];
} | {
    id: string;
    sessionId: string;
    type: "error";
    priority: number;
    status: "active";
    title: string;
    summary: string;
    command: string;
    commandHash: string;
    source: string;
    createdAt: string;
    updatedAt: string;
    evidence: {
        reason: string;
        impact: string;
        origin: string;
        rollback: string;
        logExcerpt: string;
    };
    occurrenceCount: number;
    errorKey: string;
    actions: ({
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
})[];
export declare const duplicateResultEventFixture: {
    id: string;
    createdAt: string;
    updatedAt: string;
    summary: string;
    sessionId: string;
    type: "result";
    priority: number;
    status: "active";
    title: string;
    command: string;
    commandHash: string;
    source: string;
    evidence: {
        reason: string;
        impact: string;
        origin: string;
        rollback: string;
    };
    actions: ({
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
        resolves: false;
        sideEffect: "clipboard";
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
        sideEffect: "navigation";
        enabled: true;
    })[];
};
export declare const duplicateConfirmEventFixture: {
    id: string;
    createdAt: string;
    updatedAt: string;
    summary: string;
    sessionId: string;
    type: "confirm";
    priority: number;
    status: "active";
    title: string;
    command: string;
    commandHash: string;
    source: string;
    evidence: {
        reason: string;
        impact: string;
        origin: string;
        rollback: string;
        affectedPaths: string[];
    };
    actions: ({
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
};
export declare const duplicateErrorEventFixture: {
    id: string;
    createdAt: string;
    updatedAt: string;
    summary: string;
    sessionId: string;
    type: "error";
    priority: number;
    status: "active";
    title: string;
    command: string;
    commandHash: string;
    source: string;
    evidence: {
        reason: string;
        impact: string;
        origin: string;
        rollback: string;
        logExcerpt: string;
    };
    occurrenceCount: number;
    errorKey: string;
    actions: ({
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
//# sourceMappingURL=events.d.ts.map