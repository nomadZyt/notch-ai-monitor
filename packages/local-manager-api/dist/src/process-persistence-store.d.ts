import type { ProcessPersistenceSnapshot, ProcessPersistenceStore } from "@notch-ai-monitor/local-manager-mock";
export declare class JsonFileProcessPersistenceStore implements ProcessPersistenceStore {
    private readonly filePath;
    constructor(filePath: string);
    load(): ProcessPersistenceSnapshot | null;
    save(snapshot: ProcessPersistenceSnapshot): void;
}
//# sourceMappingURL=process-persistence-store.d.ts.map