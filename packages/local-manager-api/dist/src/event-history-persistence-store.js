import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function snapshotFromUnknown(value) {
    const root = isRecord(value) && isRecord(value.eventHistory) ? value.eventHistory : value;
    const record = isRecord(root) ? root : {};
    const cursorVersion = typeof record.cursorVersion === "number" && Number.isFinite(record.cursorVersion)
        ? Math.max(0, Math.trunc(record.cursorVersion))
        : 0;
    return {
        events: Array.isArray(record.events) ? record.events : [],
        timeline: Array.isArray(record.timeline) ? record.timeline : [],
        pendingActions: Array.isArray(record.pendingActions) ? record.pendingActions : [],
        cursorVersion,
    };
}
export class JsonFileEventHistoryPersistenceStore {
    filePath;
    constructor(filePath) {
        this.filePath = filePath;
    }
    load() {
        if (!existsSync(this.filePath))
            return null;
        const raw = readFileSync(this.filePath, "utf8");
        if (raw.trim().length === 0)
            return null;
        return snapshotFromUnknown(JSON.parse(raw));
    }
    save(snapshot) {
        const body = {
            schemaVersion: 1,
            eventHistory: snapshot,
        };
        mkdirSync(dirname(this.filePath), { recursive: true });
        const tempPath = `${this.filePath}.tmp`;
        writeFileSync(tempPath, `${JSON.stringify(body, null, 2)}\n`, "utf8");
        renameSync(tempPath, this.filePath);
    }
}
