import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { SESSIONS_DIR, WORK_ROOT } from "./sandbox";

test("a persisted reasoning refusal opens the exact custom model without retrying", async ({ page, request }, info) => {
  const id = randomUUID();
  const cwd = path.join(WORK_ROOT, `model-refusal-${id}`);
  const directory = path.join(SESSIONS_DIR, `--${cwd.replace(/^\//, "").replaceAll("/", "-")}--`);
  const provider = "mock-gemini-gateway";
  const model = "fixture-gemini-target";
  const timestamp = new Date().toISOString();
  await mkdir(directory, { recursive: true });
  await mkdir(cwd, { recursive: true });
  const entries = [
    { type: "session", version: 3, id, cwd, timestamp },
    { type: "message", id: "a0000001", parentId: null, timestamp, message: { role: "user", content: "Synthetic reasoning-level refusal", timestamp: Date.now() } },
    { type: "message", id: "a0000002", parentId: "a0000001", timestamp, message: {
      role: "assistant", content: [], api: "google-generative-ai", provider, model,
      stopReason: "error", errorMessage: JSON.stringify({ error: { code: 400, status: "INVALID_ARGUMENT", message: "thinking_level must be one of: LOW, HIGH" } }),
      timestamp: Date.now(), usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    } },
  ];
  await writeFile(path.join(directory, `${timestamp.replaceAll(":", "-")}_${id}.jsonl`), entries.map(entry => JSON.stringify(entry)).join("\n") + "\n");
  await expect.poll(async () => (await (await request.get("/api/sessions?force=1")).json()).sessions.some((row: { id: string }) => row.id === id)).toBe(true);
  await expect.poll(async () => (await request.get(`/api/worktrees?cwd=${encodeURIComponent(cwd)}`)).status()).toBe(200);

  await page.setViewportSize({ width: 390, height: 900 });
  await page.addInitScript(() => {
    localStorage.setItem("pi-locale", "en");
    localStorage.setItem("pi-theme", "dark");
  });
  let writes = 0;
  const unexpected: string[] = [];
  await page.route("**/api/models-config", async route => {
    if (route.request().method() !== "GET") {
      writes++;
      await route.abort();
      return;
    }
    const common = { reasoning: true, input: ["text"] };
    await route.fulfill({ json: { providers: { [provider]: {
      name: "Mock Gemini gateway", api: "google-generative-ai", baseUrl: "https://gemini-fixture.invalid/v1",
      models: [{ ...common, id: "fixture-gemini-first", name: "Incorrect first model" }, { ...common, id: model, name: "Correct refusal target" }],
    } } } });
  });
  await page.route("**/api/models-config/test", async route => {
    unexpected.push(route.request().url());
    await route.abort();
  });
  await page.route(`**/api/agent/${id}`, async route => {
    if (route.request().method() === "POST" && route.request().postDataJSON()?.type === "prompt") {
      unexpected.push("prompt");
      await route.abort();
    } else await route.continue();
  });
  await page.goto(`/?session=${id}`);
  const hint = page.locator(".thinking-refusal-hint");
  await expect(hint).toHaveCount(1);
  await expect(hint).toContainText("LOW, HIGH");
  await page.screenshot({ path: info.outputPath("chat-thinking-refusal-dark-390.png"), animations: "disabled" });
  await hint.getByRole("button", { name: "Model settings", exact: true }).click();
  const dialog = page.locator(".settings-dialog-surface");
  await expect(dialog.getByRole("combobox", { name: "Settings section" })).toContainText("Models");
  const field = dialog.getByPlaceholder("model-id", { exact: true });
  await expect(field).toHaveValue(model);
  await page.screenshot({ path: info.outputPath("chat-thinking-refusal-target-dark-390.png"), animations: "disabled" });
  expect(writes).toBe(0);
  expect(unexpected).toEqual([]);
});
