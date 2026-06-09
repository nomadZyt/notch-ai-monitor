import { NotchDesktopApp } from "./app-shell";
import {
  DEFAULT_LOCAL_MANAGER_API_URL,
  LocalManagerApiClient,
  createMockManagerClient,
  managerClientErrorMessage,
  type DesktopManagerClient,
} from "../manager-client";

type ManagerMode = "api" | "mock";

interface BootstrapConfig {
  mode: ManagerMode;
  managerUrl: string;
}

function viteEnv(): Record<string, string | boolean | undefined> {
  return (
    (import.meta as ImportMeta & {
      env?: Record<string, string | boolean | undefined>;
    }).env ?? {}
  );
}

function readBootstrapConfig(): BootstrapConfig {
  const params = new URL(window.location.href).searchParams;
  const env = viteEnv();
  const managerParam = String(params.get("manager") ?? env.VITE_NOTCH_MANAGER ?? "api");
  const mode: ManagerMode = managerParam === "mock" ? "mock" : "api";
  const managerUrl = String(
    params.get("managerUrl") ?? env.VITE_NOTCH_MANAGER_URL ?? DEFAULT_LOCAL_MANAGER_API_URL
  );

  return {
    mode,
    managerUrl,
  };
}

function escapeBootstrapHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderBootstrapError(root: HTMLElement, error: unknown): void {
  root.innerHTML = `
    <main class="desktop-v2" data-state="dormant" data-mood="sad" data-panel="none">
      <div class="live-region" role="status" aria-live="polite">
        ${escapeBootstrapHtml(managerClientErrorMessage(error))}
      </div>
    </main>
  `;
}

export function bootstrapDesktopApp(): void {
  void startDesktopApp();
}

async function startDesktopApp(): Promise<void> {
  const root = document.getElementById("app");
  if (!root) {
    throw new Error("Missing #app root");
  }

  try {
    const config = readBootstrapConfig();
    const manager = await createManagerClient(config);
    const app = new NotchDesktopApp(root, manager);

    window.addEventListener("beforeunload", () => {
      manager.close?.();
    });

    if (manager instanceof LocalManagerApiClient) {
      await manager.init().catch(() => undefined);
    }

    void app;
  } catch (error) {
    renderBootstrapError(root, error);
  }
}

async function createManagerClient(config: BootstrapConfig): Promise<DesktopManagerClient> {
  if (config.mode === "mock") {
    const manager = createMockManagerClient();
    await manager.injectScenario("all");
    return manager;
  }

  return new LocalManagerApiClient({
    baseUrl: config.managerUrl,
  });
}
