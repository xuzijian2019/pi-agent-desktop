import { readFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import ts from "typescript";
import { test, expect, type Page } from "@playwright/test";
import { WORK_ROOT } from "./sandbox";
import type * as DraftStore from "../../lib/draft-store";
declare global { interface Window { drafts: typeof DraftStore } }
// Execute the production store with real IndexedDB in isolated browser contexts.
async function installStore(page: Page) {
  const source = (await readFile("lib/draft-store.ts", "utf8")).replace('import { APP_PREF_KEYS } from "@/lib/app-prefs";', 'const APP_PREF_KEYS = { chatDrafts: "pi-chat-drafts-v1" };');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  await page.evaluate((js) => { const exports = {}; new Function("exports", js)(exports); window.drafts = exports as typeof DraftStore; }, js);
}
async function saved(page: Page, key: string) { await expect.poll(() => page.evaluate((key) => window.drafts.getDraftStatus(key), key)).toBe("saved"); }

test("transactional drafts: migration, full attachments, independent tabs, conflicts and deletion", async ({ context, page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("pi-chat-drafts-v1", JSON.stringify({ legacy: { value: "old", images: [] } })));
  await installStore(page);
  expect(await page.evaluate(() => window.drafts.loadDraft("legacy"))).toMatchObject({ value: "old" });
  expect(await page.evaluate(() => localStorage.getItem("pi-chat-drafts-v1"))).toContain("old");
  const second = await context.newPage();
  await second.goto("/");
  await installStore(second);
  await Promise.all([page.evaluate(() => window.drafts.loadDraft("A")), second.evaluate(() => window.drafts.loadDraft("B"))]);
  await page.evaluate(() => window.drafts.setDraft("A", { value: "[Pasted text 1 · 1 lines]", images: [{ data: "a".repeat(600_000), mimeType: "image/png" }], texts: [{ id: 1, content: "x".repeat(131_073) }] }));
  await second.evaluate(() => window.drafts.setDraft("B", { value: "draft B", images: [] }));
  await saved(page, "A"); await saved(second, "B");
  await page.evaluate(async () => {
    await window.drafts.loadDraft("image-only");
    window.drafts.setDraft("image-only", { value: "", images: [{ data: "YQ==", mimeType: "image/png" }] });
  }); await saved(page, "image-only");
  await page.reload(); await installStore(page);
  expect(await page.evaluate(() => window.drafts.loadDraft("image-only"))).toMatchObject({ images: [{ data: "YQ==" }] });
  const lengths = await page.evaluate(async () => { const draft = await window.drafts.loadDraft("A"); return [draft?.images[0].data.length, draft?.texts?.[0].content.length]; });
  expect(lengths).toEqual([600_000, 131_073]);
  expect(await page.evaluate(() => window.drafts.loadDraft("B"))).toMatchObject({ value: "draft B" });
  await second.evaluate(() => window.drafts.setDraft("B", { value: "changed elsewhere", images: [] })); await saved(second, "B");
  await expect.poll(() => page.evaluate(() => window.drafts.getDraftStatus("B"))).toBe("conflict");
  expect(await page.evaluate(() => window.drafts.getDraft("B"))).toMatchObject({ value: "draft B" });
  await page.evaluate(() => window.drafts.clearDraft("B")); await saved(page, "B");
  await second.evaluate(() => window.drafts.setDraft("B", { value: "stale", images: [] }));
  await expect.poll(() => second.evaluate(() => window.drafts.getDraftStatus("B"))).toBe("conflict");
  expect(await page.evaluate(() => window.drafts.loadDraft("B"))).toBeNull();
  await page.evaluate(() => window.drafts.clearDraft("legacy")); await saved(page, "legacy");
  expect(await page.evaluate(() => window.drafts.loadDraft("legacy"))).toBeNull();
});

test("composer reload, orphan blocking, browser shortcut and server feedback", async ({ page }) => {
  const cwd = `${WORK_ROOT}/draft-${randomUUID()}`; await mkdir(cwd, { recursive: true });
  await page.goto(`/?cwd=${encodeURIComponent(cwd)}`);
  const composer = page.getByPlaceholder("Message…", { exact: false });
  await expect(composer).toBeEditable();
  await composer.fill("unsent draft");
  await page.reload(); await expect(composer).toHaveValue("unsent draft");
  await composer.fill("[Pasted text 1 · 100 lines]"); await composer.press("Enter");
  await expect(page.getByRole("alert").filter({ hasText: "Pasted text is missing" })).toBeVisible();
  await expect(composer).toHaveValue("[Pasted text 1 · 100 lines]");
  await page.keyboard.press("Control+Alt+n"); await expect(composer).toHaveValue("[Pasted text 1 · 100 lines]");
  await composer.fill("keep while offline");
  await page.route("**/api/home*", (route) => route.abort());
  await expect(page.getByRole("alert").filter({ hasText: /connection|server|offline/i })).toBeVisible({ timeout: 35_000 });
  await page.unroute("**/api/home*");
  await page.getByRole("button", { name: "Reconnect", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: /connection|server|offline/i })).toHaveCount(0, { timeout: 20_000 });
  await expect(composer).toHaveValue("keep while offline");
  await page.getByRole("button", { name: "Add project", exact: true }).click();
  const dialog = page.getByRole("dialog"); await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("latest selection, history, native links and project search", async ({ page, context, request }) => {
  const cwd = `${WORK_ROOT}/navigation-${randomUUID()}`; await mkdir(cwd, { recursive: true });
  await page.goto(`/?cwd=${encodeURIComponent(cwd)}`);
  const composer = page.getByPlaceholder("Message…", { exact: false });
  const ids: string[] = [];
  for (const name of ["alpha", "beta"]) {
    await expect(composer).toBeEditable();
    await composer.fill(`!printf ${name}`); await composer.press("Enter");
    await expect(page).toHaveURL(/session=/);
    const id = new URL(page.url()).searchParams.get("session")!; ids.push(id);
    await expect.poll(async () => (await (await request.get(`/api/agent/${id}`)).json()).state?.isBashRunning).not.toBe(true);
    await request.patch(`/api/sessions/${id}`, { data: { name } });
    if (name === "alpha") await page.keyboard.press("Control+Alt+n");
  }
  await page.reload();
  const linkA = page.locator(`a[href="?session=${ids[0]}"]`);
  const linkB = page.locator(`a[href="?session=${ids[1]}"]`);
  await linkA.click(); await expect(page).toHaveURL(new RegExp(ids[0]));
  await expect(composer).toBeEditable(); await composer.fill("draft alpha");
  await linkB.click(); await expect(page).toHaveURL(new RegExp(ids[1]));
  await expect(composer).toBeEditable(); await composer.fill("draft beta");
  await page.goBack(); await expect(page).toHaveURL(new RegExp(ids[0])); await expect(composer).toHaveValue("draft alpha");
  await expect(linkA).toHaveAttribute("aria-current", "page");
  await page.goForward(); await expect(page).toHaveURL(new RegExp(ids[1])); await expect(composer).toHaveValue("draft beta");
  await expect(page).toHaveTitle(/beta.*navigation-/);
  const popupPromise = context.waitForEvent("page");
  await linkA.click({ modifiers: ["ControlOrMeta"] });
  const popup = await popupPromise; await popup.waitForLoadState(); await expect(popup).toHaveURL(new RegExp(ids[0])); await popup.close();
  const middlePromise = context.waitForEvent("page");
  await linkA.click({ button: "middle" });
  const middle = await middlePromise; await middle.waitForLoadState(); await expect(middle).toHaveURL(new RegExp(ids[0])); await middle.close();
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route(`**/api/sessions/${ids[0]}?*`, async (route) => { await held; await route.continue().catch(() => {}); });
  await linkA.click();
  await page.keyboard.press("Control+Alt+n");
  release(); await expect(page).toHaveURL(/cwd=/); await expect(composer).toHaveValue("");
  // Search matches the project path even though session names are alpha/beta.
  const search = page.getByRole("searchbox", { name: "Search sessions…", exact: true });
  await expect(search).toBeVisible();
  {
    await search.fill(cwd.split("/").at(-1)!); await expect(linkA).toBeVisible(); await expect(linkB).toBeVisible();
    await search.fill("no-such-project-xyz"); await expect(linkA).toHaveCount(0);
    await expect(composer).toBeEditable();
    const projectPicker = page.getByRole("button", { name: `Current project: ${cwd}`, exact: true });
    await expect(projectPicker).toBeEnabled();
    await projectPicker.click(); await expect(projectPicker).toHaveAttribute("aria-expanded", "true");
  }
});

test("draft write failure is visible and retains recoverable input", async ({ page }) => {
  await page.goto("/"); await installStore(page);
  await page.evaluate(async () => {
    await window.drafts.loadDraft("quota");
    window.drafts.setDraft("quota", { value: "committed", images: [] });
  }); await saved(page, "quota");
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = () => { throw new DOMException("Storage full", "QuotaExceededError"); };
    window.drafts.setDraft("quota", { value: "still in editor", images: [] });
  });
  await expect.poll(() => page.evaluate(() => window.drafts.getDraftStatus("quota"))).toBe("failed");
  expect(await page.evaluate(() => window.drafts.getDraft("quota"))).toMatchObject({ value: "still in editor" });
  await page.reload(); await installStore(page);
  expect(await page.evaluate(() => window.drafts.loadDraft("quota"))).toMatchObject({ value: "committed" });
});

test("browser notifications are opt-in, focus-aware and deduplicated by run across tabs", async ({ page, context }) => {
  const source = (await readFile("lib/desktop-notify.ts", "utf8"))
    .replace('import { isTauriDesktop } from "@/lib/desktop-updater";', 'const isTauriDesktop = () => false;')
    .replace('import { APP_PREF_KEYS, getPrefBool } from "@/lib/app-prefs";', 'const APP_PREF_KEYS = { browserNotifications: "pi-browser-notifications", notificationClaims: "pi-notification-claims", notifyOnComplete: "unused" }; const getPrefBool = (key: string, fallback: boolean) => localStorage.getItem(key) === null ? fallback : localStorage.getItem(key) === "true";');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const second = await context.newPage();
  for (const tab of [page, second]) {
    await tab.goto("/");
    await tab.evaluate((js) => {
      const exports = {}; new Function("exports", js)(exports);
      Object.assign(window, { notifications: exports, sent: 0 });
      class FakeNotification {
        static permission = "granted";
        static requestPermission() { throw new Error("Unsolicited prompt"); }
        constructor() { (window as unknown as { sent: number }).sent++; }
      }
      Object.defineProperty(window, "Notification", { value: FakeNotification, configurable: true });
      Object.defineProperty(document, "hidden", { value: false, configurable: true });
      document.hasFocus = () => false;
    }, js);
  }
  const notify = (tab: Page, key: string) => tab.evaluate(async (key) => {
    await (window as unknown as { notifications: { notifyDesktop(options: { title: string; body: string; key: string }): Promise<void> } }).notifications.notifyDesktop({ title: "Finished", body: "test", key });
  }, key);
  const count = async () => (await Promise.all([page, second].map((tab) => tab.evaluate(() => (window as unknown as { sent: number }).sent)))).reduce((a, b) => a + b, 0);
  await notify(page, "default-off"); expect(await count()).toBe(0);
  await page.evaluate(() => localStorage.setItem("pi-browser-notifications", "true"));
  await Promise.all([notify(page, "run-1"), notify(second, "run-1")]); expect(await count()).toBe(1);
  await Promise.all([notify(page, "run-1"), notify(second, "run-2")]); expect(await count()).toBe(2);
  await page.evaluate(() => { document.hasFocus = () => true; });
  await notify(page, "foreground"); expect(await count()).toBe(2);
  await page.evaluate(() => { document.hasFocus = () => false; Object.defineProperty(Notification, "permission", { value: "denied" }); });
  await notify(page, "denied"); expect(await count()).toBe(2);
  await page.evaluate(() => Object.defineProperty(window, "Notification", { value: undefined }));
  await notify(page, "unsupported"); expect(await count()).toBe(2);
});

test("blocked migration exposes failure and preserves legacy contents", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("pi-chat-drafts-v1", JSON.stringify({ blocked: { value: "legacy recovery", images: [] } }));
    IDBFactory.prototype.open = (() => {
      const request: { onblocked?: () => void } = {};
      setTimeout(() => request.onblocked?.(), 0);
      return request;
    }) as unknown as typeof indexedDB.open;
  });
  await installStore(page);
  expect(await page.evaluate(() => window.drafts.loadDraft("blocked"))).toMatchObject({ value: "legacy recovery" });
  expect(await page.evaluate(() => window.drafts.getDraftStatus("blocked"))).toBe("failed");
  expect(await page.evaluate(() => localStorage.getItem("pi-chat-drafts-v1"))).toContain("legacy recovery");
});

test("fast typing does not flash draft status or resize the composer", async ({ page }) => {
  const cwd = `${WORK_ROOT}/typing-${randomUUID()}`; await mkdir(cwd, { recursive: true });
  await page.goto(`/?cwd=${encodeURIComponent(cwd)}`);
  const input = page.getByPlaceholder("Message…", { exact: false });
  await expect(input).toBeEditable();
  await input.fill("ready ");
  await expect(page.getByText("Saving draft…", { exact: true })).toHaveCount(0);
  await input.evaluate((element) => {
    const composer = element.closest(".chat-composer")!;
    const measurements = { heights: [composer.getBoundingClientRect().height], savingFlashes: 0 };
    const observer = new MutationObserver(() => {
      measurements.heights.push(composer.getBoundingClientRect().height);
      if (composer.textContent?.includes("Saving draft…")) measurements.savingFlashes++;
    });
    observer.observe(composer, { childList: true, subtree: true });
    Object.assign(window, { typingMeasurements: measurements, typingObserver: observer });
  });
  await input.pressSequentially("fast typing stays still", { delay: 12 });
  await expect(input).toHaveValue("ready fast typing stays still");
  const measurements = await page.evaluate(() => {
    const state = window as unknown as { typingMeasurements: { heights: number[]; savingFlashes: number }; typingObserver: MutationObserver };
    state.typingObserver.disconnect();
    return state.typingMeasurements;
  });
  expect(measurements.savingFlashes).toBe(0);
  expect(Math.max(...measurements.heights) - Math.min(...measurements.heights)).toBeLessThanOrEqual(1);
  await page.reload();
  await expect(input).toHaveValue("ready fast typing stays still");
});

test("slow draft saves show feedback without moving the editor", async ({ page }) => {
  const cwd = `${WORK_ROOT}/slow-save-${randomUUID()}`; await mkdir(cwd, { recursive: true });
  await page.goto(`/?cwd=${encodeURIComponent(cwd)}`);
  const input = page.getByPlaceholder("Message…", { exact: false });
  await expect(input).toBeEditable();
  const before = await input.evaluate((element) => element.closest(".chat-composer")!.getBoundingClientRect().height);
  await page.evaluate(() => {
    // Keep real IndexedDB writes, but hold the commit acknowledgement so the
    // production composer observes a deliberately slow pending state.
    const descriptor = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, "oncomplete")!;
    Object.defineProperty(IDBTransaction.prototype, "oncomplete", {
      ...descriptor,
      set(handler) {
        descriptor.set!.call(this, handler ? (event: Event) => setTimeout(() => handler.call(this, event), 1_500) : handler);
      },
    });
  });
  await input.fill("slow save");
  await expect(page.getByText("Saving draft…", { exact: true })).toBeVisible();
  const during = await input.evaluate((element) => element.closest(".chat-composer")!.getBoundingClientRect().height);
  expect(during).toBe(before);
  await expect(page.getByText("Saving draft…", { exact: true })).toHaveCount(0);
  await page.reload(); await expect(input).toHaveValue("slow save");
});

test("returning to New Session restores its unsent large paste", async ({ page, request }) => {
  const cwd = `${WORK_ROOT}/new-draft-${randomUUID()}`; await mkdir(cwd, { recursive: true });
  await page.goto(`/?cwd=${encodeURIComponent(cwd)}`);
  const composer = page.getByPlaceholder("Message…", { exact: false });
  await expect(composer).toBeEditable();
  await composer.fill("!printf existing-chat"); await composer.press("Enter");
  await expect(page).toHaveURL(/session=/);
  const id = new URL(page.url()).searchParams.get("session")!;
  await expect.poll(async () => (await (await request.get(`/api/agent/${id}`)).json()).state?.isBashRunning).not.toBe(true);
  const newSession = page.getByRole("button", { name: "New Session", exact: true });
  await newSession.click(); await expect(composer).toBeEditable();
  const pasted = "draft log content ".repeat(10_000);
  await composer.evaluate((element, pasted) => {
    const clipboardData = new DataTransfer(); clipboardData.setData("text/plain", pasted);
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }));
  }, pasted);
  await expect(composer).toHaveValue(/\[Pasted text/);
  const token = await composer.inputValue();
  await page.locator(`a[href="?session=${id}"]`).click();
  await expect(page).toHaveURL(new RegExp(id));
  await newSession.click();
  await expect(composer).toHaveValue(token, { timeout: 3_000 });
  await expect(page.getByText(token.trim(), { exact: true }).and(page.locator("span"))).toBeVisible();
  // Check the complete payload too, not just a surviving placeholder.
  const savedPaste = await page.evaluate(async (key) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open("pi-chat-drafts", 1);
      open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error);
    });
    try {
      return await new Promise<string>((resolve, reject) => {
        const get = database.transaction("drafts").objectStore("drafts").get(key);
        get.onsuccess = () => resolve(get.result?.draft?.texts?.[0]?.content);
        get.onerror = () => reject(get.error);
      });
    } finally { database.close(); }
  }, `new:${cwd}`);
  expect(savedPaste).toBe(pasted);
  await page.reload(); await expect(composer).toHaveValue(token);
  // A successfully submitted draft must still clear before the next chat.
  await composer.fill("!printf draft-submitted"); await composer.press("Enter");
  await expect(page).toHaveURL(/session=/);
  const submittedId = new URL(page.url()).searchParams.get("session")!;
  await expect.poll(async () => (await (await request.get(`/api/agent/${submittedId}`)).json()).state?.isBashRunning).not.toBe(true);
  await newSession.click(); await expect(composer).toHaveValue("");
});
