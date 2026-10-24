import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { WORK_ROOT } from "./sandbox";

async function project(page: Page, git = false) {
  const cwd = path.join(WORK_ROOT, `workbench-${randomUUID()}`); await mkdir(cwd, { recursive: true });
  if (git) {
    const run = (...args: string[]) => execFileSync("git", ["-C", cwd, ...args], { stdio: "pipe" });
    run("init", "-b", "main"); run("config", "user.name", "E2E"); run("config", "user.email", "e2e@example.com");
    await writeFile(path.join(cwd, "readme.md"), "# Base\n"); run("add", "."); run("commit", "-m", "base");
  }
  await page.goto(`/?cwd=${encodeURIComponent(cwd)}`);
  await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeEditable();
  return cwd;
}
async function openPanel(page: Page) {
  const panel = page.locator("#file-panel");
  if (!(await panel.evaluate(el => el.classList.contains("right-panel-open")))) await page.locator(".right-panel-toggle-button").click();
  await expect(panel).toHaveClass(/right-panel-open/);
  await expect(panel).toBeVisible();
  await expect(panel).toHaveJSProperty("inert", false);
  await expect.poll(() => panel.evaluate(el => el.getAnimations().every(animation => !animation.pending && animation.playState !== "running"))).toBe(true);
  return panel;
}

test("loading a remotely saved draft restores references and setup atomically", async ({ page }) => {
  const cwd = await project(page);
  const composer = page.getByRole("textbox", { name: "Message", exact: true });
  await composer.fill('stale #"Source A"');
  await expect(page.getByText("Saving draft…", { exact: true })).toHaveCount(0);

  const savedDraft = {
    value: 'saved #"Source B"',
    images: [],
    texts: [],
    references: { "Source B": { id: "source-b", leafId: "branch-b" } },
    setup: { model: null, effort: "high", tools: "full" },
  };
  const publishSavedDraft = (draft: Record<string, unknown>) => page.evaluate(async ({ key, savedDraft }) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("pi-chat-drafts", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const revision = await new Promise<number>((resolve, reject) => {
      const transaction = database.transaction("drafts", "readwrite");
      const store = transaction.objectStore("drafts");
      const get = store.get(key);
      let nextRevision = 1;
      get.onsuccess = () => {
        nextRevision = (get.result?.revision ?? 0) + 1;
        store.put({ revision: nextRevision, draft: savedDraft }, key);
      };
      transaction.oncomplete = () => resolve(nextRevision);
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
    const channel = new BroadcastChannel("pi-chat-drafts");
    channel.postMessage({ key, revision });
    channel.close();
  }, { key: `new:${cwd}`, savedDraft: draft });
  await publishSavedDraft(savedDraft);

  const conflict = page.getByRole("status").filter({ hasText: "Draft changed in another tab" });
  await expect(conflict).toBeVisible();
  await conflict.getByRole("button", { name: "Load saved version" }).click();
  await expect(composer).toHaveValue(savedDraft.value);
  await expect(page.getByRole("button", { name: "Change reasoning level", exact: true })).toHaveAttribute("title", /high/);
  await expect(page.getByRole("button", { name: "Change tool preset", exact: true })).toHaveAttribute("title", /full/);
  await expect(conflict).toHaveCount(0);

  const readSavedDraft = () => page.evaluate(async (key) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("pi-chat-drafts", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const request = database.transaction("drafts").objectStore("drafts").get(key);
        request.onsuccess = () => resolve(request.result?.draft);
        request.onerror = () => reject(request.error);
      });
    } finally { database.close(); }
  }, `new:${cwd}`);
  await expect.poll(readSavedDraft).toEqual(savedDraft);

  const plainDraft = { value: "No saved overrides", images: [], texts: [] };
  await publishSavedDraft(plainDraft);
  await expect(conflict).toBeVisible();
  await conflict.getByRole("button", { name: "Load saved version" }).click();
  await expect(composer).toHaveValue(plainDraft.value);
  await page.getByRole("button", { name: "Change reasoning level", exact: true }).click();
  await expect(page.locator(".is-thinking .composer-option-row.is-active")).toContainText("auto");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Change tool preset", exact: true })).toHaveAttribute("title", /configured/);
  await expect.poll(readSavedDraft).toEqual({ ...plainDraft, references: {} });
});

test("session references are prepared on send without restoring the removed preview UI", async ({ page, request }) => {
  await project(page);
  const input = page.getByRole("textbox", { name: "Message", exact: true });
  await input.fill("!printf context-seed"); await input.press("Enter");
  await expect(page).toHaveURL(/session=/);
  const sessionId = new URL(page.url()).searchParams.get("session");
  await expect.poll(async () => (await (await request.get(`/api/agent/${sessionId}`)).json()).state?.isBashRunning).toBe(false);
  const id = randomUUID(); let text = "Original reference snapshot";
  await page.route("**/api/sessions", route => route.fulfill({ json: { sessions: [{ id, name: "Reference", firstMessage: "Reference", cwd: WORK_ROOT, created: new Date().toISOString(), modified: new Date().toISOString(), messageCount: 1 }] } }));
  await page.route(`**/api/sessions/${id}/reference?*`, route => route.fulfill({ json: { reference: text, revision: text, entries: [], leafId: "leaf" } }));
  const composer = page.getByRole("textbox", { name: "Message", exact: true }); await composer.fill('Use #"Reference"');
  await expect(page.getByRole("button", { name: "Preview outgoing message", exact: true })).toHaveCount(0);
  let sent: { message?: string } | undefined;
  await page.route(`**/api/agent/${sessionId}`, route => {
    if (route.request().method() === "POST" && route.request().postDataJSON().type === "prompt") {
      sent = route.request().postDataJSON(); return route.fulfill({ json: { success: true } });
    }
    return route.continue();
  });
  await composer.press("Enter");
  await expect.poll(() => sent?.message).toBe("Use Original reference snapshot");
  await expect(page.getByRole("button", { name: "Stop agent", exact: true })).toHaveCount(0);
  text = "New source revision";
  await composer.fill('Changed #"Reference"');
  await composer.press("Enter");
  await expect.poll(() => sent?.message).toBe("Changed New source revision");
});

test("branch creation works without a model", async ({ page }) => {
  const cwd = await project(page, true);
  await page.getByRole("button", { name: "⑂ main", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Git branch", exact: true });
  await expect(dialog).toBeVisible();
  // The popover slides in over 140 ms; measure its resting position, not a mid-animation frame.
  await dialog.evaluate(el => Promise.all(el.getAnimations({ subtree: true }).map(a => a.finished)));
  const triggerBox = (await page.getByRole("button", { name: "⑂ main", exact: true }).first().boundingBox())!;
  const dialogBox = (await dialog.boundingBox())!;
  const composerBox = (await page.locator(".chat-composer").boundingBox())!;
  expect(Math.abs(dialogBox.y + dialogBox.height - (triggerBox.y - 6))).toBeLessThan(2);
  expect(dialogBox.x).toBeGreaterThanOrEqual(composerBox.x);
  expect(dialogBox.x + dialogBox.width).toBeLessThanOrEqual(composerBox.x + composerBox.width);
  expect(dialogBox.width).toBeLessThanOrEqual(320);
  await dialog.getByRole("button", { name: "Create branch" }).click();
  await dialog.getByLabel("Name", { exact: true }).fill("feature/workbench");
  await dialog.getByRole("button", { name: "Review operation" }).click();
  await dialog.getByRole("button", { name: "Create and switch" }).click();
  await expect.poll(() => execFileSync("git", ["-C", cwd, "branch", "--show-current"], { encoding: "utf8" }).trim()).toBe("feature/workbench");
});

test("composer metadata and rounded panel remain uncluttered at desktop and phone widths", async ({ page }, testInfo) => {
  await page.route("**/api/models?*", route => route.fulfill({ json: { models: { "test:model": "Example model" }, modelList: [{ provider: "test", id: "model", name: "Example model" }], defaultModel: { provider: "test", modelId: "model" }, thinkingLevels: { "test:model": ["off"] } } }));
  await project(page, true);
  const controls = page.locator(".chat-composer-controls");
  await expect(controls.getByRole("button", { name: "Preview outgoing message", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Saved Tasks", exact: true })).toHaveCount(0);
  const folder = controls.locator(".chat-project-context");
  const branch = controls.getByRole("button", { name: "⑂ main", exact: true });
  await expect(branch).toBeVisible();
  const folderBox = (await folder.boundingBox())!; const branchBox = (await branch.boundingBox())!;
  expect(branchBox.x).toBeGreaterThan(folderBox.x); expect(Math.abs(branchBox.y - folderBox.y)).toBeLessThan(8);
  const panel = await openPanel(page);
  // One header row: tabs and panel actions, no view switcher.
  await expect(panel.locator(".right-panel-tab-strip")).toHaveCount(1);
  await expect(panel.getByRole("combobox")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("panel-desktop.png") });
  await page.getByRole("button", { name: "Hide workspace", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(panel).toHaveClass(/right-panel-closed/);
  await expect(panel).toHaveJSProperty("inert", true);
  await expect(panel).toBeHidden();
  // Wait for the closed panel to leave the viewport, rather than capturing a
  // frame in its slide-out transition after the desktop-to-phone resize.
  await expect.poll(() => panel.evaluate(el => {
    const rect = el.getBoundingClientRect();
    return rect.left >= innerWidth - 1 && el.getAnimations().every(animation => !animation.pending && animation.playState !== "running");
  })).toBe(true);
  expect(await page.evaluate(() => [
    [1, 1], [innerWidth - 1, 1], [innerWidth / 2, innerHeight / 2],
    [1, innerHeight - 1], [innerWidth - 1, innerHeight - 1],
  ].every(([x, y]) => !document.elementFromPoint(x, y)?.closest("#file-panel, .right-panel-overlay-backdrop")))).toBe(true);
  await expect(branch).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const narrowBranch = (await branch.boundingBox())!;
  const model = controls.getByRole("button", { name: "Example model", exact: true });
  const narrowModel = (await model.boundingBox())!;
  expect(narrowModel.x).toBeGreaterThanOrEqual(narrowBranch.x + narrowBranch.width);
  for (const control of [branch, model]) {
    await expect.poll(() => control.evaluate(el => {
      const rect = el.getBoundingClientRect();
      return el.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
    })).toBe(true);
    await control.click({ trial: true });
  }
  await page.screenshot({ path: testInfo.outputPath("composer-phone.png") });
  await openPanel(page);
  await expect.poll(() => panel.evaluate(el => {
    const rect = el.getBoundingClientRect();
    return Math.abs(rect.x) < 1 && Math.abs(rect.y) < 1
      && Math.abs(rect.width - innerWidth) < 1 && Math.abs(rect.height - innerHeight) < 1;
  })).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("panel-phone.png") });
});

test("new-task composer shares chat sizing and reflows drafts without another keystroke", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await project(page);
  const input = page.getByRole("textbox", { name: "Message", exact: true });
  const card = page.locator(".chat-composer");
  await expect(page.locator(".chat-empty-state")).toBeVisible();
  await expect.poll(() => input.evaluate(el => {
    const style = getComputedStyle(el);
    return [style.minHeight, style.maxHeight];
  })).toEqual(["24px", "200px"]);
  await expect.poll(() => card.evaluate(el => Math.abs(el.getBoundingClientRect().width - 820))).toBeLessThan(1);
  await input.fill("A draft that must wrap when the window narrows. ".repeat(8));
  const height = () => input.evaluate(el => el.clientHeight);
  const wideHeight = await height();
  await page.keyboard.press("Control+,");
  const settings = page.locator(".settings-dialog-surface");
  await expect(settings).toBeVisible();
  await page.getByRole("slider", { name: "Chat content width", exact: true }).press("End");
  await page.keyboard.press("Escape");
  await expect.poll(() => card.evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThan(820);
  await expect.poll(height).toBeLessThan(wideHeight);
  await page.keyboard.press("Control+,");
  await page.getByRole("button", { name: "Reset chat content width", exact: true }).click();
  await page.getByRole("slider", { name: "Chat font size", exact: true }).press("End");
  await page.keyboard.press("Escape");
  await expect.poll(height).toBeGreaterThan(wideHeight);
  await page.keyboard.press("Control+,");
  await page.getByRole("button", { name: "Reset chat font size", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect.poll(height).toBe(wideHeight);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(height).toBeGreaterThan(wideHeight);
  expect(await height()).toBeLessThanOrEqual(200);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await expect.poll(height).toBe(wideHeight);
  await input.fill("Long draft\n".repeat(60));
  await expect.poll(height).toBe(200);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => document.documentElement.classList.toggle("dark", value === "dark"), theme);
    await page.screenshot({ path: testInfo.outputPath(`composer-sizing-long-desktop-${theme}.png`), animations: "disabled" });
  }
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  await input.fill("");
  await expect.poll(height).toBe(24);
  await expect(page.locator(".composer-trigger-hint")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("composer-sizing-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(height).toBe(24);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => document.documentElement.classList.toggle("dark", value === "dark"), theme);
    await page.screenshot({ path: testInfo.outputPath(`composer-sizing-phone-${theme}.png`), animations: "disabled" });
  }
});
