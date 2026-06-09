import type { EventStatus, EventType, ManagerSnapshot, PanelState, ShellState } from "@notch-ai-monitor/shared";
import { selectedEventFromSnapshot } from "./selectors";

export interface PendingConfirmation {
  eventId: string;
  actionId: string;
}

export type SessionHubFilter = "all" | "attention" | "active" | "ended";
export type SessionHubSort = "attention" | "recent" | "name";
export type HistoryStatusFilter = "all" | EventStatus;
export type HistoryTypeFilter = "all" | EventType;

export interface UIState {
  selectedEventId: string | null;
  selectedSessionId: string | null;
  shellState: ShellState;
  panel: PanelState;
  autoState: boolean;
  demoOpen: boolean;
  pendingConfirmation: PendingConfirmation | null;
  sessionHubFilter: SessionHubFilter;
  sessionHubSort: SessionHubSort;
  historyStatusFilter: HistoryStatusFilter;
  historyTypeFilter: HistoryTypeFilter;
  historyCursor: string | null;
  historyCursorStack: Array<string | null>;
}

export class UIStore {
  private state: UIState = {
    selectedEventId: null,
    selectedSessionId: null,
    shellState: "dormant",
    panel: "none",
    autoState: true,
    demoOpen: false,
    pendingConfirmation: null,
    sessionHubFilter: "all",
    sessionHubSort: "attention",
    historyStatusFilter: "all",
    historyTypeFilter: "all",
    historyCursor: null,
    historyCursorStack: [],
  };

  get value(): UIState {
    return { ...this.state };
  }

  reconcileSnapshot(snapshot: ManagerSnapshot): void {
    const selectedEvent = selectedEventFromSnapshot(snapshot, this.state.selectedEventId);
    const selectedSessionExists = snapshot.sessions.some((session) => session.id === this.state.selectedSessionId);

    this.state.selectedEventId = selectedEvent?.id ?? null;
    const nextSelectedSessionId =
      selectedEvent?.sessionId ??
      (selectedSessionExists ? this.state.selectedSessionId : snapshot.sessions[0]?.id ?? null);
    if (nextSelectedSessionId !== this.state.selectedSessionId) this.resetHistoryPagination();
    this.state.selectedSessionId = nextSelectedSessionId;

    if (!selectedEvent && this.state.panel === "action") {
      this.state.panel = "none";
      this.state.autoState = true;
    }

    if (this.state.panel !== "none") {
      this.state.shellState = "expanded";
      return;
    }

    if (this.state.autoState || !selectedEvent) {
      this.state.shellState = snapshot.viewHints.restingState;
    }
  }

  resetInteraction(): void {
    this.state.panel = "none";
    this.state.autoState = true;
    this.state.pendingConfirmation = null;
  }

  openPanel(panel: Exclude<PanelState, "none">): void {
    this.state.panel = panel;
    this.state.shellState = "expanded";
    this.state.autoState = false;
  }

  collapse(snapshot: ManagerSnapshot): void {
    this.state.panel = "none";
    this.state.autoState = true;
    this.state.shellState = snapshot.viewHints.restingState;
  }

  setShellState(shellState: ShellState, options: { manual?: boolean } = {}): void {
    this.state.shellState = shellState;
    if (options.manual) this.state.autoState = false;
  }

  settleToSnapshot(snapshot: ManagerSnapshot): void {
    if (this.state.panel !== "none" || !this.state.autoState) return;
    this.state.shellState = snapshot.viewHints.restingState;
  }

  selectEvent(eventId: string | null, sessionId: string | null): void {
    this.state.selectedEventId = eventId;
    if (sessionId && sessionId !== this.state.selectedSessionId) {
      this.resetHistoryPagination();
      this.state.selectedSessionId = sessionId;
    }
    this.state.pendingConfirmation = null;
  }

  selectSession(sessionId: string): void {
    if (sessionId !== this.state.selectedSessionId) this.resetHistoryPagination();
    this.state.selectedSessionId = sessionId;
  }

  setDemoOpen(open: boolean): void {
    this.state.demoOpen = open;
  }

  setPendingConfirmation(pending: PendingConfirmation | null): void {
    this.state.pendingConfirmation = pending;
  }

  setSessionHubFilter(filter: SessionHubFilter): void {
    this.state.sessionHubFilter = filter;
    this.resetHistoryPagination();
  }

  setSessionHubSort(sort: SessionHubSort): void {
    this.state.sessionHubSort = sort;
  }

  setHistoryStatusFilter(filter: HistoryStatusFilter): void {
    this.state.historyStatusFilter = filter;
    this.resetHistoryPagination();
  }

  setHistoryTypeFilter(filter: HistoryTypeFilter): void {
    this.state.historyTypeFilter = filter;
    this.resetHistoryPagination();
  }

  goToNextHistoryPage(nextCursor: string): void {
    this.state.historyCursorStack = [...this.state.historyCursorStack, this.state.historyCursor];
    this.state.historyCursor = nextCursor;
  }

  goToPreviousHistoryPage(): void {
    if (this.state.historyCursorStack.length === 0) return;
    const stack = [...this.state.historyCursorStack];
    const previousCursor = stack.pop() ?? null;
    this.state.historyCursorStack = stack;
    this.state.historyCursor = previousCursor;
  }

  resetHistoryPagination(): void {
    this.state.historyCursor = null;
    this.state.historyCursorStack = [];
  }
}
