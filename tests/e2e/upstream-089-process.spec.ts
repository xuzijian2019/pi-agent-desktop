import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { SESSIONS_DIR, WORK_ROOT } from "./sandbox";

const firstThinking = "Recorded first working-step reasoning.";
const secondThinking = "Recorded second working-step reasoning.";
const finalAnswer = "Recorded final answer remains visible.";
const newestArgument = `final-${"long-path-segment-".repeat(10)}.md`;

async function seed(request: APIRequestContext) {
  const id = randomUUID();
  const cwd = path.join(WORK_ROOT, `process-089-${id}`);
  await mkdir(cwd, { recursive: true });
  const selected = await request.post("/api/cwd/validate", { data: { cwd } });
  expect(selected.ok()).toBe(true);
  expect(await selected.json()).toMatchObject({ success: true, cwd });
  await expect.poll(async () => (await request.get(`/api/worktrees?cwd=${encodeURIComponent(cwd)}`)).status()).toBe(200);
  const directory = path.join(SESSIONS_DIR, `--${cwd.replace(/^\//, "").replaceAll("/", "-")}--`);
  await mkdir(directory, { recursive: true });
  const now = Date.now();
  const timestamp = new Date(now).toISOString();
  const usage = { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
  const assistant = { role: "assistant", api: "openai-completions", provider: "fixture-ui", model: "fixture", usage, stopReason: "toolUse" };
  const step = (index: number, thinking: string, filename: string) => ({
    ...assistant, timestamp: now + index * 3000,
    content: [{ type: "thinking", thinking }, { type: "toolCall", id: `fixture-read-${index}`, name: "read", arguments: { path: filename } }],
  });
  const result = (index: number, isError: boolean) => ({
    role: "toolResult", toolCallId: `fixture-read-${index}`, toolName: "read", isError,
    timestamp: now + index * 3000 + 1000,
    content: [{ type: "text", text: isError ? "Recorded read failure." : "Recorded read result." }],
  });
  const messages = [
    { role: "user", timestamp: now, content: "Review the recorded tool steps without running anything." },
    step(1, firstThinking, "first.md"), result(1, false),
    step(2, secondThinking, newestArgument), result(2, true),
    { ...assistant, timestamp: now + 9000, stopReason: "stop", content: [{ type: "text", text: finalAnswer }] },
  ];
  const entries: unknown[] = [{ type: "session", version: 3, id, cwd, timestamp }];
  messages.forEach((message, index) => entries.push({
    type: "message", id: `record-${index}`, parentId: index ? `record-${index - 1}` : null, timestamp, message,
  }));
  await writeFile(path.join(directory, `${timestamp.replaceAll(":", "-")}_${id}.jsonl`), entries.map(entry => JSON.stringify(entry)).join("\n") + "\n");
  await expect.poll(async () => (await (await request.get("/api/sessions?force=1")).json()).sessions.some((s: { id: string }) => s.id === id)).toBe(true);
  return id;
}

for (const [width, theme] of [[1280, "light"], [390, "dark"]] as const) {
  test(`tool steps fold and share the Settings thinking preference (${width} ${theme})`, async ({ page, request }, info) => {
    const id = await seed(request);
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(theme => {
      localStorage.setItem("pi-locale", "en");
      localStorage.setItem("pi-theme", theme);
    }, theme);
    await page.route("**/api/updates**", route => route.fulfill({ json: { components: [], updates: [] } }));
    await page.route(`**/api/agent/${id}`, async route => {
      if (route.request().method() !== "POST") return route.fallback();
      const command = route.request().postDataJSON() as { type: string };
      expect(["get_tools", "get_commands"]).toContain(command.type);
      return route.fulfill({ json: { success: true, data: command.type === "get_tools" ? [] : { commands: [] } } });
    });

    await page.goto(`/?session=${id}`);
    const answer = page.getByText(finalAnswer, { exact: true });
    const details = page.locator(".process-details");
    const detailsTrigger = details.locator(".process-details-trigger");
    const group = details.locator(".tool-step-group");
    const groupTrigger = group.locator(".tool-step-group-trigger");
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(answer).toBeVisible();
    await expect(detailsTrigger).toHaveAttribute("aria-expanded", "false");
    await detailsTrigger.click();
    await expect(groupTrigger).toHaveAttribute("aria-expanded", "false");
    await expect(groupTrigger).toContainText("read ×2");
    await expect(groupTrigger).toContainText("2 calls");
    await expect(groupTrigger).toContainText("1 failed");
    await expect(groupTrigger.locator(".tool-step-group-preview")).toContainText(newestArgument.slice(0, 120));
    await expect(group.locator(".tool-step-group-content")).toHaveCount(0);
    const bounds = await groupTrigger.boundingBox();
    expect(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width + 1).toBeTruthy();
    await page.screenshot({ path: info.outputPath(`process-folded-${theme}-${width}.png`), animations: "disabled" });

    await groupTrigger.click();
    await expect(groupTrigger).toHaveAttribute("aria-expanded", "true");
    await expect(group.locator(".msg-tool-header")).toHaveCount(2);
    await expect(group.getByText(firstThinking, { exact: true })).toHaveCount(0);
    await expect(group.getByText(secondThinking, { exact: true })).toHaveCount(0);
    await details.getByRole("button", { name: "Show thinking", exact: true }).click();
    await expect(group.getByText(firstThinking, { exact: true })).toBeVisible();
    await expect(group.getByText(secondThinking, { exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath(`process-thinking-${theme}-${width}.png`), animations: "disabled" });

    await page.keyboard.press("Control+,");
    const settings = page.getByRole("dialog", { name: "Settings", exact: true });
    const preference = settings.getByRole("radiogroup", { name: "Thinking in working steps", exact: true });
    await expect(preference.getByRole("radio", { name: "Show", exact: true })).toHaveAttribute("aria-checked", "true");
    await preference.getByRole("radio", { name: "Hide", exact: true }).click();
    await expect(preference.getByRole("radio", { name: "Hide", exact: true })).toHaveAttribute("aria-checked", "true");
    await page.screenshot({ path: info.outputPath(`process-preference-${theme}-${width}.png`), animations: "disabled" });
    await settings.getByRole("button", { name: "Close", exact: true }).click();
    await expect(details.getByRole("button", { name: "Show thinking", exact: true })).toHaveAttribute("aria-pressed", "false");
    await expect(group.getByText(firstThinking, { exact: true })).toHaveCount(0);
    await expect(answer).toBeVisible();

    await details.getByRole("button", { name: "Show thinking", exact: true }).click();
    await page.reload();
    await expect(answer).toBeVisible();
    if ((await detailsTrigger.getAttribute("aria-expanded")) !== "true") await detailsTrigger.click();
    await expect(details.getByRole("button", { name: "Hide thinking", exact: true })).toHaveAttribute("aria-pressed", "true");
    if ((await groupTrigger.getAttribute("aria-expanded")) !== "true") await groupTrigger.click();
    await expect(group.getByText(secondThinking, { exact: true })).toBeVisible();
  });
}
