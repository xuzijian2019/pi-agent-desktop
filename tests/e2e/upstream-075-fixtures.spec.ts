import { chromium, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { sandboxServerEnv } from "./sandbox";

const run = promisify(execFile);
// Keep upstream's browser regression fixtures in the fork's Playwright entry
// point. These use synthetic DOM/session data, never an actual model or user HOME.
for (const fixture of ["chat-prompt-anchor", "composer-outbox", "option-controls"]) {
  test(`0.7.5 ${fixture} regression fixture`, async ({}, testInfo) => {
    test.setTimeout(180_000);
    const env = { ...process.env, ...sandboxServerEnv() };
    delete env.XDG_STATE_HOME;
    // Resolve the installed browser in the runner before changing HOME/cache for
    // the child. Browser binaries are shared; profiles and agent data stay isolated.
    const channel = testInfo.project.use.channel ?? process.env.E2E_BROWSER_CHANNEL
      ?? (process.platform === "win32" ? "msedge" : undefined);
    delete env.E2E_BROWSER_EXECUTABLE;
    if (channel) env.E2E_BROWSER_CHANNEL = channel;
    else env.E2E_BROWSER_EXECUTABLE = chromium.executablePath();
    await run(process.execPath, [`e2e/${fixture}.mjs`], {
      env, timeout: 170_000, maxBuffer: 4 * 1024 * 1024,
    });
  });
}
