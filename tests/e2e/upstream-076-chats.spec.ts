import { test, expect, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { SESSIONS_DIR } from "./sandbox";

// Real JSONL fixtures and real HTTP routes, not mocked access responses. The
// assistant entry makes the session durable when pi rebuilds it after unlocking.
async function seedChat(root: string, name: string) {
  const id = randomUUID();
  const cwd = path.join(root, `fixture-long-chat-folder-for-narrow-screen-${id}`);
  const timestamp = new Date().toISOString();
  const userId = randomUUID(), assistantId = randomUUID();
  await mkdir(cwd, { recursive: true });
  const directory = path.join(SESSIONS_DIR, `--${cwd.replace(/^\//, "").replaceAll("/", "-")}--`);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, `${timestamp.replaceAll(":", "-")}_${id}.jsonl`), [
    { type: "session", version: 3, id, cwd, timestamp },
    { type: "message", id: userId, parentId: null, timestamp, message: { role: "user", content: name, timestamp: Date.now() } },
    { type: "message", id: assistantId, parentId: userId, timestamp, message: {
      role: "assistant", content: [{ type: "text", text: "Synthetic offline reply. This deliberately long conversation checks that the chat permission menu and confirmation remain readable without granting another conversation access." }],
      api: "anthropic-messages", provider: "anthropic", model: "claude-sonnet-4-20250514",
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: "stop", timestamp: Date.now(),
    } },
    { type: "session_info", id: randomUUID(), parentId: assistantId, timestamp, name },
  ].map(entry => JSON.stringify(entry)).join("\n") + "\n");
  return { id, cwd };
}

async function access(request: APIRequestContext, id: string) {
  const response = await request.get(`/api/sessions/${id}/chat-access`);
  expect(response.ok()).toBe(true);
  return response.json();
}

async function openAccessMenu(page: Page, unlocked = false) {
  const button = page.getByRole("button", { name: unlocked ? "Chat · computer" : "Chat", exact: true });
  if (!(await button.isVisible())) {
    await page.getByRole("button", { name: "More controls", exact: true }).click();
  }
  await button.click();
  const toggle = page.getByRole("menuitemcheckbox", { name: "Let this chat use my computer", exact: true });
  await expect(toggle).toHaveAttribute("aria-checked", String(unlocked));
  return toggle;
}

async function fitsViewport(locator: Locator, width: number) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(100);
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
}

for (const theme of ["light", "dark"] as const) {
  for (const width of [1280, 390]) {
    test(`chat folder access is explicit and scoped, ${theme} ${width}`, async ({ page, request }, info) => {
      await page.setViewportSize({ width, height: 850 });
      await page.addInitScript(theme => {
        localStorage.setItem("pi-theme", theme);
        localStorage.setItem("pi-locale", "en");
      }, theme);
      const rootResponse = await request.get("/api/chat-workspace");
      expect(rootResponse.ok()).toBe(true);
      const { cwd: root } = await rootResponse.json();
      const other = await seedChat(root, "Other chat must remain locked");
      const current = await seedChat(root, "Chat with a deliberately long descriptive title and repeated  spaces for narrow layout review");
      expect(current.cwd).not.toBe(other.cwd);
      await expect.poll(async () => {
        const response = await request.get("/api/sessions?force=1");
        expect(response.ok()).toBe(true);
        const { sessions } = await response.json();
        return sessions.find((row: { id: string }) => row.id === current.id)?.workspaceKind;
      }).toBe("chat");
      expect(await access(request, current.id)).toMatchObject({ chat: true, folder: current.cwd, unlocked: false, available: true });
      expect(await access(request, other.id)).toMatchObject({ folder: other.cwd, unlocked: false });

      // Exercise the server guard with a harmless command, without a model call.
      const bash = await request.post(`/api/agent/${current.id}`, { data: { type: "bash", command: "printf must-not-run" } });
      expect(bash.ok()).toBe(false);
      expect((await bash.json()).error).toContain("Shell commands are unavailable in chats");
      await page.goto(`/?session=${current.id}`);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      const composer = page.getByRole("textbox", { name: "Message", exact: true });
      await expect(composer).toBeEditable();
      // Own-folder chats can inspect generated files, without granting shell access.
      await expect(page.locator(".right-panel-toggle-button")).toBeVisible();
      await expect(page.locator(".file-tab-add")).toHaveCount(0);
      await composer.fill("Unsent draft stays in this chat through permission changes.");

      const toggle = await openAccessMenu(page);
      await expect(page.getByRole("menuitem", { name: "Show chat folder", exact: true })).toHaveAttribute("title", current.cwd);
      await fitsViewport(page.locator(".composer-dropdown-panel.is-tools"), width);
      const accessMenu = page.locator(".composer-dropdown-panel.is-tools");
      expect((await accessMenu.boundingBox())!.width).toBeGreaterThanOrEqual(280);
      const menuBox = (await accessMenu.boundingBox())!;
      const chatBox = (await page.locator(".chat-window").boundingBox())!;
      expect(menuBox.x).toBeGreaterThanOrEqual(chatBox.x);
      expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(chatBox.x + chatBox.width + 1);
      const switchBox = await toggle.locator(".chat-access-switch").boundingBox();
      expect(switchBox).not.toBeNull();
      expect(switchBox!.width).toBeGreaterThanOrEqual(26);
      expect(switchBox!.height).toBeGreaterThanOrEqual(15);
      await expect(toggle).toHaveCSS("display", "flex");
      await page.screenshot({ path: info.outputPath(`076-access-${theme}-${width}.png`), animations: "disabled" });
      await toggle.click();
      const dialog = page.getByRole("dialog", { name: "Let this chat use your computer?", exact: true });
      await fitsViewport(dialog, width);
      await expect(dialog).toContainText("run shell commands and read and change files");
      await page.screenshot({ path: info.outputPath(`076-confirm-${theme}-${width}.png`), animations: "disabled" });
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(dialog).toHaveCount(0);
      expect((await access(request, current.id)).unlocked).toBe(false);

      await (await openAccessMenu(page)).click();
      await dialog.getByRole("button", { name: "Allow", exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect.poll(async () => (await access(request, current.id)).unlocked).toBe(true);
      expect((await access(request, other.id)).unlocked).toBe(false);
      await expect(composer).toHaveValue("Unsent draft stays in this chat through permission changes.");
      await (await openAccessMenu(page, true)).click();
      const lockDialog = page.getByRole("dialog", { name: "Stop this chat from using your computer?", exact: true });
      await lockDialog.getByRole("button", { name: "Turn off", exact: true }).click();
      await expect(lockDialog).toHaveCount(0);
      await expect.poll(async () => (await access(request, current.id)).unlocked).toBe(false);
      expect((await access(request, other.id)).unlocked).toBe(false);
      await fitsViewport(composer, width);

      if (width === 1280) {
        const header = page.locator(".sidebar-chats-header");
        await header.hover();
        await header.getByRole("button", { name: "Chats menu", exact: true }).click();
        await page.getByRole("menuitem", { name: "Collapse chats", exact: true }).click();
        await expect(header.locator(".sidebar-chats-title")).toHaveAttribute("aria-expanded", "false");
        await page.reload();
        await expect(header.locator(".sidebar-chats-title")).toHaveAttribute("aria-expanded", "false");
        await header.hover();
        await header.getByRole("button", { name: "Chats menu", exact: true }).click();
        await page.getByRole("menuitem", { name: "Expand chats", exact: true }).click();
        await expect(page.locator(`.sidebar-chats-list a[href="?session=${current.id}"]`)).toBeVisible();
      }
      await expect(composer).toBeEditable();
      await page.screenshot({ path: info.outputPath(`076-chat-${theme}-${width}.png`), animations: "disabled" });
    });
  }
}
