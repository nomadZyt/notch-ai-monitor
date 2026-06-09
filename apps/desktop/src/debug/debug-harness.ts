import type { ManagerSnapshot } from "@notch-ai-monitor/shared";
import type { DesktopManagerClient } from "../manager-client";
import type { DebugScenario } from "../state/selectors";

export class DebugHarness {
  constructor(private readonly manager: DesktopManagerClient) {}

  injectScenario(scenario: DebugScenario): Promise<ManagerSnapshot> {
    return this.manager.injectScenario(scenario);
  }
}
