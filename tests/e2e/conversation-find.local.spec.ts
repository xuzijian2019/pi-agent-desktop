import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { SESSIONS_DIR, WORK_ROOT } from "./sandbox";

for (const width of [1280, 390]) {
  test(`find searches a real conversation at ${width}px`, async ({ page, request }, info) => {
    const id = randomUUID();
    const cwd = path.join(WORK_ROOT, `find-${id}`);
    const timestamp = new Date().toISOString();
    const userId = randomUUID();
    await mkdir(cwd, { recursive: true });
    const directory = path.join(SESSIONS_DIR, `--${cwd.replace(/^\//, "").replaceAll("/", "-")}--`);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, `${timestamp.replaceAll(":", "-")}_${id}.jsonl`), [
      { type: "session", version: 3, id, cwd, timestamp },
      { type: "message", id: userId, parentId: null, timestamp, message: { role: "user", content: "Find a distinctive needle in this conversation.", timestamp: Date.now() } },
      { type: "message", id: randomUUID(), parentId: userId, timestamp, message: {
        role: "assistant", content: [{ type: "text", text: "Another needle appears here." }],
        api: "anthropic-messages", provider: "anthropic", model: "fixture",
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: "stop", timestamp: Date.now(),
      } },
    ].map(entry => JSON.stringify(entry)).join("\n") + "\n");
    await expect.poll(async () => {
      const data = await (await request.get("/api/sessions?force=1")).json();
      return data.sessions.some((session: { id: string }) => session.id === id);
    }).toBe(true);
    await expect.poll(async () => (await request.get(`/api/worktrees?cwd=${encodeURIComponent(cwd)}`)).status(), { timeout: 15_000 }).toBe(200);
    await page.setViewportSize({ width, height: 850 });
    await page.goto(`/?session=${id}`);
    const composer = page.getByRole("textbox", { name: "Message", exact: true });
    await expect(page.getByText("Another needle appears here.")).toBeVisible();
    await composer.focus();
    await page.keyboard.press("Control+f");
    const find = page.getByRole("search", { name: "Find in conversation" });
    const input = find.getByRole("textbox", { name: "Find in conversation" });
    await expect(input).toBeFocused();
    await input.fill("needle");
    await expect(find.getByRole("status")).toHaveText("1 / 2");
    await input.press("Enter");
    await expect(find.getByRole("status")).toHaveText("2 / 2");
    await page.screenshot({ path: info.outputPath(`conversation-find-${width}.png`) });
    await input.press("Escape");
    await expect(find).toBeHidden();
    await expect(composer).toBeFocused();
  });
}
