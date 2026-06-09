import type { EventHistoryPersistenceSnapshot, EventHistoryPersistenceStore } from "@notch-ai-monitor/local-manager-mock";
export declare class JsonFileEventHistoryPersistenceStore implements EventHistoryPersistenceStore {
    private readonly filePath;
    constructor(filePath: string);
    load(): EventHistoryPersistenceSnapshot | null;
    save(snapshot: EventHistoryPersistenceSnapshot): void;
}
//# sourceMappingURL=event-history-persistence-store.d.ts.map