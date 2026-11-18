import { test, expect, type APIRequestContext } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { SESSIONS_DIR, WORK_ROOT } from "./sandbox";

async function seed(request: APIRequestContext, reply: string) {
  const id = randomUUID();
  const cwd = path.join(WORK_ROOT, `calendar-preview-${id}`);
  const directory = path.join(SESSIONS_DIR, `--${cwd.replace(/^\//, "").replaceAll("/", "-")}--`);
  await mkdir(directory, { recursive: true });
  await mkdir(cwd, { recursive: true });
  const timestamp = new Date().toISOString();
  const title = `Review the responsive calendar and preview ${id}`;
  const entries = [
    { type: "session", version: 3, id, cwd, timestamp },
    { type: "message", id: "user0001", parentId: null, timestamp, message: { role: "user", content: title, timestamp: Date.now() } },
    { type: "message", id: "answer01", parentId: "user0001", timestamp, message: {
      role: "assistant", content: [{ type: "text", text: reply }], api: "openai-completions", provider: "openai", model: "fixture", stopReason: "stop", timestamp: Date.now(),
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    } },
  ];
  await writeFile(path.join(directory, `${timestamp.replaceAll(":", "-")}_${id}.jsonl`), entries.map(entry => JSON.stringify(entry)).join("\n") + "\n");
  await expect.poll(async () => (await (await request.get("/api/sessions?force=1")).json()).sessions.some((row: { id: string }) => row.id === id)).toBe(true);
  return { id, cwd, title };
}

for (const theme of ["light", "dark"] as const) {
  for (const width of [1280, 390]) {
    test(`calendar modes, filters and preview, ${theme} ${width}`, async ({ page, request }, info) => {
      const fixture = await seed(request, "CALENDAR_REPLY: the result remains readable in the detail pane.");
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(theme => {
        localStorage.setItem("pi-locale", "en");
        localStorage.setItem("pi-theme", theme);
        localStorage.setItem("pi-web:tasks-mode", "list");
      }, theme);
      await page.goto("/?view=tasks");
      const tasks = page.locator(".tasks-view");
      await expect(tasks.getByRole("button", { name: "Tasks", exact: true })).toHaveAttribute("aria-pressed", "true");
      await tasks.getByRole("button", { name: "Calendar", exact: true }).click();
      const entry = tasks.locator(".task-cal-item").filter({ hasText: fixture.title });
      await tasks.getByRole("button", { name: "Week", exact: true }).click();
      await expect(entry).toBeVisible();
      await expect(tasks.locator(width > 640 ? ".task-cal-week" : ".task-cal-agenda")).toBeVisible();
      await tasks.getByRole("button", { name: "Month", exact: true }).click();
      await expect(tasks.locator(width > 640 ? ".task-cal-month" : ".task-cal-agenda")).toBeVisible();
      // The shared sandbox can contain more than the month's three visible
      // entries per day. Exercise its real overflow menu rather than assuming
      // this newly seeded session is among the oldest entries in the cell.
      const selectEntry = async () => {
        await expect(tasks.locator(".task-cal-main")).toHaveAttribute("aria-busy", "false");
        if (await entry.count()) await entry.click();
        else {
          await tasks.locator(".task-cal-cell.is-today .task-cal-more").click();
          await page.locator(".dom-context-menu").getByRole("menuitem").filter({ hasText: fixture.title }).click();
        }
      };
      await selectEntry();
      const preview = tasks.locator(".task-cal-preview");
      await expect(preview).toContainText(fixture.title);
      await expect(preview).toContainText("CALENDAR_REPLY");
      await page.evaluate(async () => { await document.fonts.ready; });
      await page.screenshot({ path: info.outputPath(`calendar-detail-${theme}-${width}.png`), animations: "disabled" });
      const bounds = await preview.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(-1);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
      await preview.getByRole("button", { name: "Close preview", exact: true }).click();
      await expect(preview).toBeHidden();
      await tasks.getByRole("button", { name: "Filter", exact: true }).click();
      const menu = page.locator(".dom-context-menu");
      await expect(menu).toBeVisible();
      await expect(menu).toHaveClass(/app-menu/);
      await menu.getByRole("menuitemcheckbox", { name: "Sessions", exact: true }).click();
      await expect(entry).toHaveCount(0);
      await tasks.getByRole("button", { name: "Week", exact: true }).click();
      await expect(entry).toHaveCount(0);
      await tasks.getByRole("button", { name: "Filter", exact: true }).click();
      await menu.getByRole("menuitem", { name: "Show all", exact: true }).click();
      await expect(entry).toBeVisible();
      await tasks.getByRole("button", { name: "Month", exact: true }).click();
      await page.screenshot({ path: info.outputPath(`calendar-month-${theme}-${width}.png`), animations: "disabled" });
      await tasks.getByRole("button", { name: "Tasks", exact: true }).click();
      await expect(tasks.locator(".task-cal")).toHaveCount(0);
      await tasks.getByRole("button", { name: "Calendar", exact: true }).click();
      await expect(tasks.getByRole("button", { name: "Month", exact: true })).toHaveAttribute("aria-pressed", "true");
      await selectEntry();
      await preview.getByRole("button", { name: "Open session", exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`session=${fixture.id}`));
      await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeEditable();
    });
  }
}

for (const width of [1280, 390]) {
  test(`preview theme updates preserve state and prompt only edits draft, ${width}`, async ({ page, request }, info) => {
    const html = '<!doctype html><html><body style="color:var(--color-text-primary);background:var(--color-background-primary);padding:16px"><h2>Theme-aware report</h2><input id="notes" aria-label="Preview notes"><button id="prompt" onclick="sendPrompt(\'PREVIEW_DRAFT_ONLY\')">Use this prompt</button><script>window.previewIdentity=Math.random()</script></body></html>';
    const fixture = await seed(request, `:::artifact{identifier="themed" type="html" title="Theme bridge fixture"}\n\`\`\`html\n${html}\n\`\`\`\n:::`);
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => { localStorage.setItem("pi-locale", "en"); localStorage.setItem("pi-theme", "auto"); });
    await page.emulateMedia({ colorScheme: "light" });
    const submissions: string[] = [];
    // Permit only the composer's read-only tool discovery. Every sending,
    // mutating, unknown or malformed POST must still fail this draft-only test.
    await page.route(/\/api\/agent\/[^/]+(?:\?.*)?$/, async route => {
      if (route.request().method() === "POST") {
        const body = route.request().postData() ?? "";
        let command: unknown;
        try { command = JSON.parse(body); } catch { /* Recorded below as an unexpected command. */ }
        if (command && typeof command === "object" && !Array.isArray(command)
          && Object.keys(command).length === 1 && "type" in command && command.type === "get_tools") {
          // Match POST /api/agent/[id]'s success envelope without starting an
          // AgentSession merely to enumerate tools for this offline fixture.
          await route.fulfill({ status: 200, json: { success: true, data: [] } });
          return;
        }
        submissions.push(body);
        await route.fulfill({ status: 409, json: { error: "Unexpected agent submission in preview-only fixture" } });
      } else await route.continue();
    });
    await page.goto(`/?session=${fixture.id}`);
    const composer = page.getByRole("textbox", { name: "Message", exact: true });
    await expect(composer).toBeEditable();
    await page.locator(".artifact-card").filter({ hasText: "Theme bridge fixture" }).click();
    const panel = page.locator("#file-panel");
    const iframe = panel.locator(".artifact-panel iframe");
    await expect(iframe).toHaveAttribute("sandbox", /^allow-scripts(?: |$)/);
    await expect(iframe).not.toHaveAttribute("sandbox", /allow-same-origin/);
    const frame = page.frameLocator("#file-panel .artifact-panel iframe");
    await frame.locator("#notes").fill("Keep preview state");
    const identity = await frame.locator("body").evaluate(() => (window as unknown as { previewIdentity: number }).previewIdentity);
    const before = await frame.locator("body").evaluate(el => getComputedStyle(el).color);
    await page.screenshot({ path: info.outputPath(`theme-preview-light-${width}.png`), animations: "disabled" });
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect.poll(() => frame.locator("body").evaluate(el => getComputedStyle(el).color)).not.toBe(before);
    await expect(frame.locator("#notes")).toHaveValue("Keep preview state");
    expect(await frame.locator("body").evaluate(() => (window as unknown as { previewIdentity: number }).previewIdentity)).toBe(identity);
    await page.screenshot({ path: info.outputPath(`theme-preview-dark-${width}.png`), animations: "disabled" });
    await frame.locator("#prompt").click();
    await panel.getByRole("button", { name: "Hide workspace", exact: true }).click();
    await expect(composer).toHaveValue("PREVIEW_DRAFT_ONLY");
    expect(submissions).toEqual([]);
  });
}
