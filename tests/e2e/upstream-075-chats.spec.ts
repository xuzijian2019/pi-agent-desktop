import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { SESSIONS_DIR, WORK_ROOT } from "./sandbox";

async function seed(cwd: string, name: string) {
  const id = randomUUID(), messageId = randomUUID(), timestamp = new Date().toISOString();
  const directory = path.join(SESSIONS_DIR, `--${cwd.replace(/^\//, "").replaceAll("/", "-")}--`);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, `${timestamp.replaceAll(":", "-")}_${id}.jsonl`), [
    { type: "session", version: 3, id, cwd, timestamp },
    { type: "message", id: messageId, parentId: null, timestamp, message: { role: "user", content: name, timestamp: Date.now() } },
    { type: "session_info", id: randomUUID(), parentId: messageId, timestamp, name },
  ].map(value => JSON.stringify(value)).join("\n") + "\n");
  return id;
}

test("Chats stay separate from projects across navigation, themes and narrow layouts", async ({ page, request }, info) => {
  test.setTimeout(180_000);
  const cwd = path.join(WORK_ROOT, `chat-boundary-${randomUUID()}`);
  await mkdir(cwd, { recursive: true });
  const chatResponse = await request.get("/api/chat-workspace");
  expect(chatResponse.ok()).toBe(true);
  const chatCwd = (await chatResponse.json()).cwd as string;
  const chatName = "Chat  with  repeated spaces and a deliberately long descriptive title for narrow screens";
  const chatId = await seed(chatCwd, chatName);
  const projectId = await seed(cwd, "Project boundary fixture");
  await expect.poll(async () => {
    const data = await (await request.get("/api/sessions?force=1")).json();
    return data.sessions.find((session: { id: string }) => session.id === chatId)?.workspaceKind;
  }).toBe("chat");

  await page.goto(`/?session=${chatId}`);
  const composer = page.getByRole("textbox", { name: "Message", exact: true });
  await expect(composer).toBeEditable();
  await expect(page.locator(".sidebar-chats-list")).toContainText(chatName);
  await expect(page.locator(".sidebar-project-tree-group").filter({ hasText: chatName })).toHaveCount(0);
  await expect(page.locator(".right-panel-toggle-button")).toHaveCount(0);
  await composer.fill("unsent chat draft");

  await page.locator(`.sidebar-project-tree-group a[href="?session=${projectId}"]`).click();
  await expect(page).toHaveURL(new RegExp(projectId));
  await expect(page.locator(".right-panel-toggle-button")).toBeVisible();
  await expect(composer).toHaveValue("");
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(chatId));
  await expect(composer).toHaveValue("unsent chat draft");
  await expect(page.locator(".right-panel-toggle-button")).toHaveCount(0);

  for (const theme of ["light", "dark"]) {
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 850 });
      await page.evaluate(theme => {
        document.documentElement.dataset.theme = theme;
        document.documentElement.classList.toggle("dark", theme === "dark");
      }, theme);
      await expect(composer).toBeEditable();
      const bounds = await composer.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.width).toBeGreaterThan(100);
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
      await page.screenshot({ path: info.outputPath(`075-chats-${theme}-${width}.png`) });
    }
  }
});
