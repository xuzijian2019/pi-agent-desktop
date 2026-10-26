import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { SESSIONS_DIR, WORK_ROOT } from "./sandbox";

test("navigator reaches earlier rendered turns and its preview card is clickable", async ({ page, request }) => {
  // The navigator now requires both a >=1024px scrollport and a real text
  // gutter. Account for the open sidebar rather than forcing it into text.
  await page.setViewportSize({ width: 1600, height: 900 });
  const id = randomUUID();
  const cwd = path.join(WORK_ROOT, `navigator-${id}`);
  await mkdir(cwd, { recursive: true });
  const dir = path.join(SESSIONS_DIR, `--${cwd.replace(/^\//, "").replaceAll("/", "-")}--`);
  await mkdir(dir, { recursive: true });
  const timestamp = new Date().toISOString();
  const entries: object[] = [{ type: "session", version: 3, id, cwd, timestamp }];
  let parentId: string | null = null;
  const append = (message: object) => {
    const entryId = randomUUID();
    entries.push({ type: "message", id: entryId, parentId, timestamp, message: { ...message, timestamp: Date.now() } });
    parentId = entryId;
  };
  const usage = { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
  for (let turn = 0; turn < 35; turn += 1) {
    const assistant = { role: "assistant", api: "openai-completions", provider: "openai", model: "fixture", usage };
    append({ role: "user", content: `Navigator question ${turn}` });
    // One answer yields both a process group and an answer item: 70 messages
    // become 105 rendered items, reproducing the upstream window-size bug.
    append({ ...assistant, content: [{ type: "thinking", thinking: `Process ${turn}` }, { type: "text", text: `Navigator answer ${turn}\n\n${"Answer detail. ".repeat(25)}` }], stopReason: "stop" });
  }
  await writeFile(path.join(dir, `${timestamp.replaceAll(":", "-")}_${id}.jsonl`), entries.map(entry => JSON.stringify(entry)).join("\n") + "\n");
  await expect.poll(async () => (await (await request.get("/api/sessions?force=1")).json()).sessions.some((session: { id: string }) => session.id === id)).toBe(true);
  // Load the full branch through the real API so this isolates the renderer's
  // 50-item window from the server's separate 50-message history page.
  await page.route(`**/api/sessions/${id}?*`, async route => {
    const url = new URL(route.request().url());
    url.searchParams.set("tail", "1000");
    await route.fulfill({ response: await route.fetch({ url: url.toString() }) });
  });
  await page.goto(`/?session=${id}`);
  const track = page.getByRole("slider", { name: "Conversation navigation" });
  await expect(track).toBeVisible();
  await expect(page.locator('[data-conversation-turn="0"]')).toHaveCount(0);
  // Responsive hiding is intentional; returning to a wide layout must revive
  // the observer and preserve the functional navigation checks below.
  await page.setViewportSize({ width: 1000, height: 900 });
  await expect(track).toHaveCount(0);
  await page.setViewportSize({ width: 1600, height: 900 });
  await expect(track).toBeVisible();
  const box = (await track.boundingBox())!;
  await track.click({ position: { x: box.width / 2, y: 1 } });
  const first = page.locator('[data-conversation-turn="0"]');
  await expect(first).toBeVisible();
  await expect.poll(() => first.evaluate(el => {
    const container = el.closest(".chat-scroll-container")!;
    return Math.abs(el.getBoundingClientRect().top - container.getBoundingClientRect().top - 16);
  })).toBeLessThan(5);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const preview = page.locator("button.conversation-navigator-preview");
  await expect(preview).toContainText("Navigator question 17");
  const card = (await preview.boundingBox())!;
  // Move continuously from track to card, exercising the hover bridge.
  await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2, { steps: 15 });
  await expect(preview).toBeVisible();
  await preview.click();
  await expect.poll(() => page.locator('[data-conversation-turn="17"]').evaluate(el => {
    const container = el.closest(".chat-scroll-container")!;
    return Math.abs(el.getBoundingClientRect().top - container.getBoundingClientRect().top - 16);
  })).toBeLessThan(5);
});

test("Settings shortcut and platform layout keep model override hints and fork options", async ({ page }, testInfo) => {
  const cwd = path.join(WORK_ROOT, `settings-${randomUUID()}`);
  await mkdir(cwd, { recursive: true });
  await page.route("**/api/models-config", route => route.fulfill({ json: { providers: { "override-fixture": {
    api: "openai-completions", baseUrl: "http://127.0.0.1:1/v1", apiKey: "offline-fixture",
    models: [{ id: "fixture", contextWindow: 200000 }],
    modelOverrides: { fixture: { contextWindow: 500000 } },
  } } } }));
  await page.goto(`/?cwd=${encodeURIComponent(cwd)}`);
  await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeEditable();
  await page.keyboard.press("Control+,");
  const dialog = page.locator(".settings-dialog-surface");
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("switch", { name: "Name new sessions automatically" })).toBeVisible();
  await expect(page.getByText("Play a sound when a reply finishes", { exact: true })).toHaveCount(0);
  await dialog.locator('.settings-section-tab').filter({ hasText: "Models" }).click();
  await dialog.locator(".models-sidebar-indented-item").filter({ hasText: "fixture" }).click();
  await expect(dialog.locator(".models-override-notice")).toContainText("modelOverrides for fixture");
  await expect(dialog.locator('.models-spec-hint[data-source="override"]')).toContainText("500,000");
  await expect(dialog.locator('.models-spec-hint[data-source="fallback"]')).toContainText("16,384");
  for (const platform of ["macos", "windows", "linux"]) {
    await page.evaluate(value => document.documentElement.dataset.platform = value, platform);
    await page.screenshot({ path: testInfo.outputPath(`settings-${platform}.png`) });
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog.locator(".settings-mobile-section-picker")).toBeVisible();
  await expect(dialog.locator(".settings-section-tabs")).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath("settings-mobile.png") });
});
