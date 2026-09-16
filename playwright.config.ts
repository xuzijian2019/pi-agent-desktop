import { defineConfig } from "@playwright/test";
import { BASE_URL, E2E_PORT, sandboxServerEnv } from "./tests/e2e/sandbox";

// Local runs can reuse an installed browser (PW_CHANNEL=chrome) when the
// bundled Chromium download is unavailable; CI keeps the bundled default.
const channel = process.env.PW_CHANNEL;

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    locale: "en-US",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ...(channel ? { channel } : {}),
  },
  webServer: {
    command: `npm run web -- --no-open -p ${E2E_PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
    env: sandboxServerEnv(),
  },
});
