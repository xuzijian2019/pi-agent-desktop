import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { SESSIONS_DIR, WORK_ROOT } from "./sandbox";

test("artifact cards open in the fork panel with isolated previews and local file tabs", async ({ page, request }) => {
  const id = randomUUID();
  const cwd = path.join(WORK_ROOT, `artifact-${id}`);
  await mkdir(cwd, { recursive: true });
  await writeFile(path.join(cwd, "readme.txt"), "LOCAL_FILE_TAB");
  const dir = path.join(SESSIONS_DIR, `--${cwd.replace(/^\//, "").replaceAll("/", "-")}--`);
  await mkdir(dir, { recursive: true });
  const timestamp = new Date().toISOString();
  const text = ':::artifact{identifier="preview" type="html" title="Merge artifact"}\n```html\n<!DOCTYPE html><html><body><p id="fixture">Before</p><script>document.querySelector("#fixture").textContent="ARTIFACT_PREVIEW_OK"</script></body></html>\n```\n:::';
  const entries = [
    { type: "session", version: 3, id, cwd, timestamp },
    { type: "message", id: "user0001", parentId: null, timestamp, message: { role: "user", content: "Create a preview", timestamp: Date.now() } },
    { type: "message", id: "answer01", parentId: "user0001", timestamp, message: {
      role: "assistant", content: [{ type: "text", text }], api: "openai-completions", provider: "openai", model: "fixture", stopReason: "stop", timestamp: Date.now(),
      usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    } },
  ];
  await writeFile(path.join(dir, `${timestamp.replaceAll(":", "-")}_${id}.jsonl`), entries.map(entry => JSON.stringify(entry)).join("\n") + "\n");
  await expect.poll(async () => {
    const response = await request.get("/api/sessions?force=1");
    const data = await response.json();
    return data.sessions.some((session: { id: string }) => session.id === id);
  }).toBe(true);
  const renamed = await request.patch(`/api/sessions/${id}`, { data: { name: "Artifact acceptance" } });
  expect(renamed.ok(), await renamed.text()).toBeTruthy();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`/?session=${id}`);
  await page.locator(".artifact-card").filter({ hasText: "Merge artifact" }).click();
  const panel = page.locator("#file-panel");
  await expect(panel.getByRole("tab", { name: "Merge artifact", exact: true })).toBeVisible();
  await expect(panel.locator(".artifact-panel iframe")).toHaveAttribute("sandbox", /^allow-scripts(?: |$)/);
  await expect(panel.locator(".artifact-panel iframe")).not.toHaveAttribute("sandbox", /allow-same-origin/);
  await expect(page.frameLocator(".artifact-panel iframe").locator("#fixture")).toHaveText("ARTIFACT_PREVIEW_OK");
  await panel.locator(".file-tree-toggle").click();
  await panel.getByText("readme.txt", { exact: true }).click();
  await expect(panel.getByRole("tab", { name: "readme.txt", exact: true })).toBeVisible();
  await expect(panel.locator(".file-viewer-shell")).toContainText("LOCAL_FILE_TAB");
  await panel.getByRole("tab", { name: "Merge artifact", exact: true }).click();
  await expect(page.frameLocator(".artifact-panel iframe").locator("#fixture")).toHaveText("ARTIFACT_PREVIEW_OK");
  await panel.getByRole("button", { name: "Hide workspace", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeFocused();
  await page.screenshot({ path: test.info().outputPath("artifact-and-file-tabs.png") });
  expect(errors).toEqual([]);
});
