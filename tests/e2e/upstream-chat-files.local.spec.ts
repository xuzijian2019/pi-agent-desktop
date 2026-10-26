import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { SESSIONS_DIR } from "./sandbox";

// Real persisted chats + real file routes: no provider request or mocked access.
async function seed(cwd: string, text: string) {
  const id = randomUUID(), userId = randomUUID(), assistantId = randomUUID();
  const timestamp = new Date().toISOString();
  await mkdir(cwd, { recursive: true });
  const directory = path.join(SESSIONS_DIR, `--${cwd.replace(/^\//, "").replaceAll("/", "-")}--`);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, `${timestamp.replaceAll(":", "-")}_${id}.jsonl`), [
    { type: "session", version: 3, id, cwd, timestamp },
    { type: "message", id: userId, parentId: null, timestamp, message: { role: "user", content: "Review generated files without changing chat permissions", timestamp: Date.now() } },
    { type: "message", id: assistantId, parentId: userId, timestamp, message: {
      role: "assistant", content: [{ type: "text", text }], api: "anthropic-messages", provider: "anthropic", model: "claude-sonnet-4-20250514",
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: "stop", timestamp: Date.now(),
    } },
  ].map(entry => JSON.stringify(entry)).join("\n") + "\n");
  return id;
}

for (const theme of ["light", "dark"] as const) {
  for (const width of [1280, 390]) {
    test(`chat-generated files remain scoped across navigation, ${theme} ${width}`, async ({ page, request }, info) => {
      await page.setViewportSize({ width, height: 850 });
      await page.addInitScript(theme => {
        localStorage.setItem("pi-theme", theme);
        localStorage.setItem("pi-locale", "en");
      }, theme);
      const response = await request.get("/api/chat-workspace");
      expect(response.ok()).toBe(true);
      const root = (await response.json()).cwd as string;
      const cwd = path.join(root, `generated-files-${randomUUID()}`);
      const otherCwd = path.join(root, `other-chat-${randomUUID()}`);
      const otherId = await seed(otherCwd, "A separate chat must not inherit file tabs.");
      const outside = path.join(otherCwd, "outside.txt");
      await writeFile(outside, "OTHER_CHAT_FILE_MUST_NOT_OPEN");
      const id = await seed(cwd, `[Open generated report](./report.md)\n\n[Outside chat link](${outside})`);
      await writeFile(path.join(cwd, "report.md"), "# Generated report\n\n" + "Long generated content stays readable within its panel. ".repeat(120));
      await expect.poll(async () => {
        const data = await (await request.get("/api/sessions?force=1")).json();
        return data.sessions.find((row: { id: string }) => row.id === id)?.chatFolder;
      }).toBe(true);
      await page.goto(`/?session=${id}`);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      const composer = page.getByRole("textbox", { name: "Message", exact: true });
      await expect(composer).toBeEditable();
      await composer.fill("Unsent draft while inspecting generated files");
      await expect(page.locator(".right-panel-toggle-button")).toBeVisible();
      await page.getByRole("link", { name: "Outside chat link", exact: true }).click();
      await expect(page.locator(".file-tab")).toHaveCount(0);
      await page.getByRole("link", { name: "Open generated report", exact: true }).click();
      const panel = page.locator("#file-panel");
      await expect(panel).toBeVisible();
      await expect(panel.getByRole("heading", { name: "Generated report", exact: true })).toBeVisible();
      await expect(page.locator(".file-tab")).toHaveCount(1);
      await expect(page.locator(".file-tab-add")).toHaveCount(0);
      await expect(page.locator(".conversation-navigator")).toHaveCount(0);
      const box = await panel.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
      // Let theme and panel animations finish before retaining pixel evidence.
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})));
      });
      await page.screenshot({ path: info.outputPath(`chat-files-${theme}-${width}.png`), animations: "disabled" });
      await page.locator(".right-panel-close-button").click();
      await expect(composer).toHaveValue("Unsent draft while inspecting generated files");
      await page.goto(`/?session=${otherId}`);
      await expect(composer).toBeEditable();
      await expect(page.locator(".file-tab")).toHaveCount(0);
      await expect(page.locator(".right-panel-toggle-button")).toHaveAttribute("aria-expanded", "false");
      await page.goBack();
      await expect(page).toHaveURL(new RegExp(id));
      await expect(composer).toHaveValue("Unsent draft while inspecting generated files");
      await expect(page.locator(".file-tab")).toHaveCount(0);
    });
  }
}
