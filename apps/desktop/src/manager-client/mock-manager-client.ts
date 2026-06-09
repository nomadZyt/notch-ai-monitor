import {
  createMockLocalAgentManager,
  type MockLocalAgentManager,
} from "@notch-ai-monitor/local-manager-mock";
import type {
  ActionRequestPayload,
  ActionRequestsResponse,
  ActionResultPayload,
  DebugScenario,
  ManagerSnapshot,
  PaginatedEventHistoryResponse,
} from "@notch-ai-monitor/shared";
import type { DesktopManagerClient, ManagerSnapshotListener } from "./types";

export class MockManagerClient implements DesktopManagerClient {
  constructor(private readonly manager: MockLocalAgentManager = createMockLocalAgentManager()) {}

  getSnapshot(): ManagerSnapshot {
    return this.manager.getSnapshot();
  }

  subscribe(listener: ManagerSnapshotListener): () => void {
    return this.manager.subscribe(listener);
  }

  async requestAction(payload: ActionRequestPayload): Promise<ActionResultPayload> {
    return this.manager.requestAction(payload);
  }

  async getEventHistory(
    query: Parameters<NonNullable<DesktopManagerClient["getEventHistory"]>>[0] = {}
  ): Promise<PaginatedEventHistoryResponse> {
    const page = this.manager.getEventHistory(query);
    return {
      ok: true,
      history: page.history,
      timeline: page.timeline,
      nextCursor: page.nextCursor,
      snapshot: this.manager.getSnapshot(),
    };
  }

  async getActionRequests(
    query: Parameters<NonNullable<DesktopManagerClient["getActionRequests"]>>[0] = {}
  ): Promise<ActionRequestsResponse> {
    const page = this.manager.getPendingActions(query);
    return {
      ok: true,
      actions: page.actions,
      nextCursor: page.nextCursor,
      snapshot: this.manager.getSnapshot(),
    };
  }

  async injectScenario(scenario: DebugScenario): Promise<ManagerSnapshot> {
    return this.manager.injectScenario(scenario);
  }

  async resetSnapshot(): Promise<ManagerSnapshot> {
    return this.manager.reset();
  }
}

export function createMockManagerClient(): MockManagerClient {
  return new MockManagerClient();
}
