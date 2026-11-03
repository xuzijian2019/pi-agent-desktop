import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { SESSIONS_DIR, WORK_ROOT } from "./sandbox";

async function seedSession(cwd: string, name: string) {
  const id = randomUUID(), userId = randomUUID(), assistantId = randomUUID();
  const timestamp = new Date().toISOString();
  const directory = path.join(SESSIONS_DIR, `--${cwd.replace(/^\//, "").replaceAll("/", "-")}--`);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, `${timestamp.replaceAll(":", "-")}_${id}.jsonl`), [
    { type: "session", version: 3, id, cwd, timestamp },
    { type: "message", id: userId, parentId: null, timestamp, message: { role: "user", content: name, timestamp: Date.now() } },
    { type: "message", id: assistantId, parentId: userId, timestamp, message: {
      role: "assistant", content: [{ type: "text", text: "Synthetic offline session for reversible archive verification." }],
      api: "anthropic-messages", provider: "anthropic", model: "claude-sonnet-4-20250514",
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: "stop", timestamp: Date.now(),
    } },
    { type: "session_info", id: randomUUID(), parentId: assistantId, timestamp, name },
  ].map(entry => JSON.stringify(entry)).join("\n") + "\n");
  return id;
}

async function showSidebar(page: Page) {
  const sidebar = page.locator("#session-sidebar");
  // Wait for hydration to apply mobile navigation before deciding whether to open it.
  await expect(sidebar).not.toHaveClass(/sidebar-mobile-pending/);
  // Narrow layouts close the sidebar on navigation. Open it through the actual control.
  if (await sidebar.evaluate(el => el.classList.contains("sidebar-closed"))) {
    await page.locator(".app-main-column").getByRole("button", { name: "Show sidebar", exact: true }).click();
  }
  await expect(sidebar).toHaveClass(/sidebar-open/);
  await expect(sidebar).toHaveJSProperty("inert", false);
  await expect.poll(() => sidebar.evaluate(el => el.getAnimations().every(a => !a.pending && a.playState !== "running"))).toBe(true);
}

for (const theme of ["light", "dark"] as const) {
  for (const width of [1280, 390]) {
    test(`session archive is reversible without deleting history, ${theme} ${width}`, async ({ page, request }, info) => {
      await page.setViewportSize({ width, height: 850 });
      await page.addInitScript(theme => {
        localStorage.setItem("pi-theme", theme);
        localStorage.setItem("pi-locale", "en");
      }, theme);
      const cwd = path.join(WORK_ROOT, `session-archive-long-project-name-${randomUUID()}`);
      await mkdir(cwd, { recursive: true });
      const name = "Session with a deliberately long title to verify clipping and archive menu placement";
      const id = await seedSession(cwd, name);
      const other = await seedSession(cwd, "Another session remains available");
      await expect.poll(async () => {
        const response = await request.get("/api/sessions?force=1");
        expect(response.ok()).toBe(true);
        const { sessions } = await response.json();
        return sessions.filter((row: { id: string }) => (row.id === id || row.id === other)).length;
      }).toBe(2);
      await page.goto(`/?session=${other}`);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeEditable();
      await showSidebar(page);
      const group = page.locator(`.sidebar-project-tree-group[data-project-root="${cwd}"]`);
      await expect(group).toBeVisible();
      const header = group.locator(".sidebar-project-tree-row-main");
      if (await header.getAttribute("aria-expanded") === "false") await header.click();
      const row = group.locator(".session-item").filter({ has: page.locator(`a[href="?session=${id}"]`) });
      await expect(row).toBeVisible();
      // Browser session-row actions are exposed through the hover button;
      // right-click is the desktop integration hook, not a web menu gesture.
      await row.hover();
      await row.locator(".sidebar-session-menu-button").click();
      const menu = page.locator(".session-item-menu");
      await expect(menu.getByRole("menuitem", { name: "Archive", exact: true })).toBeVisible();
      await expect.poll(() => menu.evaluate(el => el.getAnimations({ subtree: true }).every(a => !a.pending && a.playState !== "running"))).toBe(true);
      const box = (await menu.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
      expect(box.y + box.height).toBeLessThanOrEqual(851);
      await page.screenshot({ path: info.outputPath(`082-session-menu-${theme}-${width}.png`), animations: "disabled" });
      await menu.getByRole("menuitem", { name: "Archive", exact: true }).click();
      await expect(row).toHaveCount(0);
      await expect(group.getByRole("button", { name: "Show archived (1)", exact: true })).toBeVisible();
      await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("pi-web:archived-sessions") ?? "[]"))).toEqual([id]);
      await page.reload();
      await showSidebar(page);
      await expect(group.getByRole("button", { name: "Show archived (1)", exact: true })).toBeVisible();
      await group.getByRole("button", { name: "Show archived (1)", exact: true }).click();
      await expect(row).toBeVisible();
      await expect(group.locator(`a[href="?session=${other}"]`)).toBeVisible();
      await page.screenshot({ path: info.outputPath(`082-session-archived-${theme}-${width}.png`), animations: "disabled" });
      // Browser session-row actions are exposed through the hover button;
      // right-click is the desktop integration hook, not a web menu gesture.
      await row.hover();
      await row.locator(".sidebar-session-menu-button").click();
      await menu.getByRole("menuitem", { name: "Unarchive", exact: true }).click();
      await expect(group.getByRole("button", { name: "Hide archived", exact: true })).toHaveCount(0);
      await expect(row).toBeVisible();
      await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("pi-web:archived-sessions") ?? "[]"))).toEqual([]);
      const saved = await request.get(`/api/sessions/${id}`);
      expect(saved.ok()).toBe(true);
      expect(JSON.stringify(await saved.json())).toContain("Synthetic offline session");
    });
  }
}
