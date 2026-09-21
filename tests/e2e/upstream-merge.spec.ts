import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { WORK_ROOT } from "./sandbox";

test("merged shell keeps chat below its header and supports terminal tabs and paginated files", async ({ page, request }) => {
  const cwd = path.join(WORK_ROOT, `merge-${randomUUID()}`);
  await mkdir(cwd, { recursive: true });
  await writeFile(path.join(cwd, "large.txt"), "pagination fixture\n".repeat(70000));
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`/?cwd=${encodeURIComponent(cwd)}`);
  await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeEditable();
  const header = await page.locator(".app-topbar").boundingBox();
  const chat = await page.locator(".chat-window").boundingBox();
  expect(header).toBeTruthy(); expect(chat).toBeTruthy();
  expect(Math.abs(chat!.x - header!.x)).toBeLessThan(2);
  expect(chat!.y).toBeGreaterThanOrEqual(header!.y + header!.height - 1);
  expect(chat!.height).toBeGreaterThan(400);

  await page.locator(".right-panel-toggle-button").click();
  const panel = page.locator("#file-panel");
  await panel.getByRole("button", { name: "Open workspace terminal", exact: true }).click();
  await expect(page.locator(".terminal-panel:visible .is-ready")).toBeVisible();
  await page.locator(".terminal-panel:visible .xterm-helper-textarea").focus();
  await page.keyboard.type("printf 'MERGE_TERMINAL_%s\\n' OK");
  await page.keyboard.press("Enter");
  await expect(page.locator(".terminal-panel:visible .xterm-rows")).toContainText("MERGE_TERMINAL_OK");

  await panel.getByText("large.txt", { exact: true }).click();
  await expect(page.locator(".file-viewer-load-more")).toBeVisible();
  await page.getByRole("tab", { name: /Terminal:/ }).click();
  await expect(page.locator(".terminal-panel:visible .xterm-rows")).toContainText("MERGE_TERMINAL_OK");
  await page.reload();
  await expect(page.locator(".terminal-panel:visible .is-ready")).toBeVisible();
  await expect(page.locator(".terminal-panel:visible .xterm-rows")).toContainText("MERGE_TERMINAL_OK");

  await page.screenshot({ path: test.info().outputPath("merged-workbench.png") });
  const tabs = await page.evaluate(() => JSON.parse(sessionStorage.getItem("pi-web:terminal-tabs") ?? "{}").tabs ?? []);
  for (const tab of tabs) await request.delete(`/api/terminal/${tab.id}`);
  expect(errors).toEqual([]);
});
