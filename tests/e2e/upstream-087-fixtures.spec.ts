import { chromium, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { sandboxServerEnv } from "./sandbox";

const run = promisify(execFile);

for (const fixture of ["plugin-discovery", "long-paste"]) {
  test(`0.8.7 ${fixture} regression fixture`, async ({}, info) => {
    // These fixtures render the real components with synthetic session data
    // and mock APIs. They never install packages or contact a model/registry.
    const env = { ...process.env, ...sandboxServerEnv() };
    delete env.XDG_STATE_HOME;
    const channel = info.project.use.channel ?? process.env.E2E_BROWSER_CHANNEL;
    delete env.E2E_BROWSER_CHANNEL;
    delete env.E2E_BROWSER_EXECUTABLE;
    if (channel) env.E2E_BROWSER_CHANNEL = channel;
    else env.E2E_BROWSER_EXECUTABLE = chromium.executablePath();
    const { stdout, stderr } = await run(process.execPath, [`e2e/${fixture}.mjs`], {
      env, timeout: 110_000, maxBuffer: 4 * 1024 * 1024,
    });
    await info.attach("fixture output", { body: stdout + stderr, contentType: "text/plain" });
  });
}
