import type { ISODateTimeString, SessionState, SourceMode, ToolKind } from "./primitives.js";

export interface Session {
  id: string;
  tool: ToolKind;
  name: string;
  mark: string;
  source: string;
  sourceMode?: SourceMode;
  project?: string;
  cwd?: string;
  processId?: number;
  windowId?: string;
  tabId?: string;
  state: SessionState;
  since: ISODateTimeString;
  lastActiveAt?: ISODateTimeString;
  exitCode?: number;
  endReason?: string;
  muted: boolean;
}
