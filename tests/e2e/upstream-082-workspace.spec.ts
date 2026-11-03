import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { SESSIONS_DIR, WORK_ROOT } from "./sandbox";

async function recordedSession(request: APIRequestContext) {
  const id = randomUUID();
  const cwd = path.join(WORK_ROOT, `archive-tasks-long-project-name-${id}`);
  await mkdir(cwd, { recursive: true });
  const dir = path.join(SESSIONS_DIR, `--${cwd.replace(/^\//, "").replaceAll("/", "-")}--`);
  await mkdir(dir, { recursive: true });
  const timestamp = new Date().toISOString();
  const name = `Long task title preserving archived conversation and workspace navigation ${id}`;
  const message = `Recorded conversation ${id}`;
  await writeFile(path.join(dir, `${timestamp.replaceAll(":", "-")}_${id}.jsonl`), [
    { type: "session", version: 3, id, cwd, timestamp },
    { type: "session_info", id: "name", parentId: null, timestamp, name },
    { type: "message", id: "message", parentId: "name", timestamp, message: { role: "user", content: message } },
  ].map(entry => JSON.stringify(entry)).join("\n") + "\n");
  await expect.poll(async () => {
    const response = await request.get("/api/sessions?force=1");
    const data = await response.json();
    return data.sessions.some((session: { id: string }) => session.id === id);
  }).toBe(true);
  return { id, cwd, name, message };
}

async function showSidebar(page: Page) {
  const sidebar = page.locator("#session-sidebar");
  await expect(sidebar).not.toHaveClass(/sidebar-mobile-pending/);
  if (await sidebar.evaluate(el => el.classList.contains("sidebar-closed"))) {
    // The off-canvas sidebar retains its own toggle; use the visible topbar control.
    const opener = page.locator(".app-topbar").getByRole("button", { name: "Show sidebar", exact: true });
    await expect(opener).toHaveCount(1);
    await expect(opener).toBeVisible();
    await opener.click();
  }
  await expect(sidebar).toHaveClass(/sidebar-open/);
  await expect(sidebar).toHaveJSProperty("inert", false);
  await expect.poll(() => sidebar.evaluate(el => el.getAnimations().every(a => !a.pending && a.playState !== "running"))).toBe(true);
}

async function settingsSmoke(page: Page, theme: "light" | "dark", width: number) {
  const writes: string[] = [];
  const onRequest = (request: import("@playwright/test").Request) => {
    if (/\/api\/(relay|remote-access|push)(?:[/?]|$)/.test(request.url()) && !["GET", "HEAD"].includes(request.method())) {
      writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
    }
  };
  page.on("request", onRequest);
  await page.keyboard.press("Control+,");
  const dialog = page.locator(".settings-dialog-surface");
  await expect(dialog).toBeVisible();
  if (width < 640) {
    await dialog.locator(".settings-mobile-section-picker").click();
    await page.getByRole("option", { name: "General", exact: true }).click();
  } else {
    await dialog.locator(".settings-section-tab").filter({ hasText: /^General$/ }).click();
  }
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  const autoTitle = dialog.getByRole("switch", { name: "Name new sessions automatically", exact: true });
  await expect(autoTitle).toHaveCount(1);
  await expect(dialog.getByRole("switch", { name: "Name sessions automatically", exact: true })).toHaveCount(0);
  await autoTitle.scrollIntoViewIfNeeded();
  await expect(autoTitle).toBeVisible();
  await page.evaluate(async () => { await document.fonts.ready; });
  await expect.poll(() => dialog.evaluate(el => el.getAnimations({ subtree: true }).every(a => !a.pending && a.playState !== "running"))).toBe(true);
  await page.screenshot({ path: test.info().outputPath(`settings-auto-title-${theme}-${width}.png`), animations: "disabled" });

  const relay = dialog.locator(".relay-section");
  await relay.scrollIntoViewIfNeeded();
  await expect(relay.getByRole("heading", { name: "Remote relay", exact: true })).toBeVisible();
  await expect(relay.getByRole("status")).toHaveText("Off: no phone can reach this computer.");
  await expect(relay.getByRole("switch", { name: "Connect to the relay", exact: true })).toHaveAttribute("aria-checked", "false");
  await expect(relay.locator(".relay-qr, .relay-pairing, .relay-pending")).toHaveCount(0);
  await expect.poll(() => dialog.evaluate(el => el.getAnimations({ subtree: true }).every(a => !a.pending && a.playState !== "running"))).toBe(true);
  await page.screenshot({ path: test.info().outputPath(`settings-relay-${theme}-${width}.png`), animations: "disabled" });

  const remote = dialog.locator(".remote-access-section");
  await remote.scrollIntoViewIfNeeded();
  await expect(remote.getByRole("heading", { name: "Remote access", exact: true })).toBeVisible();
  await expect(remote.getByRole("status").first()).not.toHaveText(/Loading|Checking Tailscale|Could not/i);
  await expect(remote.getByRole("switch", { name: "Allow access from my tailnet", exact: true })).not.toHaveAttribute("aria-busy", "true");
  await expect(remote.getByRole("switch", { name: "Allow access from my tailnet", exact: true })).toHaveAttribute("aria-checked", "false");
  await expect(remote.getByText("Off: requests through Tailscale are refused.", { exact: true })).toBeVisible();
  await expect.poll(() => dialog.evaluate(el => el.getAnimations({ subtree: true }).every(a => !a.pending && a.playState !== "running"))).toBe(true);
  await page.screenshot({ path: test.info().outputPath(`settings-remote-access-${theme}-${width}.png`), animations: "disabled" });
  // Inspect settings only. Pairing, relay/tailnet enabling, push permissions and config writes are forbidden here.
  expect(writes).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  page.off("request", onRequest);
}

for (const theme of ["light", "dark"] as const) {
  for (const width of [1440, 390]) {
    test(`Tasks and project archive preserve sessions, ${theme} ${width}`, async ({ page, request }) => {
      const fixture = await recordedSession(request);
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(theme => localStorage.setItem("pi-theme", theme), theme);
      await page.goto(`/?session=${fixture.id}`);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(page.locator(".chat-window")).toContainText(fixture.message);
      await showSidebar(page);
      await page.getByRole("button", { name: "Tasks", exact: true }).click();
      const tasks = page.locator(".tasks-view");
      await expect(tasks).toBeVisible();
      await expect(page).toHaveURL(/\?view=tasks$/);
      await expect(tasks.getByText(fixture.name, { exact: true })).toBeVisible();
      await expect(page.locator(".chat-window")).toContainText(fixture.message);
      await page.reload();
      await expect(tasks).toBeVisible();
      await expect(page).toHaveURL(/\?view=tasks$/);
      await expect(tasks.getByText(fixture.name, { exact: true })).toBeVisible();
      await page.screenshot({ path: test.info().outputPath(`tasks-${theme}-${width}.png`), animations: "disabled" });
      await tasks.getByText(fixture.name, { exact: true }).click();
      await expect(tasks).toHaveCount(0);
      await expect(page).toHaveURL(new RegExp(`\\?session=${fixture.id}$`));
      await expect(page.locator(".chat-window")).toContainText(fixture.message);
      await page.goBack();
      await expect(tasks).toBeVisible();
      await page.goForward();
      await expect(tasks).toHaveCount(0);
      await expect(page.locator(".chat-window")).toContainText(fixture.message);

      await showSidebar(page);
      const project = page.getByRole("treeitem", { name: fixture.cwd, exact: true });
      await expect(project).toBeVisible();
      await project.click({ button: "right" });
      await page.getByRole("menuitem", { name: "Move to archive", exact: true }).click();
      await expect.poll(() => page.evaluate(cwd => JSON.parse(localStorage.getItem("pi-web:archived-projects") ?? "[]").includes(cwd), fixture.cwd)).toBe(true);
      // A real reload proves persistence; opening the archived session remains read-only navigation.
      await page.goto(`/?session=${fixture.id}`);
      await expect(page.locator(".chat-window")).toContainText(fixture.message);
      await page.keyboard.press("Control+Alt+n");
      await expect(page).toHaveURL(new RegExp(`\\?session=${fixture.id}$`));
      await expect(page.getByText(/is archived\. Restore it to the project list/)).toBeVisible();
      await showSidebar(page);
      const archive = page.locator(".sidebar-archive-header button");
      await archive.click();
      await expect(project).toBeVisible();
      await project.click({ button: "right" });
      const restore = page.getByRole("menuitem", { name: "Restore to projects", exact: true });
      await expect(restore).toBeVisible();
      await expect(page.getByRole("menuitem", { name: "Move to archive", exact: true })).toHaveCount(0);
      await page.screenshot({ path: test.info().outputPath(`archive-${theme}-${width}.png`), animations: "disabled" });
      await restore.click();
      await expect.poll(() => page.evaluate(cwd => JSON.parse(localStorage.getItem("pi-web:archived-projects") ?? "[]").includes(cwd), fixture.cwd)).toBe(false);
      await expect(project).toBeVisible();
      await expect(page.getByRole("button", { name: `New session in ${fixture.cwd}`, exact: true })).toBeEnabled();
      await expect(page.locator(".chat-window")).toContainText(fixture.message);
      await settingsSmoke(page, theme, width);
      expect(errors).toEqual([]);
    });
  }
}
