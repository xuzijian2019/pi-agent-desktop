import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { SESSIONS_DIR, WORK_ROOT } from "./sandbox";

// An idle "new task" screen must not talk to the server on a timer. Before the
// network-hygiene pass it issued ~45 `/api/` requests per minute for a healthy
// project, and far more once the project folder disappeared: the watch-dir
// EventSource reconnected every 1.5 s onto a 404, forever.
const SETTLE_MS = 10_000;
const WINDOW_MS = 60_000;

async function gitProject(): Promise<string> {
  const cwd = path.join(WORK_ROOT, `idle-${randomUUID()}`);
  await mkdir(cwd, { recursive: true });
  const run = (...args: string[]) => execFileSync("git", ["-C", cwd, ...args], { stdio: "pipe" });
  run("init", "-b", "main"); run("config", "user.name", "E2E"); run("config", "user.email", "e2e@example.com");
  await writeFile(path.join(cwd, "readme.md"), "# Idle\n"); run("add", "."); run("commit", "-m", "base");
  return cwd;
}

/** A session on disk keeps `cwd` browsable after the folder itself is removed. */
async function seedSession(cwd: string, text: string): Promise<string> {
  const id = randomUUID(); const timestamp = new Date().toISOString();
  const dir = path.join(SESSIONS_DIR, `--${cwd.replaceAll(path.sep, "-")}--`); await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${timestamp.replaceAll(":", "-")}_${id}.jsonl`), [
    { type: "session", version: 3, id, timestamp, cwd },
    { type: "message", id: "user0001", parentId: null, timestamp, message: { role: "user", content: text, timestamp: Date.now() } },
  ].map(e => JSON.stringify(e)).join("\n") + "\n");
  return id;
}

/** Collects every `/api/` URL the page requests, including SSE reconnects. */
function recordApiRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on("request", (request) => { const url = request.url(); if (url.includes("/api/")) urls.push(url); });
  return urls;
}

/** `/api/x?y=1` → `/api/x` — groups cache-busted and cwd-scoped polls together. */
function byRoute(urls: string[]): string {
  const counts = new Map<string, number>();
  for (const url of urls) { const key = new URL(url).pathname; counts.set(key, (counts.get(key) ?? 0) + 1); }
  return [...counts].sort((a, b) => b[1] - a[1]).map(([route, n]) => `${n}× ${route}`).join("\n") || "(none)";
}

/** Idle for `SETTLE_MS`, then count everything the next `WINDOW_MS` produces. */
async function idleApiRequests(page: Page): Promise<string[]> {
  const urls = recordApiRequests(page);
  await page.waitForTimeout(SETTLE_MS);
  urls.length = 0;
  await page.waitForTimeout(WINDOW_MS);
  await test.info().attach("idle-requests", { body: byRoute(urls), contentType: "text/plain" });
  return urls;
}

test("an idle new task in a healthy project stays near-silent", async ({ page }) => {
  test.setTimeout(180_000);
  const cwd = await gitProject();
  await page.goto(`/?cwd=${encodeURIComponent(cwd)}`);
  await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeEditable();
  const urls = await idleApiRequests(page);
  expect(urls.length, `idle requests in 60 s:\n${byRoute(urls)}`).toBeLessThanOrEqual(20);
});

test("an idle session whose project folder is gone stops retrying", async ({ page, request }) => {
  test.setTimeout(180_000);
  const cwd = await gitProject();
  const id = await seedSession(cwd, "Folder about to vanish");
  await expect.poll(async () => (await (await request.get("/api/sessions")).json()).sessions.some((s: { id: string }) => s.id === id), { timeout: 60_000 }).toBe(true);
  await rm(cwd, { recursive: true, force: true });
  await page.goto(`/?session=${id}`);
  await expect(page.getByText("Folder about to vanish", { exact: true }).first()).toBeVisible();
  const urls = await idleApiRequests(page);
  expect(urls.filter((u) => u.includes("type=watch-dir")), "watch-dir must not reconnect onto a missing folder").toEqual([]);
  expect(urls.length, `idle requests in 60 s:\n${byRoute(urls)}`).toBeLessThanOrEqual(5);
});
