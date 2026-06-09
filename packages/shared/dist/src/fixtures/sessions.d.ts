export declare const fixtureSessions: ({
    id: string;
    tool: "qwen";
    name: string;
    mark: string;
    source: string;
    sourceMode: "fixture";
    project: string;
    cwd: string;
    processId: number;
    state: "waiting";
    since: string;
    lastActiveAt: string;
    muted: false;
} | {
    id: string;
    tool: "claude";
    name: string;
    mark: string;
    source: string;
    sourceMode: "fixture";
    project: string;
    cwd: string;
    processId: number;
    state: "running";
    since: string;
    lastActiveAt: string;
    muted: false;
} | {
    id: string;
    tool: "codex";
    name: string;
    mark: string;
    source: string;
    sourceMode: "fixture";
    project: string;
    cwd: string;
    processId: number;
    state: "running";
    since: string;
    lastActiveAt: string;
    muted: false;
})[];
//# sourceMappingURL=sessions.d.ts.map