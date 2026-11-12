import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type APIRequestContext, type Locator, type Page, type Route } from "@playwright/test";
import { SESSIONS_DIR, WORK_ROOT } from "./sandbox";
import { isAgentReadRequest } from "../../e2e/agent-read-request.mjs";

/** Keep the folder present so the fork's cwdMissing screen does not replace the composer. */
async function recordedSession(request: APIRequestContext, label: string) {
  const id = randomUUID();
  const cwd = path.join(WORK_ROOT, `recheck-${label}-${id}`);
  await mkdir(cwd, { recursive: true });
  const dir = path.join(SESSIONS_DIR, `--${cwd.replace(/^\//, "").replaceAll("/", "-")}--`);
  await mkdir(dir, { recursive: true });
  const timestamp = new Date().toISOString();
  const name = `Recheck ${label} ${id}`;
  const message = `Recorded history ${id}`;
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

/** Only the filesystem probe is controlled; the hook, composer, navigation and model reload are real. */
async function controlProbes(page: Page) {
  const probes: Route[] = [];
  await page.route("**/api/cwd/status?*", route => { probes.push(route); });
  return {
    probes,
    async take(index: number, cwd: string) {
      await expect.poll(() => probes.length, { message: `workspace probe ${index + 1}` }).toBe(index + 1);
      const route = probes[index];
      expect(new URL(route.request().url()).searchParams.get("cwd")).toBe(cwd);
      return route;
    },
  };
}

async function reply(route: Route, availability: string) {
  await route.fulfill({ json: { availability } });
}

async function assertContained(locator: Locator, width: number) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(0);
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(width);
}

async function screenshot(page: Page, name: string) {
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.screenshot({ path: test.info().outputPath(name), animations: "disabled" });
}

for (const theme of ["light", "dark"] as const) {
  for (const width of [1280, 390]) {
    const availability = width === 1280 ? "missing" : theme === "light" ? "not-directory" : "unreadable";
    const locale = theme === "dark" && width === 390 ? "zh-CN" : "en";
    const labels = locale === "en"
      ? { again: "Check again", checking: "Checking…", unchanged: "Still unavailable.", message: "Message", send: "Send", modelError: "Model error" }
      : { again: "重新检查", checking: "检查中…", unchanged: "仍无法访问。", message: "消息", send: "发送", modelError: "模型错误" };
    test(`workspace recheck: pending, unchanged and recovery, ${theme} ${width}`, async ({ page, request }) => {
      const fixture = await recordedSession(request, `${theme}-${width}`);
      const controlled = await controlProbes(page);
      const errors: string[] = [];
      const prompts: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("request", request => {
        if (request.method() !== "POST" || !/\/api\/agent\//.test(request.url())) return;
        // Session initialization may read tools/commands or renew its lease.
        // Exclude only those exact protocol reads; all other writes, including
        // prompt/follow_up and new/queued sends, still fail the assertions below.
        if (!isAgentReadRequest(request.method(), request.url(), request.postData(), fixture.id)) {
          prompts.push(`${request.url()} ${request.postData() ?? ""}`);
        }
      });
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(({ theme, locale }) => {
        localStorage.setItem("pi-theme", theme);
        localStorage.setItem("pi-locale", locale);
      }, { theme, locale });
      await page.goto(`/?session=${fixture.id}`);
      await reply(await controlled.take(0, fixture.cwd), availability);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(page.locator(".chat-window")).toContainText(fixture.message);
      const notice = page.locator(`[data-workspace-unavailable='${availability}']`);
      const again = notice.getByRole("button", { name: labels.again, exact: true });
      const composer = page.getByRole("textbox", { name: labels.message, exact: true });
      const send = page.getByRole("button", { name: labels.send, exact: true });
      const draft = "Keep this draft while checking the project folder";
      await expect(notice).toBeVisible();
      await expect(notice).toContainText(fixture.cwd);
      await expect(again).toBeEnabled();
      await expect(notice.getByRole("status")).toHaveCount(0);
      await expect(page.getByText(labels.modelError, { exact: true })).toHaveCount(0);
      await composer.fill(draft);
      await expect(send).toBeDisabled();
      await composer.press("Control+Enter");
      await expect(composer).toHaveValue(draft);
      expect(prompts).toEqual([]);

      // Hold the response, not a timer: even a fast API must visibly enter checking.
      await again.click();
      const first = await controlled.take(1, fixture.cwd);
      const checking = notice.getByRole("button", { name: labels.checking, exact: true });
      await expect(checking).toBeDisabled();
      await expect(checking).toHaveAttribute("aria-busy", "true");
      await expect(notice.getByRole("status")).toHaveCount(0);
      await expect(send).toBeDisabled();
      // Real additional mouse input on the disabled control must not start another request.
      const button = await checking.boundingBox();
      expect(button).not.toBeNull();
      await page.mouse.click(button!.x + button!.width / 2, button!.y + button!.height / 2, { clickCount: 2 });
      await expect(checking).toBeDisabled();
      expect(controlled.probes).toHaveLength(2);
      await screenshot(page, `checking-${theme}-${width}.png`);
      await reply(first, availability);
      await expect(again).toBeEnabled();
      await expect(again).toHaveAttribute("aria-busy", "false");
      await expect(notice.getByRole("status")).toHaveText(labels.unchanged);
      await expect(send).toBeDisabled();
      await expect(composer).toHaveValue(draft);
      await assertContained(notice, width);
      await assertContained(again, width);
      await assertContained(notice.getByRole("status"), width);
      await screenshot(page, `unchanged-${theme}-${width}.png`);
      if (width === 390) {
        // Reuse the same loaded session for the smallest layout, keeping CI lean.
        await page.setViewportSize({ width: 320, height: 900 });
        await assertContained(notice, 320);
        await assertContained(again, 320);
        await assertContained(notice.getByRole("status"), 320);
        await screenshot(page, `unchanged-${theme}-320.png`);
        await page.setViewportSize({ width, height: 900 });
      }

      // A second complete recheck clears the old status while pending and announces again.
      await again.focus();
      await page.keyboard.press("Enter");
      const second = await controlled.take(2, fixture.cwd);
      await expect(checking).toHaveAttribute("aria-busy", "true");
      await expect(notice.getByRole("status")).toHaveCount(0);
      await reply(second, availability);
      await expect(notice.getByRole("status")).toHaveText(labels.unchanged);
      await expect(again).toBeEnabled();

      await again.click();
      const recovery = await controlled.take(3, fixture.cwd);
      await expect(checking).toBeDisabled();
      const modelsReload = page.waitForRequest(request => {
        const url = new URL(request.url());
        return url.pathname === "/api/models" && url.searchParams.get("cwd") === fixture.cwd;
      });
      await reply(recovery, "available");
      await modelsReload;
      await expect(notice).toHaveCount(0);
      await expect(send).toBeEnabled();
      await expect(composer).toHaveValue(draft);
      await expect(page.locator(".chat-window")).toContainText(fixture.message);
      expect(controlled.probes).toHaveLength(4);
      expect(prompts).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
}

async function selectSession(page: Page, name: string) {
  const sidebar = page.locator("#session-sidebar");
  await expect(sidebar).not.toHaveClass(/sidebar-mobile-pending/);
  if (await sidebar.evaluate(el => el.classList.contains("sidebar-closed"))) {
    await page.locator(".app-topbar").getByRole("button", { name: "Show sidebar", exact: true }).click();
  }
  await expect(sidebar).toHaveClass(/sidebar-open/);
  await expect(sidebar).toHaveJSProperty("inert", false);
  await sidebar.getByText(name, { exact: true }).click();
}

test("workspace recheck ignores an aborted response after switching projects", async ({ page, request }) => {
  const first = await recordedSession(request, "first");
  const second = await recordedSession(request, "second");
  const controlled = await controlProbes(page);
  await page.goto(`/?session=${first.id}`);
  await reply(await controlled.take(0, first.cwd), "missing");
  const notice = page.locator("[data-workspace-unavailable]");
  await notice.getByRole("button", { name: "Check again", exact: true }).click();
  const stale = await controlled.take(1, first.cwd);
  await expect(notice.getByRole("button", { name: "Checking…", exact: true })).toBeDisabled();
  const cancelled = page.waitForEvent("requestfailed", request => request === stale.request());
  await selectSession(page, second.name);
  await cancelled;
  await expect(page).toHaveURL(new RegExp(`session=${second.id}$`));
  const fresh = await controlled.take(2, second.cwd);
  await expect(notice).toHaveCount(0);
  await reply(fresh, "unreadable");
  await expect(notice).toHaveAttribute("data-workspace-unavailable", "unreadable");
  await expect(notice).toContainText(second.cwd);
  await expect(notice.getByRole("status")).toHaveCount(0);
  await expect(notice.getByRole("button", { name: "Check again", exact: true })).toBeEnabled();
  // A late success from the old cwd must not clear the new cwd's unavailable state.
  await reply(stale, "available");
  await expect(notice).toHaveAttribute("data-workspace-unavailable", "unreadable");
  await expect(notice).toContainText(second.cwd);
  await notice.getByRole("button", { name: "Check again", exact: true }).click();
  await reply(await controlled.take(3, second.cwd), "unreadable");
  await expect(notice.getByRole("status")).toHaveText("Still unavailable.");

  // Back navigation probes the original cwd afresh rather than inheriting B's feedback.
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`session=${first.id}$`));
  await reply(await controlled.take(4, first.cwd), "missing");
  await expect(notice).toContainText(first.cwd);
  await expect(notice.getByRole("status")).toHaveCount(0);
  await expect(notice.getByRole("button", { name: "Check again", exact: true })).toBeEnabled();
});

test("workspace recheck clears pending feedback when the probe fails", async ({ page, request }) => {
  const fixture = await recordedSession(request, "probe-error");
  const controlled = await controlProbes(page);
  await page.goto(`/?session=${fixture.id}`);
  await reply(await controlled.take(0, fixture.cwd), "missing");
  const notice = page.locator("[data-workspace-unavailable]");
  const composer = page.getByRole("textbox", { name: "Message", exact: true });
  await composer.fill("Draft survives an inconclusive filesystem probe");
  await notice.getByRole("button", { name: "Check again", exact: true }).click();
  const failed = await controlled.take(1, fixture.cwd);
  await expect(notice.getByRole("button", { name: "Checking…", exact: true })).toBeDisabled();
  await failed.fulfill({ status: 503, json: { error: "Probe unavailable" } });
  await expect(notice).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
  await expect(composer).toHaveValue("Draft survives an inconclusive filesystem probe");
});
