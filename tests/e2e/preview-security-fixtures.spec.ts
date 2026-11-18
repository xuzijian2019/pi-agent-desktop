import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { chromium, expect, test } from "@playwright/test";
import { sandboxServerEnv } from "./sandbox";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(__dirname, "../..");

test("preview prompt isolation and streaming security execute without skips", async ({}, info) => {
  // npm test may run before browsers are installed. This gate runs in the e2e
  // job after installation and turns any graceful node:test skip into a failure.
  // Resolve the installed binary before replacing HOME with the isolated home.
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...sandboxServerEnv(),
    PW_EXECUTABLE_PATH: chromium.executablePath(),
  };
  delete env.PW_CHANNEL;
  delete env.NODE_OPTIONS;
  const result = await execFileAsync(process.execPath, [
    "--experimental-strip-types", "--test", "--test-reporter=tap", "--test-concurrency=1",
    "components/preview-prompt-scope.browser.test.mjs",
    "lib/html-preview-stream.browser.test.mjs",
  ], {
    cwd: path.resolve(repoRoot), env, timeout: 100_000, maxBuffer: 4 * 1024 * 1024,
  }).then(
    ({ stdout, stderr }) => ({ code: 0, stdout, stderr }),
    (error: { code?: number | string; stdout?: string; stderr?: string; message: string }) => ({
      code: error.code ?? -1, stdout: error.stdout ?? "", stderr: error.stderr ?? error.message,
    }),
  );
  const output = result.stdout + "\n" + result.stderr;
  await info.attach("preview-security-node-tests", { body: output, contentType: "text/plain" });
  expect(result.code, output).toBe(0);
  expect(result.stdout, output).toMatch(/^# skipped 0\s*$/m);
  expect(result.stdout, output).toMatch(/^# tests 3\s*$/m);
  expect(result.stdout, output).toMatch(/^# pass 3\s*$/m);
});
