import path from "node:path";
import { mkdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { WORK_ROOT } from "./sandbox";

// Render the real npm run web app with a synthetic read-only session catalog.
// No agent is started: this checks grouping, folding and long-path popup UI.
test("upstream sidebar: forks stay independent, child folds persist and paths dismiss", async ({ page }) => {
  const cwd = path.join(WORK_ROOT, "upstream-085-long-project-directory-for-path-preview");
  await mkdir(cwd, { recursive: true });
  const base = { cwd, projectRoot: cwd, projectKey: cwd, workspaceKind: "project", created: "2026-11-15T00:00:00Z", modified: "2026-11-15T00:00:00Z", messageCount: 1, firstMessage: "UI fixture" };
  const sessions = [
    { ...base, id: "merge-085-parent", path: "fixture-parent", name: "Parent session with long descriptive name" },
    { ...base, id: "merge-085-fork", path: "fixture-fork", name: "Independent fork", parentSessionId: "merge-085-parent", relation: { kind: "fork", originSessionId: "merge-085-parent" } },
    { ...base, id: "merge-085-child", path: "fixture-child", name: "Nested subagent", parentSessionId: "merge-085-parent", relation: { kind: "subagent", parentSessionId: "merge-085-parent", profile: "research", description: "UI fixture", status: "completed" } },
  ];
  // Catalog reads only: no provider access or agent starts in this visual fixture.
  await page.route(/\/api\/models(?:\?.*)?$/, route => route.fulfill({ json: {
    models: { "fixture-ui:fixture": "Offline fixture" },
    modelList: [{ id: "fixture", name: "Offline fixture", provider: "fixture-ui", providerName: "Offline fixture provider" }],
    defaultModel: { provider: "fixture-ui", modelId: "fixture" },
  } }));
  await page.route("**/api/sessions?*", route => route.fulfill({ json: { sessions } }));
  await page.route("**/api/sessions", route => route.fulfill({ json: { sessions } }));
  await page.addInitScript(() => { localStorage.setItem("pi-locale", "en"); localStorage.setItem("pi-theme", "light"); });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  // data-project-root belongs to the group itself.
  const project = page.locator(`[data-project-root="${cwd}"]`);
  const header = project.locator(".sidebar-project-tree-row-main");
  await expect(header).toBeVisible();
  if (await header.getAttribute("aria-expanded") === "false") await header.click();
  const parent = project.locator(".session-item").filter({ has: page.locator('a[href="?session=merge-085-parent"]') });
  const fork = project.locator('a[href="?session=merge-085-fork"]');
  const child = project.locator('a[href="?session=merge-085-child"]');
  await expect(fork).toBeVisible();
  await expect(fork).toHaveAttribute("title", /Forked from/);
  await expect(child).toBeHidden();
  const fold = parent.locator(".session-item-children-toggle");
  await expect(fold).toHaveAttribute("aria-expanded", "false");
  await fold.click();
  await expect(child).toBeVisible();
  await page.reload();
  await expect(child).toBeVisible();
  await fold.click();
  await expect(child).toBeHidden();
  await expect(fork).toBeVisible();
  for (const theme of ["light", "dark"]) {
    await page.evaluate(theme => { document.documentElement.classList.toggle("dark", theme === "dark"); document.documentElement.setAttribute("data-theme", theme); }, theme);
    // Clicking dismisses the hint while the pointer remains on the header.
    // Re-enter it for each theme so the real mouseenter timer runs again.
    await page.mouse.move(1400, 850);
    await header.hover();
    const hint = page.locator(".sidebar-project-path-hint");
    await expect(hint).toBeVisible();
    await expect(hint).toContainText("upstream-085-long-project-directory");
    await page.evaluate(async () => { await document.fonts.ready; });
    await page.screenshot({ path: test.info().outputPath(`sidebar-fold-path-${theme}.png`), animations: "disabled" });
    await header.click();
    await expect(hint).toBeHidden();
    await header.click();
  }
});
