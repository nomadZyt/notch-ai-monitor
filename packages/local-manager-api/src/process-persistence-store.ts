import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import type {
  ProcessPersistenceSnapshot,
  ProcessPersistenceStore,
} from "@notch-ai-monitor/local-manager-mock";

interface PersistedProcessStateFile {
  schemaVersion: 1;
  processState: ProcessPersistenceSnapshot;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function snapshotFromUnknown(value: unknown): ProcessPersistenceSnapshot {
  const root = isRecord(value) && isRecord(value.processState) ? value.processState : value;
  const record = isRecord(root) ? root : {};
  return {
    processActionAudit: Array.isArray(record.processActionAudit) ? record.processActionAudit : [],
    processOwnership: Array.isArray(record.processOwnership) ? record.processOwnership : [],
    retryLaunchProfiles: Array.isArray(record.retryLaunchProfiles) ? record.retryLaunchProfiles : [],
    retryRiskReplays: Array.isArray(record.retryRiskReplays) ? record.retryRiskReplays : [],
  } as ProcessPersistenceSnapshot;
}

export class JsonFileProcessPersistenceStore implements ProcessPersistenceStore {
  constructor(private readonly filePath: string) {}

  load(): ProcessPersistenceSnapshot | null {
    if (!existsSync(this.filePath)) return null;
    const raw = readFileSync(this.filePath, "utf8");
    if (raw.trim().length === 0) return null;
    return snapshotFromUnknown(JSON.parse(raw) as unknown);
  }

  save(snapshot: ProcessPersistenceSnapshot): void {
    const body: PersistedProcessStateFile = {
      schemaVersion: 1,
      processState: snapshot,
    };
    mkdirSync(dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.tmp`;
    writeFileSync(tempPath, `${JSON.stringify(body, null, 2)}\n`, "utf8");
    renameSync(tempPath, this.filePath);
  }
}
