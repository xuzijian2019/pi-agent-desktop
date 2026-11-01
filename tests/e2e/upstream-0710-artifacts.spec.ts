import { test, expect } from "@playwright/test";
import { mkdir, unlink, writeFile } from "node:fs/promises";
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
    const missingPath = path.join(cwd, "missing.txt");
    await writeFile(missingPath, "CURRENT_MISSING_FILE");
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
    if (width === 1280) {
      // Web keeps the browser context menu; native menu commands need desktop QA.
      await row.evaluate((element) => element.addEventListener("contextmenu", (event) => {
        queueMicrotask(() => { document.body.dataset.artifactContextPrevented = String(event.defaultPrevented); });
      }, { once: true }));
      await row.click({ button: "right" });
      await expect(page.locator("body")).toHaveAttribute("data-artifact-context-prevented", "false");
    }
    await row.click();
    await expect(view.locator(".artifact-panel-body")).toContainText("HISTORY_PREVIEW");
    await expect(view.locator(".artifacts-detail-pane iframe")).toHaveCount(0);
    // Favorite an artifact and verify the filter finds it. On narrow screens the
    // list and detail take turns, so return to the list before filtering.
    const star = view.getByRole("button", { name: "Add to favorites" });
    await star.click();
    await expect(view.getByRole("button", { name: "Remove from favorites" })).toHaveAttribute("aria-pressed", "true");
    await page.screenshot({ path: info.outputPath(`artifact-detail-${theme}-${width}.png`), animations: "disabled" });
    if (width === 390) await view.locator(".artifacts-back").click();
    const favorites = view.getByRole("button", { name: "Show favorites only" });
    await favorites.click();
    await expect(favorites).toHaveAttribute("aria-pressed", "true");
    await expect(row).toBeVisible();
    await favorites.click();

    // The new default view hides process files, including .txt; make the
    // choice explicit instead of falsely assuming every write is an output.
    await view.locator(".artifacts-search").fill(path.join(cwd, "output.txt"));
    await expect(view.locator(".artifacts-process-note")).toBeVisible();
    await expect(view.locator(".artifacts-item").filter({ hasText: "output.txt" })).toHaveCount(0);
    await view.getByRole("combobox", { name: "Type" }).click();
    await page.getByRole("option", { name: "Everything, with process files", exact: true }).click();
    if (width === 1280) {
      const separator = view.getByRole("separator", { name: "Resize artifact list" });
      await expect(separator).toBeVisible();
      const before = Number(await separator.getAttribute("aria-valuenow"));
      await separator.focus();
      await separator.press("ArrowRight");
      await expect.poll(async () => Number(await separator.getAttribute("aria-valuenow"))).toBeGreaterThan(before);
      await separator.press("Enter");
    } else {
      await expect(view.getByRole("separator", { name: "Resize artifact list" })).toBeHidden();
    }
    await expect(view.locator(".artifacts-item").filter({ hasText: "output.txt" })).toBeVisible();
    await page.screenshot({ path: info.outputPath(`artifact-list-${theme}-${width}.png`), animations: "disabled" });
    await view.locator(".artifacts-item").filter({ hasText: "output.txt" }).click();
    await expect(view.locator(".file-viewer-shell")).toContainText("CURRENT_FILE_OUTPUT");
    await view.locator(".artifacts-file-history summary").click();
    await expect(view.locator(".artifacts-file-history")).toContainText("Written");
    if (width === 390) await view.locator(".artifacts-back").click();

    // List while the file exists, then remove it between row selection and
    // the detail response. This exercises the real missing-file snapshot race
    // without asking the new list to display files already gone from disk.
    await view.locator(".artifacts-search").fill(missingPath);
    const missingRow = view.locator(".artifacts-item").filter({ hasText: "missing.txt" });
    await expect(missingRow).toBeVisible();
    let resumeDetail!: () => void;
    let detailRequested!: () => void;
    const release = new Promise<void>((resolve) => { resumeDetail = resolve; });
    const requested = new Promise<void>((resolve) => { detailRequested = resolve; });
    await page.route((url) => url.pathname === "/api/artifacts/file" && url.searchParams.get("path") === missingPath, async (route) => {
      detailRequested();
      await release;
      await route.continue();
    });
    await missingRow.click();
    await requested;
    try { await unlink(missingPath); } finally { resumeDetail(); }
    await expect(view.locator(".artifact-panel-body")).toContainText("MISSING_FILE_SNAPSHOT");
    await expect(view).toContainText("This file is no longer on disk. Showing what the last write put there.");
    await page.screenshot({ path: info.outputPath(`outputs-${theme}-${width}.png`), animations: "disabled" });

    // A refreshed list excludes the deleted file, even with process files on.
    await page.reload();
    await view.getByRole("combobox", { name: "Type" }).click();
    await page.getByRole("option", { name: "Everything, with process files", exact: true }).click();
    const refreshed = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === "/api/artifacts" && url.searchParams.get("q") === missingPath && response.ok();
    });
    await view.locator(".artifacts-search").fill(missingPath);
    await refreshed;
    await expect.poll(async () => {
      const response = await request.get(`/api/artifacts?q=${encodeURIComponent(missingPath)}`);
      const data = await response.json();
      return data.artifacts.some((entry: { kind: string; path?: string }) => entry.kind === "file" && entry.path === missingPath);
    }).toBe(false);
    await expect(view.locator(".artifacts-item").filter({ hasText: "missing.txt" })).toHaveCount(0);
  });
}
