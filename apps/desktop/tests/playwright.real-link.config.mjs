import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const testDir = fileURLToPath(new URL("./real-link", import.meta.url));
const outputDir = fileURLToPath(
  new URL("../../../tests/artifacts/qa-real-link/playwright-output", import.meta.url)
);

export default defineConfig({
  testDir,
  outputDir,
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: {
    timeout: 7_000,
  },
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:5174",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
  webServer: {
    command: "npm run dev:qa",
    cwd: repoRoot,
    url: "http://127.0.0.1:5174/",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
