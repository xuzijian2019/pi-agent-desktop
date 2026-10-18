import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { SESSIONS_DIR, WORK_ROOT } from "./sandbox";

test("direct Scheduled reload preserves its URL and selecting its restored session leaves the page", async ({ page, request }) => {
  const id = randomUUID();
  const cwd = path.join(WORK_ROOT, `scheduled-workspace-${id}`);
  await mkdir(cwd, { recursive: true });
  const dir = path.join(SESSIONS_DIR, `--${cwd.replace(/^\//, "").replaceAll("/", "-")}--`);
  await mkdir(dir, { recursive: true });
  const timestamp = new Date().toISOString();
  const name = `Scheduled workspace ${id}`;
  const message = `Remembered conversation ${id}`;
  await writeFile(path.join(dir, `${timestamp.replaceAll(":", "-")}_${id}.jsonl`), [
    { type: "session", version: 3, id, cwd, timestamp },
    { type: "session_info", id: "name", parentId: null, timestamp, name },
    { type: "message", id: "message", parentId: "name", timestamp, message: { role: "user", content: message } },
  ].map((entry) => JSON.stringify(entry)).join("\n") + "\n");
  await expect.poll(async () => {
    const response = await request.get("/api/sessions?force=1");
    const data = await response.json();
    return data.sessions.some((session: { id: string }) => session.id === id);
  }).toBe(true);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`/?session=${id}`);
  await expect(page.locator(".chat-window")).toContainText(message);
  await page.goto("/?view=scheduled");
  await expect(page.locator(".scheduled-view")).toBeVisible();
  await expect(page.locator(".chat-window")).toContainText(message);
  await expect(page).toHaveURL(/\?view=scheduled$/);
  await page.reload();
  await expect(page.locator(".scheduled-view")).toBeVisible();
  await expect(page.locator(".chat-window")).toContainText(message);
  await expect(page).toHaveURL(/\?view=scheduled$/);
  await page.locator(".sidebar-project-tree-group").getByText(name, { exact: true }).click();
  await expect(page.locator(".scheduled-view")).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`\\?session=${id}$`));
  await expect(page.locator(".chat-window")).toContainText(message);
  expect(errors).toEqual([]);
});

test("empty workspaces open the file tree and keep their mobile exit on Scheduled", async ({ page }) => {
  const cwd = path.join(WORK_ROOT, `workspace-${randomUUID()}`);
  await mkdir(cwd, { recursive: true });
  await writeFile(path.join(cwd, "workspace.txt"), "WORKSPACE_TREE_FIXTURE");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/?cwd=${encodeURIComponent(cwd)}`);
  await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeEditable();
  const toggle = page.locator(".right-panel-toggle-button");
  await expect(toggle).toHaveCount(1);
  await expect(toggle).toHaveAttribute("aria-label", "Show workspace");
  await toggle.click();
  const panel = page.locator("#file-panel");
  await expect(panel.locator("#file-tree-panel")).toBeVisible();
  await expect(panel.getByText("workspace.txt", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Hide workspace", exact: true }).click();
  await page.getByRole("button", { name: "Show sidebar", exact: true }).click();
  await page.locator(".sidebar-scheduled-row").click();
  await expect(page.locator(".scheduled-view")).toBeVisible();
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "Hide workspace", exact: true }).click();
  await expect(panel).toBeHidden();
  await expect(page.locator(".scheduled-view")).toBeVisible();
  await expect(page).toHaveURL(/\?view=scheduled$/);
  await page.screenshot({ path: test.info().outputPath("mobile-scheduled-workspace-exit.png") });
});
