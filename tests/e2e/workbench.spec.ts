import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, realpath } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { WORK_ROOT, SESSIONS_DIR } from "./sandbox";

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
async function mode(page: Page, value: string) {
  const panel = page.locator("#file-panel");
  if (!(await panel.getByRole("button", { name: "Close panel", exact: true }).isVisible())) await page.locator(".right-panel-toggle-button").click();
  if (await panel.getByRole("combobox", { name: "Panel views", exact: true }).isVisible()) await panel.getByRole("combobox", { name: "Panel views" }).selectOption(value);
  else await panel.getByRole("tab", { name: ({ files: "Files", search: "Search", tasks: "Saved Tasks", activity: "Activity" } as Record<string, string>)[value], exact: true }).click();
  return panel;
}
/** The Changes / Pinned sections inside Files: a header button and its region. */
function section(page: Page, name: "Changes" | "Pinned") {
  const region = page.getByRole("region", { name, exact: true });
  return { region, toggle: name === "Changes" ? page.locator(".workbench-changes > button") : region.getByRole("button", { name: new RegExp(`^${name}`) }) };
}

// Runs before anything saves a task, so the empty-library case is the real one.
test("a new task shows the guidance line, then its recent saved tasks", async ({ page, request }) => {
  const cwd = await project(page);
  const guide = page.locator(".new-task-guide");
  await expect(guide).toContainText("Describe a task, or start from a saved one.");
  // An empty library is the line alone: no chips, no panel link, no empty box.
  await expect(guide.getByRole("button")).toHaveCount(0);

  await mode(page, "tasks");
  const panel = page.getByRole("region", { name: "Saved Tasks", exact: true });
  await panel.getByRole("button", { name: "New template", exact: true }).click();
  await panel.getByLabel("Name", { exact: true }).fill("Audit deps");
  await panel.getByLabel("Description", { exact: true }).fill("Check the lockfile");
  await panel.getByLabel("Prompt", { exact: true }).fill("Audit the dependencies.");
  await panel.getByRole("button", { name: "Save", exact: true }).click();

  // The panel broadcasts the change; the guide picks it up without a poller.
  const chip = guide.getByRole("button", { name: "Audit deps Check the lockfile", exact: true });
  await expect(chip).toBeVisible();
  await expect(guide.getByRole("button", { name: "All saved tasks", exact: true })).toBeVisible();
  await chip.click();
  const composer = page.getByRole("textbox", { name: "Message", exact: true });
  await expect(composer).toHaveValue("Audit the dependencies.");
  // The guidance goes away with the empty state once a message is sent.
  await composer.fill("!printf guided"); await composer.press("Enter");
  await expect(page).toHaveURL(/session=/);
  await expect(guide).toHaveCount(0);
  // The library is global and outlives this test; leave it as it was found.
  const { tasks } = await (await request.get(`/api/saved-tasks?cwd=${encodeURIComponent(cwd)}`)).json();
  for (const saved of tasks) await request.delete(`/api/saved-tasks/${saved.id}`, { data: { revision: saved.revision } });
});

test("saved task applies to a draft, preserves settings and restores the panel without file tabs", async ({ page }) => {
  await project(page);
  await mode(page, "tasks");
  const panel = page.getByRole("region", { name: "Saved Tasks", exact: true });
  await panel.getByRole("button", { name: "New template", exact: true }).click();
  await panel.getByLabel("Name", { exact: true }).fill("Review setup");
  await panel.getByLabel("Prompt", { exact: true }).fill("Review this project carefully.");
  await panel.getByLabel("Thinking effort").selectOption("high");
  await panel.getByLabel("Tools", { exact: true }).selectOption("none");
  await panel.getByRole("button", { name: "Save", exact: true }).click();
  await panel.getByRole("button", { name: "Use", exact: true }).click();
  const composer = page.getByRole("textbox", { name: "Message", exact: true });
  await expect(composer).toHaveValue("Review this project carefully.");
  await page.reload();
  await expect(composer).toHaveValue("Review this project carefully.");
  await expect(panel).toBeVisible();
  await composer.fill("Keep this draft");
  await panel.getByRole("button", { name: "Use", exact: true }).click();
  await composer.fill("Keep this draft plus a late edit");
  await page.getByRole("button", { name: "Append task prompt" }).click();
  await expect(composer).toHaveValue("Keep this draft plus a late edit\n\nReview this project carefully.");
});

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

test("recent task chips reveal draft choices from closed and different panels", async ({ page, request }) => {
  const created = await request.post("/api/saved-tasks", { data: {
    name: "Recent conflict task", description: "Visible conflict choices", prompt: "TASK TEXT",
    projectRoot: null, model: null, effort: "inherit", tools: "inherit",
  } });
  expect(created.ok()).toBe(true);
  const task = await created.json();
  const cwd = path.join(WORK_ROOT, `task-chip-${randomUUID()}`);
  await mkdir(cwd, { recursive: true });
  await page.goto(`/?cwd=${encodeURIComponent(cwd)}`);
  const composer = page.getByRole("textbox", { name: "Message", exact: true });
  await expect(composer).toBeEditable();
  await composer.fill("KEEP THIS DRAFT");
  const chip = page.getByRole("button", { name: "Recent conflict task Visible conflict choices", exact: true });
  await expect(chip).toBeVisible();

  // The panel starts closed. A conflict opens Tasks and moves keyboard focus to
  // the least destructive choice.
  await chip.click();
  const dialog = page.getByRole("dialog", { name: "A draft already exists in this project. Choose how to apply the template.", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Keep current draft" })).toBeFocused();
  await dialog.getByRole("button", { name: "Keep current draft" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(composer).toHaveValue("KEEP THIS DRAFT");

  // The same affordance works when Files is the currently selected mode, and
  // issue 1's late-edit guarantee applies to this chip path too.
  await mode(page, "files");
  await chip.click();
  await expect(dialog).toBeVisible();
  await composer.fill("KEEP THIS DRAFT PLUS LATE EDIT");
  await dialog.getByRole("button", { name: "Append task prompt" }).click();
  await expect(composer).toHaveValue("KEEP THIS DRAFT PLUS LATE EDIT\n\nTASK TEXT");

  const removed = await request.delete(`/api/saved-tasks/${task.id}`, { data: { revision: task.revision } });
  expect(removed.ok()).toBe(true);
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

test("pinned outputs use real files, open in place, and persist shelf metadata", async ({ page, request }) => {
  const cwd = path.join(WORK_ROOT, `outputs-${randomUUID()}`); await mkdir(cwd, { recursive: true });
  const output = path.join(cwd, "report.md"); await writeFile(output, "# Deliverable\nVerified output content\n");
  const id = randomUUID(); const timestamp = new Date().toISOString();
  const dir = path.join(SESSIONS_DIR, `--${cwd.replaceAll(path.sep, "-")}--`); await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${timestamp.replaceAll(":", "-")}_${id}.jsonl`), [
    { type: "session", version: 3, id, timestamp, cwd },
    { type: "message", id: "user0001", parentId: null, timestamp, message: { role: "user", content: "Make a report", timestamp: Date.now() } },
    { type: "message", id: "asst0001", parentId: "user0001", timestamp, message: { role: "assistant", content: [{ type: "text", text: `[Report](${output})` }], provider: "test", model: "offline", api: "openai-completions", stopReason: "stop", timestamp: Date.now(), usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } } },
  ].map(e => JSON.stringify(e)).join("\n") + "\n");
  await expect.poll(async () => (await (await request.get("/api/sessions")).json()).sessions.some((s: { id: string }) => s.id === id), { timeout: 60000 }).toBe(true);
  await page.goto(`/?session=${id}`);
  await expect(page.getByText("Make a report", { exact: true }).first()).toBeVisible();

  // Nothing is pinned yet, so Files shows no Pinned section at all — no empty
  // shelf, no filters.
  await mode(page, "files");
  await expect(page.getByRole("region", { name: "Pinned", exact: true })).toHaveCount(0);

  // Pinning from the transcript reveals the section, expanded, in Files.
  await page.getByRole("button", { name: "Pin", exact: true }).click();
  const pinned = section(page, "Pinned");
  await expect(pinned.toggle).toHaveAttribute("aria-expanded", "true");
  await expect(pinned.toggle).toContainText("1");
  await expect(pinned.region.getByText("report.md", { exact: true })).toBeVisible();

  // Renaming the label persists through the API, not just in the view.
  await pinned.region.getByLabel("More actions", { exact: true }).click();
  await pinned.region.getByRole("button", { name: "Rename label", exact: true }).click();
  await pinned.region.getByLabel("Label", { exact: true }).fill("Final report");
  await pinned.region.getByRole("button", { name: "Save", exact: true }).click();
  await expect(pinned.region.getByText("Final report", { exact: true })).toBeVisible();

  // Open stays inside Files: a file tab, no panel switch and no way back needed.
  await pinned.region.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.locator("#file-panel").getByText("Verified output content", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to outputs" })).toHaveCount(0);
  await expect(pinned.region).toBeVisible();

  // Hide and restore still work from the section's overflow.
  await pinned.region.getByLabel("More actions", { exact: true }).click();
  await pinned.region.getByRole("button", { name: "Hide from shelf" }).click();
  await expect(pinned.region.getByRole("button", { name: "Open", exact: true })).toHaveCount(0);
  await pinned.region.getByLabel("Show hidden").check();
  await pinned.region.getByLabel("More actions", { exact: true }).click();
  await expect(pinned.region.getByRole("button", { name: "Restore", exact: true })).toBeVisible();

  expect(await readFile(output, "utf8")).toContain("Verified output content");
  const response = await request.get(`/api/sessions/${id}/outputs`); expect(response.ok()).toBe(true);
  const item = (await response.json()).items[0];
  expect(item.hidden).toBe(true); expect(item.pinned).toBe(true); expect(item.label).toBe("Final report");

  // Unpinning empties the shelf, and the section disappears with it.
  await pinned.region.getByRole("button", { name: "Unpin", exact: true }).click();
  await expect(page.getByRole("region", { name: "Pinned", exact: true })).toHaveCount(0);

  // Transcript/file pin actions intentionally have no shelf revision. They
  // must still atomically repin metadata retained by the unpin operation.
  await page.getByRole("button", { name: "Pin", exact: true }).click();
  await expect(pinned.region.getByText("Final report", { exact: true })).toBeVisible();
  const repinned = (await (await request.get(`/api/sessions/${id}/outputs`)).json()).items[0];
  expect(repinned.pinned).toBe(true);
  expect(repinned.revision).toBeGreaterThan(item.revision);
  for (const edit of [{ label: "stale rename" }, { hidden: false }, { pinned: false }]) {
    const rejected = await request.patch(`/api/sessions/${id}/outputs`, { data: { path: output, revision: item.revision, ...edit } });
    expect(rejected.status()).toBe(409);
  }
});

test("branch creation and real Bash activity work without a model", async ({ page, request }) => {
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
  const composer = page.getByRole("textbox", { name: "Message", exact: true });
  await composer.fill("!sleep 20"); await composer.press("Enter");
  await mode(page, "activity");
  const panel = page.getByRole("region", { name: "Activity", exact: true });
  await expect(panel.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(panel.getByText("Stopped", { exact: true }).first()).toBeVisible();
  const activity = await (await request.get("/api/agent/activity")).json();
  expect(activity.runs.some((r: { cwd: string; status: string }) => r.cwd === cwd && r.status === "stopped")).toBe(true);
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
  await mode(page, "tasks");
  await expect(page.getByRole("region", { name: "Saved Tasks", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("panel-desktop.png") });
  await page.getByRole("button", { name: "Close panel", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(branch).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const narrowBranch = (await branch.boundingBox())!;
  const narrowModel = (await controls.getByRole("button", { name: "Example model", exact: true }).boundingBox())!;
  expect(narrowModel.x).toBeGreaterThanOrEqual(narrowBranch.x + narrowBranch.width);
  await page.screenshot({ path: testInfo.outputPath("composer-phone.png") });
  await mode(page, "tasks");
  await page.screenshot({ path: testInfo.outputPath("panel-phone.png") });
});


test("the Changes section expands patches inline without opening file tabs", async ({ page }, testInfo) => {
  const cwd = await realpath(await project(page, true));
  await writeFile(path.join(cwd, "readme.md"), "# Updated\nNew review content\n");
  await writeFile(path.join(cwd, "second.txt"), "Second file content\n");
  await page.goto(`/?cwd=${encodeURIComponent(cwd)}`);
  await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeEditable();
  await mode(page, "files");
  await expect(page.locator("#file-panel").getByRole("tab", { name: "Diff" })).toHaveCount(0);
  const { region: review, toggle } = section(page, "Changes");
  // Collapsed by default, but the badge already counts the changed files.
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toContainText("2");
  await toggle.click();
  const first = review.getByRole("button", { name: /readme\.md/ });
  const second = review.getByRole("button", { name: /second\.txt/ });
  await expect(first).toHaveAttribute("aria-expanded", "false");
  await first.click();
  await expect(first).toHaveAttribute("aria-expanded", "true");
  await expect(review.getByRole("region", { name: "readme.md", exact: true })).toContainText("New review content");
  await expect(review.getByRole("region", { name: "readme.md", exact: true })).toContainText("# Base");
  await second.click();
  await expect(review.getByRole("region", { name: "second.txt", exact: true })).toContainText("Second file content");
  // Patches read in place: no file tab was opened behind the section.
  await expect(page.locator("#file-panel").getByText("No file open", { exact: true })).toBeVisible();
  await first.click();
  await expect(review.getByRole("region", { name: "readme.md", exact: true })).toHaveCount(0);
  await expect(second).toHaveAttribute("aria-expanded", "true");
  await writeFile(path.join(cwd, "second.txt"), "Refreshed content\n");
  await review.getByRole("button", { name: "Refresh changes", exact: true }).click();
  await expect(review.getByRole("region", { name: "second.txt", exact: true })).toContainText("Refreshed content");
  await page.screenshot({ path: testInfo.outputPath("inline-diff.png") });
  // Collapsing hides the patches but keeps the badge.
  await toggle.click();
  await expect(review.getByRole("button", { name: /second\.txt/ })).toHaveCount(0);
  await expect(toggle).toContainText("2");
});

test("a clean Changes section can refresh after an external edit", async ({ page, request }) => {
  const cwd = await realpath(await project(page, true));
  await page.goto(`/?cwd=${encodeURIComponent(cwd)}`);
  await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeEditable();
  await mode(page, "files");
  const { region: changes, toggle } = section(page, "Changes");
  await toggle.click();
  await expect(changes.getByText("No changed files", { exact: true })).toBeVisible();
  const refresh = changes.getByRole("button", { name: "Refresh changes", exact: true });
  await expect(refresh).toBeVisible();

  await writeFile(path.join(cwd, "readme.md"), "# Externally updated\n");
  await expect.poll(async () => {
    const response = await request.get(`/api/git/status?cwd=${encodeURIComponent(cwd)}`);
    return (await response.json()).files?.length;
  }).toBe(1);
  // No session/cwd change is necessary: the clean-state control revalidates
  // both status and any patches through the normal cache invalidation path.
  await refresh.click();
  await expect(toggle).toContainText("1");
  await expect(changes.getByRole("button", { name: /readme\.md/ })).toBeVisible();
});

test("transcript search jumps to an inactive branch, reveals output, and preserves the draft", async ({ page, request }) => {
  const cwd = path.join(WORK_ROOT, `search-${randomUUID()}`); await mkdir(cwd, { recursive: true });
  const id = randomUUID(); const timestamp = new Date().toISOString();
  const dir = path.join(SESSIONS_DIR, `--${cwd.replaceAll(path.sep, "-")}--`); await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${timestamp.replaceAll(":", "-")}_${id}.jsonl`);
  const assistant = { provider: "test", model: "offline", api: "openai-completions", stopReason: "stop", timestamp: Date.now(), usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
  const entries = [
    { type: "session", version: 3, id, timestamp, cwd },
    { type: "message", id: "user0001", parentId: null, timestamp, message: { role: "user", content: "Investigate authentication", timestamp: Date.now() } },
    { type: "message", id: "answer01", parentId: "user0001", timestamp, message: { ...assistant, role: "assistant", content: [{ type: "text", text: "Check the token" }] } },
    { type: "message", id: "user0002", parentId: "answer01", timestamp, message: { role: "user", content: "Run the authentication check", timestamp: Date.now() } },
    { type: "message", id: "tool0001", parentId: "user0002", timestamp, message: { ...assistant, role: "assistant", content: [{ type: "toolCall", id: "call0001", name: "bash", arguments: { command: "curl auth.example" } }] } },
    { type: "message", id: "result01", parentId: "tool0001", timestamp, message: { role: "toolResult", toolCallId: "call0001", toolName: "bash", content: [{ type: "text", text: "OAuth sentinel: token rejected" }], isError: true, timestamp: Date.now() } },
    { type: "message", id: "answer02", parentId: "user0002", timestamp, message: { ...assistant, role: "assistant", content: [{ type: "text", text: "Current branch answer" }] } },
  ];
  await writeFile(file, entries.map(e => JSON.stringify(e)).join("\n") + "\n");
  await expect.poll(async () => (await (await request.get("/api/sessions")).json()).sessions.some((s: { id: string }) => s.id === id), { timeout: 60000 }).toBe(true);
  const mutations: string[] = [];
  page.on("request", req => { if (req.method() === "POST" && req.url().includes("/api/agent/")) { const type = req.postDataJSON()?.type; if (["navigate_tree", "prompt"].includes(type)) mutations.push(type); } });
  // Opening a session loads its transcript without booting the agent runtime;
  // wait for that session detail load before counting mutations.
  const startup = page.waitForResponse(response => response.url().includes(`/api/sessions/${id}?`) && response.request().method() === "GET");
  await page.goto(`/?session=${id}`);
  await startup;
  await expect(page.getByText("Current branch answer", { exact: true })).toBeVisible();
  const composer = page.getByRole("textbox", { name: "Message", exact: true }); await composer.fill("Preserve my draft");
  const before = await readFile(file, "utf8");
  await mode(page, "search");
  const panel = page.getByRole("region", { name: "Search transcripts", exact: true });
  await panel.getByRole("textbox", { name: "Search transcripts", exact: true }).fill('"OAuth sentinel"');
  await panel.getByRole("button", { name: "Search", exact: true }).click();
  await panel.locator(".transcript-hit").filter({ hasText: "OAuth sentinel" }).click();
  await expect(page.getByText("Historical search result · read-only", { exact: true })).toBeVisible();
  await expect(page.locator('[data-entry-id="tool0001"] .transcript-exact-match mark')).toHaveText("OAuth sentinel");
  // The entry wrapper and the message inside it both carry data-entry-id.
  await expect(page.locator('[data-entry-id="tool0001"]').first()).toContainText("token rejected");
  await expect(page.getByText("Current branch answer", { exact: true })).toHaveCount(0);
  await expect(page.getByTitle("Edit from here — branches within this session", { exact: true })).toHaveCount(0);
  await expect(page.getByTitle("New session — creates an independent copy from here", { exact: true })).toHaveCount(0);
  expect(await readFile(file, "utf8")).toBe(before);
  expect(mutations).toEqual([]);
  await page.getByRole("button", { name: "Return to conversation", exact: true }).click();
  await expect(page.getByText("Current branch answer", { exact: true })).toBeVisible();
  await expect(composer).toHaveValue("Preserve my draft");
});
