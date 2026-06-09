import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function snapshotFromUnknown(value) {
    const root = isRecord(value) && isRecord(value.processState) ? value.processState : value;
    const record = isRecord(root) ? root : {};
    return {
        processActionAudit: Array.isArray(record.processActionAudit) ? record.processActionAudit : [],
        processOwnership: Array.isArray(record.processOwnership) ? record.processOwnership : [],
        retryLaunchProfiles: Array.isArray(record.retryLaunchProfiles) ? record.retryLaunchProfiles : [],
        retryRiskReplays: Array.isArray(record.retryRiskReplays) ? record.retryRiskReplays : [],
    };
}
export class JsonFileProcessPersistenceStore {
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
            processState: snapshot,
        };
        mkdirSync(dirname(this.filePath), { recursive: true });
        const tempPath = `${this.filePath}.tmp`;
        writeFileSync(tempPath, `${JSON.stringify(body, null, 2)}\n`, "utf8");
        renameSync(tempPath, this.filePath);
    }
}
