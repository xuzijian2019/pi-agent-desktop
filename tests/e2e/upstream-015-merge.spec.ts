import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { SESSIONS_DIR, WORK_ROOT } from "./sandbox";

// Actual app served by the shared npm run web harness. History is real JSONL in
// the isolated sandbox. Only live agent state/SSE/catalog responses are synthetic:
// these tests validate browser behavior, not an SDK/provider round trip. No model
// is contacted, credentials configured, or settings saved.
const quote = "A quoted answer survives upstream integration.";
const usage = { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
async function seed(request: APIRequestContext) {
  const id = randomUUID(), cwd = path.join(WORK_ROOT, `merge-015-${id}`);
  await mkdir(cwd, { recursive: true });
  const directory = path.join(SESSIONS_DIR, `--${cwd.replace(/^\//, "").replaceAll("/", "-")}--`);
  await mkdir(directory, { recursive: true });
  const timestamp = new Date().toISOString();
  const assistant = { role: "assistant", api: "openai-completions", provider: "fixture-ui", model: "fixture", usage, stopReason: "stop", timestamp: Date.now() };
  const patch = `--- a/example.ts\n+++ b/example.ts\n@@ -1,2 +1,2 @@\n context\n-old value\n+new ${"very_long_patch_content_".repeat(30)}\n@@ -20,2 +20,2 @@\n later context\n-old tail\n+new tail\n`;
  const messages = [
    { role: "user", content: "Review the long patch without sending any requests to a model.", timestamp: Date.now() },
    { ...assistant, content: [{ type: "toolCall", id: "patch-call", name: "edit", arguments: { path: "example.ts", oldText: "old value", newText: "new value" } }] },
    { role: "toolResult", toolCallId: "patch-call", toolName: "edit", content: [{ type: "text", text: "Recorded patch only; no files were edited." }], details: { diff: patch }, isError: false, timestamp: Date.now() },
    { ...assistant, content: [{ type: "text", text: quote }] },
  ];
  const entries: unknown[] = [{ type: "session", version: 3, id, cwd, timestamp }];
  messages.forEach((message, i) => entries.push({ type: "message", id: `entry-${i}`, parentId: i ? `entry-${i - 1}` : null, timestamp, message }));
  await writeFile(path.join(directory, `${timestamp.replaceAll(":", "-")}_${id}.jsonl`), entries.map(entry => JSON.stringify(entry)).join("\n") + "\n");
  await expect.poll(async () => (await (await request.get("/api/sessions?force=1")).json()).sessions.some((s: { id: string }) => s.id === id)).toBe(true);
  return { id, cwd };
}
async function contained(locator: Locator, width: number) {
  await expect(locator).toBeVisible();
  const rect = await locator.boundingBox();
  expect(rect).not.toBeNull();
  expect(rect!.x).toBeGreaterThanOrEqual(-1);
  expect(rect!.x + rect!.width).toBeLessThanOrEqual(width + 1);
}
async function capture(page: Page, name: string) {
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.screenshot({ path: test.info().outputPath(name), animations: "disabled" });
}
async function selectAnswer(page: Page) {
  const answer = page.getByText(quote, { exact: true });
  await answer.scrollIntoViewIfNeeded();
  // Use a real pointer selection: removeAllRanges() while a textarea is focused
  // resets its caret to zero in Chromium, unlike selecting text with the mouse.
  const points = await answer.evaluate(element => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.textContent?.length) nodes.push(node as Text);
    }
    const first = document.createRange();
    first.setStart(nodes[0], 0); first.setEnd(nodes[0], 1);
    const lastNode = nodes[nodes.length - 1];
    const last = document.createRange();
    last.setStart(lastNode, lastNode.length - 1); last.setEnd(lastNode, lastNode.length);
    const start = first.getBoundingClientRect(), end = last.getBoundingClientRect();
    return { start: { x: start.left, y: start.top + start.height / 2 }, end: { x: end.right, y: end.top + end.height / 2 } };
  });
  await page.mouse.move(points.start.x, points.start.y);
  await page.mouse.down();
  await page.mouse.move(points.end.x, points.end.y, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe(quote);
  await expect(page.getByRole("button", { name: "Quote", exact: true })).toBeVisible();
}
async function catalog(page: Page) {
  await page.route("**/api/models?*", route => route.fulfill({ json: {
    models: { "fixture-ui:fixture": "Offline fixture" },
    modelList: [{ id: "fixture", name: "Offline fixture", provider: "fixture-ui", providerName: "Offline fixture provider" }],
    defaultModel: { provider: "fixture-ui", modelId: "fixture" },
  } }));
}
// Only these exact read/liveness requests are synthesized. Every other write is
// rejected and recorded, including prompt/follow_up, model changes, fork and settings.
async function offlineAgent(page: Page, id: string, state: { running: boolean; state?: Record<string, unknown> }) {
  const writes: string[] = [];
  await page.addInitScript(({ id, running }) => {
    const Original = window.EventSource;
    class OfflineSource extends EventTarget {
      readyState = 1;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror = null;
      constructor() {
        super();
        setTimeout(() => this.onmessage?.(new MessageEvent("message", { data: JSON.stringify({ type: "connected", isStreaming: running }) })), 0);
      }
      close() { this.readyState = 2; }
    }
    window.EventSource = new Proxy(Original, { construct(target, args) {
      return new URL(String(args[0]), location.href).pathname === `/api/agent/${id}/events`
        ? new OfflineSource() : Reflect.construct(target, args);
    } });
  }, { id, running: state.running });
  await page.route("**/api/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const agentPath = `/api/agent/${id}`;
    if (request.method() === "GET" && [agentPath, `/api/sessions/${id}/state`].includes(url.pathname)) {
      await route.fulfill({ json: state });
      return;
    }
    if (request.method() === "POST" && url.pathname === `${agentPath}/lease` && !url.search && !request.postData()) {
      await route.fulfill({ json: { success: true, running: state.running, awaitingInput: false, subagentsActive: false } });
      return;
    }
    let command: Record<string, unknown> | null = null;
    if (request.method() === "POST" && url.pathname === agentPath && !url.search) {
      try { command = request.postDataJSON(); } catch { /* Malformed writes remain blocked. */ }
      if (command && Object.keys(command).length === 1) {
        if (command.type === "get_tools") {
          await route.fulfill({ json: { success: true, data: [] } });
          return;
        }
        if (command.type === "get_commands") {
          await route.fulfill({ json: { success: true, data: { commands: [] } } });
          return;
        }
      }
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
      writes.push(`${request.method()} ${url.pathname}${command?.type ? ` (${command.type})` : ""}`);
      await route.fulfill({ status: 409, json: { error: "Read-only merge UI fixture" } });
    } else await route.fallback();
  });
  return writes;
}
for (const theme of ["light", "dark"] as const) for (const width of [1440, 390]) {
  test(`upstream merge: patch, quote, recap-only and Settings, ${theme} ${width}`, async ({ page, request }) => {
    const fixture = await seed(request);
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(theme => {
      localStorage.setItem("pi-theme", theme);
      localStorage.setItem("pi-locale", "en");
      localStorage.setItem("pi-quote-selection-enabled", "true");
    }, theme);
    await catalog(page);
    const writes = await offlineAgent(page, fixture.id, { running: false });
    await page.goto(`/?session=${fixture.id}`);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const input = page.getByRole("textbox", { name: "Message", exact: true });
    await expect(input).toBeEditable();
    await expect(page.getByText(quote, { exact: true })).toBeVisible();
    await page.locator(".process-details-trigger").click();
    await page.locator(".msg-tool-header").filter({ hasText: "edit" }).click();
    await expect(page.locator(".patch-diff-gap")).toContainText("unchanged lines");
    await contained(page.locator(".msg-diff-file"), width);
    if (width === 390) await expect(page.locator(".msg-diff-grid")).toHaveCount(0);
    else await expect(page.locator(".msg-diff-grid")).toHaveCount(1);
    await page.locator(".patch-diff-gap").scrollIntoViewIfNeeded();
    await capture(page, `patch-${theme}-${width}.png`);

    const draft = Array.from({ length: 35 }, (_, i) => `Draft line ${i}: ${"long text ".repeat(10)}`).join("\n");
    await input.fill(draft);
    await contained(input, width);
    await expect(input).toBeInViewport();
    await capture(page, `long-composer-${theme}-${width}.png`);
    const quoteBlock = `> ${quote}\n\n`;
    const quoteCases = [
      { name: "beginning", draft: "Keep this draft.", keys: ["Home"], start: 0, end: 0, before: "", after: "Keep this draft." },
      { name: "middle", draft: "Keep this draft.", keys: ["Home", "ArrowRight", "ArrowRight", "ArrowRight", "ArrowRight"], start: 4, end: 4, before: "Keep", after: " this draft." },
      { name: "replaced range", draft: "Keep this draft.", keys: ["Home", "ArrowRight", "ArrowRight", "ArrowRight", "ArrowRight", "Shift+ArrowRight", "Shift+ArrowRight", "Shift+ArrowRight", "Shift+ArrowRight", "Shift+ArrowRight"], start: 4, end: 9, before: "Keep", after: " draft." },
      { name: "end", draft: "Keep this draft.", keys: ["End"], start: 16, end: 16, before: "Keep this draft.", after: "" },
    ];
    for (const position of quoteCases) await test.step(`Quote at ${position.name} preserves draft and typing caret`, async () => {
      await input.fill(position.draft);
      for (const key of position.keys) await input.press(key);
      const selection = () => input.evaluate(element => {
        const textarea = element as HTMLTextAreaElement;
        return [textarea.selectionStart, textarea.selectionEnd];
      });
      await expect.poll(selection).toEqual([position.start, position.end]);
      await selectAnswer(page);
      await expect.poll(selection).toEqual([position.start, position.end]);
      await page.getByRole("button", { name: "Quote", exact: true }).click();
      const prefix = position.before + (position.before ? "\n\n" : "") + quoteBlock;
      await expect(input).toHaveValue(prefix + position.after);
      await expect(input).toBeFocused();
      await expect.poll(selection).toEqual([prefix.length, prefix.length]);
      await page.keyboard.type("Question after quote");
      await expect(input).toHaveValue(prefix + "Question after quote" + position.after);
    });
    const before = await input.inputValue();
    await selectAnswer(page);
    await page.getByRole("button", { name: "Ask in new chat", exact: true }).click();
    const quoteDialog = page.getByRole("dialog", { name: "New chat about selected text", exact: true });
    await expect(quoteDialog).toBeVisible();
    await expect(quoteDialog.getByRole("textbox", { name: "Message", exact: true })).toHaveValue(`> ${quote}\n\n`);
    await expect(page.getByRole("button", { name: "Ask in side chat", exact: true })).toHaveCount(0);
    await capture(page, `quote-new-chat-${theme}-${width}.png`);
    await quoteDialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(input).toHaveValue(before);
    await input.fill("/recap");
    await expect(page.locator(".composer-completion-body.is-slash")).toContainText("recap");
    await input.fill("/side");
    await expect(page.locator(".composer-completion-body.is-slash")).not.toContainText("/side");
    await input.fill("");

    await page.keyboard.press("Control+,");
    const settings = page.locator(".settings-dialog-surface");
    await expect(settings).toBeVisible();
    if (width === 390) {
      await settings.getByRole("combobox", { name: "Settings section", exact: true }).click();
      await page.getByRole("option", { name: "Models", exact: true }).click();
    } else await settings.locator(".settings-section-tab").filter({ hasText: /^Models$/ }).click();
    await settings.getByRole("button", { name: "Add provider", exact: true }).click();
    const search = settings.getByPlaceholder("Search providers…");
    await expect(search).toBeVisible();
    const picker = search.locator("../..");
    await contained(picker, width);
    const settingsRect = (await settings.boundingBox())!;
    const pickerRect = (await picker.boundingBox())!;
    expect(pickerRect.y).toBeGreaterThanOrEqual(settingsRect.y - 1);
    expect(pickerRect.y + pickerRect.height).toBeLessThanOrEqual(settingsRect.y + settingsRect.height + 1);
    await capture(page, `provider-picker-${theme}-${width}.png`);
    await search.fill("unmatched-provider-".repeat(20));
    await expect(search).toHaveValue("unmatched-provider-".repeat(20));
    await contained(picker, width);
    await search.press("Escape");
    await expect(search).toHaveCount(0);
    await expect(settings).toBeVisible();
    expect(writes).toEqual([]);
  });
}

for (const theme of ["light", "dark"] as const) for (const width of [1440, 390]) {
  test(`upstream merge: long queue and mid-run model menu, ${theme} ${width}`, async ({ page, request }) => {
    const { id } = await seed(request);
    await page.setViewportSize({ width, height: 900 });
    const queue = Array.from({ length: 18 }, (_, i) => `Queued ${i}: ${"long queued follow-up text ".repeat(20)}`);
    await page.addInitScript(theme => {
      localStorage.setItem("pi-theme", theme); localStorage.setItem("pi-locale", "en");
    }, theme);
    await catalog(page);
    const state = { running: true, state: {
      isStreaming: true, isPromptRunning: true,
      model: { provider: "fixture-ui", id: "fixture" },
      queuedMessages: { steering: queue.slice(0, 9), followUp: queue.slice(9) },
    } };
    const writes = await offlineAgent(page, id, state);
    await page.goto(`/?session=${id}`);
    const input = page.getByRole("textbox", { name: "Message", exact: true });
    await expect(page.locator(".composer-queued-row")).toHaveCount(18);
    await input.fill("Unsent draft remains editable during the run.\n".repeat(4));
    await contained(input, width);
    await expect(input).toBeInViewport();
    await contained(page.locator(".composer-queue-strip"), width);
    await capture(page, `long-queue-${theme}-${width}.png`);
    const model = page.locator(".composer-model-trigger");
    await expect(model).toBeEnabled();
    await model.click();
    const menu = page.locator(".composer-model-panel");
    await expect(menu).toBeVisible();
    await contained(menu, width);
    await expect(menu).toContainText("Offline fixture");
    await capture(page, `midrun-model-menu-${theme}-${width}.png`);
    // Dismiss by clicking the same control; no set_model or prompt is sent.
    await model.click();
    await expect(menu).toHaveCount(0);
    await expect(input).toHaveValue("Unsent draft remains editable during the run.\n".repeat(4));
    expect(writes).toEqual([]);
  });
}
