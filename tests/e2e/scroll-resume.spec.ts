import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { SESSIONS_DIR, WORK_ROOT } from "./sandbox";

declare global { interface Window { emitScrollFixture: (event: unknown) => void } }

// Real app, hook, scroll events and layout; synthetic SSE avoids a model call.
for (const theme of ["light", "dark"] as const) for (const width of [1280, 390]) {
  test(`jump to latest resumes streaming follow, ${theme} ${width}`, async ({ page }, info) => {
    const id = randomUUID(), cwd = path.join(WORK_ROOT, `scroll-${id}`);
    await mkdir(cwd, { recursive: true });
    const dir = path.join(SESSIONS_DIR, `--${cwd.replace(/^\//, "").replaceAll("/", "-")}--`);
    await mkdir(dir, { recursive: true });
    const timestamp = new Date().toISOString();
    const assistant = (text: string) => ({ role: "assistant", content: [{ type: "text", text }], api: "anthropic-messages", provider: "anthropic", model: "claude-sonnet-4-20250514", stopReason: "stop", timestamp: Date.now(), usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
    await writeFile(path.join(dir, `${timestamp.replaceAll(":", "-")}_${id}.jsonl`), [
      { type: "session", version: 3, id, cwd, timestamp },
      { type: "message", id: "user1", parentId: null, timestamp, message: { role: "user", content: "Scroll follow regression fixture", timestamp: Date.now() } },
      { type: "message", id: "answer1", parentId: "user1", timestamp, message: assistant(Array.from({ length: 50 }, (_, i) => `History paragraph ${i}: long content for deliberate reading.\n`).join("\n")) },
    ].map(entry => JSON.stringify(entry)).join("\n") + "\n");
    await page.setViewportSize({ width, height: 850 });
    await page.addInitScript(({ id, theme }) => {
      localStorage.setItem("pi-theme", theme); localStorage.setItem("pi-locale", "en");
      const Original = window.EventSource;
      class FixtureSource extends EventTarget {
        readyState = 1; onmessage: ((event: MessageEvent) => void) | null = null;
        onerror = null; close() { this.readyState = 2; }
        constructor() {
          super();
          window.emitScrollFixture = event => this.onmessage?.(new MessageEvent("message", { data: JSON.stringify(event) }));
          setTimeout(() => window.emitScrollFixture({ type: "connected" }), 0);
        }
      }
      window.EventSource = new Proxy(Original, { construct(target, args) {
        if (String(args[0]).includes(`/api/agent/${id}/events`)) return new FixtureSource();
        return Reflect.construct(target, args);
      } });
    }, { id, theme });
    await page.route(`**/api/agent/${id}`, route => route.fulfill({ json: { running: true, state: { isStreaming: true, isPromptRunning: true, messages: [] } } }));
    await page.route(`**/api/sessions/${id}/state`, route => route.fulfill({ json: { running: true, state: { isStreaming: true, isPromptRunning: true } } }));
    await page.goto(`/?session=${id}`);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeVisible();
    await expect(page.getByText("History paragraph 49: long content for deliberate reading.", { exact: true })).toBeAttached();
    await expect.poll(() => page.evaluate(() => typeof window.emitScrollFixture)).toBe("function");
    await page.evaluate(() => window.emitScrollFixture({ type: "agent_start" }));
    await page.evaluate(message => window.emitScrollFixture({ type: "message_start", message }), assistant(""));
    let emittedLines = 0;
    const stream = async (lines: number) => {
      const delta = Array.from({ length: lines - emittedLines }, (_, i) => `Live streaming paragraph ${emittedLines + i}.\n\n`).join("");
      await page.evaluate(delta => window.emitScrollFixture({ type: "message_update", assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta } }), delta);
      emittedLines = lines;
      await expect(page.getByText(`Live streaming paragraph ${lines - 1}.`, { exact: true })).toBeAttached();
    };
    const scroll = page.locator(".chat-scroll-container");
    await expect(scroll).toBeVisible();
    const tailGap = () => scroll.evaluate(el => el.scrollHeight - el.scrollTop - el.clientHeight);
    await stream(10);
    await expect.poll(tailGap).toBeLessThanOrEqual(8);
    await scroll.hover(); await page.mouse.wheel(0, -600);
    await expect.poll(tailGap).toBeGreaterThan(100);
    const button = page.getByRole("button", { name: "Scroll to latest", exact: true });
    await expect(button).toBeVisible();
    const detachedTop = await scroll.evaluate(el => el.scrollTop);
    await stream(20);
    await expect.poll(() => scroll.evaluate(el => el.scrollTop)).toBeCloseTo(detachedTop, 0);
    await button.click();
    await expect.poll(tailGap).toBeLessThanOrEqual(8);
    await stream(35);
    await expect.poll(tailGap).toBeLessThanOrEqual(8);
    await expect(button).not.toHaveClass(/is-visible/);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await page.screenshot({ path: info.outputPath(`resumed-${theme}-${width}.png`) });
    // Repeated user intent still detaches after explicitly resuming.
    await scroll.hover(); await page.mouse.wheel(0, -500);
    await expect.poll(tailGap).toBeGreaterThan(100);
    const secondTop = await scroll.evaluate(el => el.scrollTop);
    await stream(45);
    await expect.poll(() => scroll.evaluate(el => el.scrollTop)).toBeCloseTo(secondTop, 0);
  });
}
