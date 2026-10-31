import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { SESSIONS_DIR, WORK_ROOT } from "./sandbox";

for (const [theme, width] of [["light", 1280], ["dark", 390]] as const) {
  test(`cross-session artifacts and written files, ${theme} ${width}`, async ({ page, request }, info) => {
    const id = randomUUID();
    const cwd = path.join(WORK_ROOT, `outputs-${id}`);
    const directory = path.join(SESSIONS_DIR, `--${cwd.replace(/^\//, "").replaceAll("/", "-")}--`);
    await mkdir(directory, { recursive: true });
    await mkdir(cwd, { recursive: true });
    await writeFile(path.join(cwd, "output.txt"), "CURRENT_FILE_OUTPUT");
    const timestamp = new Date().toISOString();
    const artifact = `:::artifact{identifier="indexed-${id}" type="html" title="Indexed ${id}"}\n\`\`\`html\n<!DOCTYPE html><p>HISTORY_PREVIEW</p><script>document.body.dataset.executed="yes"</script>\n\`\`\`\n:::`;
    const entries = [
      { type: "session", version: 3, id, cwd, timestamp },
      { type: "message", id: "user0001", parentId: null, timestamp, message: { role: "user", content: "Generate outputs", timestamp: Date.now() } },
      { type: "message", id: "answer01", parentId: "user0001", timestamp, message: {
        role: "assistant", content: [
          { type: "text", text: artifact },
          { type: "toolCall", id: "write001", name: "write", arguments: { path: "output.txt", content: "ORIGINAL_FILE_OUTPUT" } },
          { type: "toolCall", id: "write002", name: "write", arguments: { path: "missing.txt", content: "MISSING_FILE_SNAPSHOT" } },
        ], api: "openai-completions", provider: "openai", model: "fixture", stopReason: "toolUse", timestamp: Date.now(),
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      } },
      ...["write001", "write002"].map((toolCallId, index) => ({ type: "message", id: `result0${index}`, parentId: index ? "result00" : "answer01", timestamp, message: { role: "toolResult", toolName: "write", toolCallId, isError: false, content: [{ type: "text", text: "Saved" }], timestamp: Date.now() } })),
    ];
    await writeFile(path.join(directory, `${timestamp.replaceAll(":", "-")}_${id}.jsonl`), entries.map(entry => JSON.stringify(entry)).join("\n") + "\n");
    await expect.poll(async () => {
      const response = await request.get("/api/sessions?force=1");
      return (await response.json()).sessions.some((session: { id: string }) => session.id === id);
    }).toBe(true);
    await expect.poll(async () => (await request.get(`/api/worktrees?cwd=${encodeURIComponent(cwd)}`)).status()).toBe(200);
    await page.setViewportSize({ width, height: 850 });
    await page.addInitScript(theme => { localStorage.setItem("pi-theme", theme); localStorage.setItem("pi-locale", "en"); }, theme);
    await page.goto("/?view=artifacts");
    const view = page.locator(".artifacts-view");
    await expect(view).toBeVisible();
    await view.locator(".artifacts-search").fill(id);
    const row = view.locator(".artifacts-item").filter({ hasText: `Indexed ${id}` });
    await expect(row).toBeVisible();
    await row.click();
    await expect(view.locator(".artifact-panel-body")).toContainText("HISTORY_PREVIEW");
    await expect(view.locator(".artifacts-detail-pane iframe")).toHaveCount(0);
    if (width === 390) await view.locator(".artifacts-back").click();
    await view.locator(".artifacts-search").fill(path.join(cwd, "output.txt"));
    await view.locator(".artifacts-item").filter({ hasText: "output.txt" }).click();
    await expect(view.locator(".file-viewer-shell")).toContainText("CURRENT_FILE_OUTPUT");
    await view.locator(".artifacts-file-history summary").click();
    await expect(view.locator(".artifacts-file-history")).toContainText("Written");
    if (width === 390) await view.locator(".artifacts-back").click();
    await view.locator(".artifacts-search").fill(path.join(cwd, "missing.txt"));
    await view.locator(".artifacts-item").filter({ hasText: "missing.txt" }).click();
    await expect(view.locator(".artifact-panel-body")).toContainText("MISSING_FILE_SNAPSHOT");
    await page.screenshot({ path: info.outputPath(`outputs-${theme}-${width}.png`), animations: "disabled" });
  });
}
