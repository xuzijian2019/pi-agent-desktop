import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { SESSIONS_DIR, WORK_ROOT } from "./sandbox";

async function fixture(cwd: string, name: string) {
  await mkdir(cwd, { recursive: true });
  const git = (...args: string[]) => execFileSync("git", ["-C", cwd, ...args], { stdio: "pipe" });
  git("init", "-b", "main");
  git("config", "user.name", "E2E");
  git("config", "user.email", "e2e@example.com");
  await writeFile(path.join(cwd, "README.md"), `# ${name}\n`);
  git("add", "."); git("commit", "-m", "fixture");
  const id = randomUUID();
  const timestamp = new Date().toISOString();
  const dir = path.join(SESSIONS_DIR, `--${cwd.replace(/^\//, "").replaceAll("/", "-")}--`);
  await mkdir(dir, { recursive: true });
  const messageId = randomUUID();
  await writeFile(path.join(dir, `${timestamp.replaceAll(":", "-")}_${id}.jsonl`), [
    { type: "session", version: 3, id, cwd, timestamp },
    { type: "message", id: messageId, parentId: null, timestamp, message: { role: "user", content: name, timestamp: Date.now() } },
    { type: "session_info", id: randomUUID(), parentId: messageId, timestamp, name },
  ].map(entry => JSON.stringify(entry)).join("\n") + "\n");
  return id;
}

async function refresh(request: APIRequestContext, id: string) {
  await expect.poll(async () => {
    const data = await (await request.get("/api/sessions?force=1")).json();
    return data.sessions.some((session: { id: string }) => session.id === id);
  }).toBe(true);
}

function projectGroup(page: Page, cwd: string) {
  return page.locator(".sidebar-project-tree-group").filter({ has: page.locator(`button[aria-label=${JSON.stringify(cwd)}]`) });
}

async function openWorktrees(page: Page, cwd: string) {
  const group = projectGroup(page, cwd);
  // A group's center can be its child session. Only the project header owns
  // the hover-only actions, so enter that actual row before clicking them.
  const row = group.locator(":scope > .sidebar-project-tree-row");
  await row.hover();
  const actions = row.locator(".sidebar-project-tree-row-actions");
  await expect(actions).toHaveCSS("opacity", "1");
  await expect(actions).toHaveCSS("pointer-events", "auto");
  const more = actions.getByRole("button", { name: "Project actions", exact: true });
  await expect(more).toBeInViewport();
  // Check the real hit target, including branch-text/overlay stacking. Never
  // bypass this with force:true: an overlapped action would be unusable too.
  await expect.poll(() => more.evaluate((button) => {
    const rect = button.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return hit !== null && button.contains(hit);
  })).toBe(true);
  await more.click();
  await expect(page.getByRole("menuitem", { name: "Switch branch", exact: true })).toHaveCount(0);
  await page.getByRole("menuitem", { name: "Worktrees…", exact: true }).click();
  const menu = page.locator(".sidebar-project-context-menu");
  await expect(menu.getByRole("menuitem", { name: "New worktree…", exact: true })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Fetch from remote", exact: true })).toBeVisible();
  return menu;
}

test("cross-project worktree actions keep project identity and honor cancel and confirmation", async ({ page, request }, testInfo) => {
  const root = path.join(realpathSync(WORK_ROOT), `merge-073-${randomUUID()}`);
  // Distinct basenames: the sidebar shows only the project basename, so two
  // repos both named "repository" would render identically and the tree could
  // not tell the two projects apart. The real path matters for the same
  // reason: the server resolves symlinks, so on macOS os.tmpdir()'s /var/…
  // becomes /private/var/… in the tree's aria-labels.
  const first = path.join(root, "alpha-repository");
  const second = path.join(root, "beta-repository");
  const firstId = await fixture(first, "Alpha merge review");
  const secondId = await fixture(second, "Beta merge review");
  await refresh(request, secondId);
  await page.goto(`/?session=${firstId}`);
  await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeEditable();
  await expect(projectGroup(page, first).locator(".sidebar-project-tree-name")).toContainText("alpha");
  await expect(projectGroup(page, second).locator(".sidebar-project-tree-name")).toContainText("beta");
  await page.locator(".sidebar-project-tree-header").filter({ has: page.getByRole("button", { name: "Projects menu", exact: true }) }).hover();
  await page.getByRole("button", { name: "Projects menu", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "Session timeline", exact: true }).click();
  await expect(page.locator(".sidebar-project-timeline")).toContainText("Beta merge review");
  await page.locator(".sidebar-project-tree-header").filter({ has: page.getByRole("button", { name: "Projects menu", exact: true }) }).hover();
  await page.getByRole("button", { name: "Projects menu", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "Group by project", exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("073-project-tree.png") });

  let createRequests = 0;
  page.on("request", request => {
    if (new URL(request.url()).pathname === "/api/worktrees" && request.method() === "POST") createRequests += 1;
  });
  let menu = await openWorktrees(page, second);
  await menu.getByRole("menuitem", { name: "New worktree…", exact: true }).click();
  await menu.getByLabel("branch name", { exact: true }).fill("review-cancelled");
  await menu.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(menu.getByRole("menuitem", { name: "New worktree…", exact: true })).toBeVisible();
  expect(createRequests).toBe(0);

  await menu.getByRole("menuitem", { name: "New worktree…", exact: true }).click();
  await menu.getByLabel("branch name", { exact: true }).fill("review-worktree");
  const createResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/api/worktrees" && response.request().method() === "POST");
  await menu.getByRole("button", { name: "Create", exact: true }).click();
  const response = await createResponse;
  expect(response.ok()).toBe(true);
  const worktree = (await response.json()).path as string;
  await expect(page.locator(".chat-project-context")).toHaveAttribute("aria-label", `Current project: ${worktree}`);
  await expect(projectGroup(page, second)).toHaveClass(/is-active/);
  await expect(projectGroup(page, first)).not.toHaveClass(/is-active/);
  expect(createRequests).toBe(1);

  menu = await openWorktrees(page, second);
  await menu.getByRole("menuitem", { name: /main/ }).click();
  await expect(page.locator(".chat-project-context")).toHaveAttribute("aria-label", `Current project: ${second}`);
  menu = await openWorktrees(page, second);
  const remove = menu.locator(".worktree-remove-button");
  await remove.click();
  const confirm = menu.locator(".sidebar-project-context-menu-confirm");
  await expect(confirm).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("073-worktree-remove-confirmation.png") });
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await (await request.get(`/api/worktrees?cwd=${encodeURIComponent(second)}`)).json()).worktrees.some((entry: { path: string }) => entry.path === worktree)).toBe(true);
  await remove.click();
  await confirm.getByRole("button", { name: "Remove", exact: true }).click();
  await expect.poll(async () => (await (await request.get(`/api/worktrees?cwd=${encodeURIComponent(second)}`)).json()).worktrees.some((entry: { path: string }) => entry.path === worktree)).toBe(false);
  await page.getByRole("textbox", { name: "Message", exact: true }).click();
  await expect(menu).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath("073-worktree-removed.png") });
});
