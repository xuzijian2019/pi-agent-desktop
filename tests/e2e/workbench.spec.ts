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
  await expect(page.getByPlaceholder("Message…", { exact: false })).toBeEditable();
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
  return { region, toggle: region.getByRole("button", { name: new RegExp(`^${name}`) }) };
}

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
  const composer = page.getByPlaceholder("Message…", { exact: false });
  await expect(composer).toHaveValue("Review this project carefully.");
  await page.reload();
  await expect(composer).toHaveValue("Review this project carefully.");
  await expect(panel).toBeVisible();
  await composer.fill("Keep this draft");
  await panel.getByRole("button", { name: "Use", exact: true }).click();
  await page.getByRole("button", { name: "Append task prompt" }).click();
  await expect(composer).toHaveValue("Keep this draft\n\nReview this project carefully.");
});

test("the composer send preview keeps the reference snapshot and goes stale after edits", async ({ page, request }) => {
  await project(page);
  const input = page.getByPlaceholder("Message…", { exact: false });
  await input.fill("!printf context-seed"); await input.press("Enter");
  await expect(page).toHaveURL(/session=/);
  const sessionId = new URL(page.url()).searchParams.get("session");
  await expect.poll(async () => (await (await request.get(`/api/agent/${sessionId}`)).json()).state?.isBashRunning).toBe(false);
  const id = randomUUID(); let text = "Original reference snapshot";
  await page.route("**/api/sessions", route => route.fulfill({ json: { sessions: [{ id, name: "Reference", firstMessage: "Reference", cwd: WORK_ROOT, created: new Date().toISOString(), modified: new Date().toISOString(), messageCount: 1 }] } }));
  await page.route(`**/api/sessions/${id}/reference?*`, route => route.fulfill({ json: { reference: text, revision: text, entries: [], leafId: "leaf" } }));
  const composer = page.getByPlaceholder("Message…", { exact: false }); await composer.fill('Use #"Reference"');
  // The preview is a composer chip now, not a right-panel mode.
  await expect(page.locator("#file-panel").getByRole("tab", { name: "Context" })).toHaveCount(0);
  const chip = page.getByRole("button", { name: "Preview outgoing message", exact: true });
  await chip.click();
  const panel = page.getByRole("dialog", { name: "Preview outgoing message", exact: true });
  // It floats above the composer, inside its width.
  const panelBox = (await panel.boundingBox())!;
  const composerBox = (await page.locator(".chat-composer").boundingBox())!;
  expect(panelBox.y + panelBox.height).toBeLessThanOrEqual(composerBox.y + 2);
  expect(panelBox.x).toBeGreaterThanOrEqual(composerBox.x);
  expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(composerBox.x + composerBox.width);
  await expect(panel.locator("details[open]").filter({ has: page.getByText("Final outgoing text", { exact: true }) }).locator("pre")).toContainText("Original reference snapshot");
  text = "New source revision";
  // Capture the actual command POST; no model call reaches the server.
  let sent: { message?: string } | undefined;
  await page.route(`**/api/agent/${sessionId}`, route => {
    if (route.request().method() === "POST" && route.request().postDataJSON().type === "prompt") {
      sent = route.request().postDataJSON(); return route.fulfill({ json: { success: true } });
    }
    return route.continue();
  });
  await composer.press("Enter");
  await expect.poll(() => sent?.message).toBe("Use Original reference snapshot");
  await composer.fill('Changed #"Reference"');
  await expect(panel.getByText("Out of date — refresh before inspecting")).toBeVisible();
  await panel.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(panel.locator("details[open]").filter({ has: page.getByText("Final outgoing text", { exact: true }) }).locator("pre")).toContainText("Changed New source revision");
  // Escape closes it without disturbing the draft.
  await panel.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(composer).toHaveValue('Changed #"Reference"');
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
});

test("branch creation and real Bash activity work without a model", async ({ page, request }) => {
  const cwd = await project(page, true);
  await page.getByRole("button", { name: "⑂ main", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Git branch", exact: true });
  await expect(dialog).toBeVisible();
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
  const composer = page.getByPlaceholder("Message…", { exact: false });
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
  await expect(controls.getByRole("button", { name: "Preview outgoing message", exact: true })).toHaveCount(1);
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
  await expect(page.getByPlaceholder("Message…", { exact: false })).toBeEditable();
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
  const startup = page.waitForResponse(response => response.url().endsWith(`/api/agent/${id}`) && response.request().method() === "POST" && response.request().postDataJSON()?.type === "get_tools");
  await page.goto(`/?session=${id}`);
  await startup; // Exclude normal runtime initialization from the search mutation check.
  await expect(page.getByText("Current branch answer", { exact: true })).toBeVisible();
  const composer = page.getByPlaceholder("Message…", { exact: false }); await composer.fill("Preserve my draft");
  const before = await readFile(file, "utf8");
  await mode(page, "search");
  const panel = page.getByRole("region", { name: "Search transcripts", exact: true });
  await panel.getByRole("textbox", { name: "Search transcripts", exact: true }).fill('"OAuth sentinel"');
  await panel.getByRole("button", { name: "Search", exact: true }).click();
  await panel.locator(".transcript-hit").filter({ hasText: "OAuth sentinel" }).click();
  await expect(page.getByText("Historical search result · read-only", { exact: true })).toBeVisible();
  await expect(page.locator('[data-entry-id="tool0001"] .transcript-exact-match mark')).toHaveText("OAuth sentinel");
  await expect(page.locator('[data-entry-id="tool0001"]')).toContainText("token rejected");
  await expect(page.getByText("Current branch answer", { exact: true })).toHaveCount(0);
  await expect(page.getByTitle("Edit from here — branches within this session", { exact: true })).toHaveCount(0);
  await expect(page.getByTitle("New session — creates an independent copy from here", { exact: true })).toHaveCount(0);
  expect(await readFile(file, "utf8")).toBe(before);
  expect(mutations).toEqual([]);
  await page.getByRole("button", { name: "Return to conversation", exact: true }).click();
  await expect(page.getByText("Current branch answer", { exact: true })).toBeVisible();
  await expect(composer).toHaveValue("Preserve my draft");
});
