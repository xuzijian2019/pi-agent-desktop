import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { sandboxServerEnv, WORK_ROOT } from "./sandbox";

test("stopping and restarting an owned server preserves the browser draft", async ({ page, request }, testInfo) => {
  test.skip(process.platform === "win32", "Process-group shutdown uses POSIX signals");
  test.setTimeout(180_000);
  const reservation = createServer(); reservation.listen(0, "127.0.0.1"); await once(reservation, "listening");
  const port = (reservation.address() as { port: number }).port;
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  const url = `http://127.0.0.1:${port}`;
  const cwd = `${WORK_ROOT}/recovery-${randomUUID()}`; await mkdir(cwd, { recursive: true });
  let child: ChildProcess | undefined;
  let logs = "";
  const start = async () => {
    child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-H", "127.0.0.1", "-p", String(port)], {
      detached: true,
      env: { ...process.env, ...sandboxServerEnv(), PI_WEB_DIST_DIR: ".next-e2e/connection" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.on("data", (data) => { logs += data; });
    child.stderr?.on("data", (data) => { logs += data; });
    await expect.poll(async () => {
      try { return (await request.get(`${url}/api/home`, { timeout: 2_000 })).ok(); } catch { return false; }
    }, { timeout: 90_000 }).toBe(true);
  };
  const stop = async () => {
    if (!child?.pid || child.exitCode !== null) return;
    const exited = once(child, "exit");
    process.kill(-child.pid, "SIGTERM");
    const timer = setTimeout(() => { try { process.kill(-child!.pid!, "SIGKILL"); } catch { /* Already stopped. */ } }, 10_000);
    try { await exited; } finally { clearTimeout(timer); }
    child = undefined;
  };
  try {
    await start(); await page.goto(`${url}/?cwd=${encodeURIComponent(cwd)}`);
    const composer = page.getByPlaceholder("Message…", { exact: false });
    await expect(composer).toBeEditable(); await composer.fill("survive a real server restart");
    await stop();
    await expect(page.getByRole("alert").filter({ hasText: /connection|server|offline/i })).toBeVisible({ timeout: 35_000 });
    await start();
    await expect(page.getByRole("alert").filter({ hasText: /connection|server|offline/i })).toHaveCount(0, { timeout: 20_000 });
    await expect(composer).toHaveValue("survive a real server restart");
    await page.reload(); await expect(composer).toHaveValue("survive a real server restart");
  } finally {
    await stop();
    await testInfo.attach("owned-server.log", { body: logs, contentType: "text/plain" });
  }
});
