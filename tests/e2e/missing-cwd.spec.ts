import { randomUUID } from "node:crypto";
import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { SESSIONS_DIR, WORK_ROOT } from "./sandbox";

type SessionRow = { id: string; cwd: string; projectRoot?: string; path: string; cwdMissing?: boolean };

async function findSession(request: APIRequestContext, cwd: string): Promise<SessionRow> {
  let found: SessionRow | undefined;
  await expect.poll(async () => {
    const response = await request.get("/api/sessions");
    if (!response.ok()) return false;
    const { sessions } = await response.json() as { sessions: SessionRow[] };
    found = sessions.find((s) => s.cwd === cwd && Boolean(s.path));
    return Boolean(found);
  }, { message: `no session listed for ${cwd}`, timeout: 60_000 }).toBe(true);
  return found!;
}

/** The list can serve a live in-memory row before pi flushes; wait for the file. */
async function waitForSessionFile(sessionId: string) {
  await expect.poll(async () => {
    const entries = await readdir(SESSIONS_DIR, { recursive: true, withFileTypes: true });
    return entries.some((e) => e.isFile() && e.name.endsWith(`${sessionId}.jsonl`));
  }, { message: `no jsonl on disk for ${sessionId}`, timeout: 60_000 }).toBe(true);
}

/**
 * A project whose directory is deleted after its sessions were recorded. Every
 * cwd-scoped API call for it answers 403, so the UI must not offer a composer
 * there: the project row's + is disabled and the chat area explains the state
 * instead of rendering chips and dialogs that all read "Access denied".
 */
test("deleted project folder: the + is disabled and the chat area explains why", async ({ page, request }) => {
  const marker = `pi-e2e-${randomUUID()}`;
  // Marker-free directory name so UI assertions cannot match the project label.
  const cwd = path.join(WORK_ROOT, `gone-${randomUUID()}`);
  await mkdir(cwd, { recursive: true });

  // A bash command is enough to make pi record a session for this cwd.
  await page.goto(`/?cwd=${encodeURIComponent(cwd)}`);
  const composer = page.getByRole("textbox", { name: "Message", exact: true });
  await expect(composer).toBeVisible();
  await composer.fill(`!printf '%s\\n' ${marker}`);
  await composer.press("Enter");

  const session = await findSession(request, cwd);
  await waitForSessionFile(session.id);
  const projectRoot = session.projectRoot ?? session.cwd;

  await rm(cwd, { recursive: true, force: true });

  // The session list is cached server-side for 30s; let it notice the deletion
  // before loading a page whose sidebar reads that list exactly once.
  await expect.poll(async () => {
    const response = await request.get("/api/sessions");
    if (!response.ok()) return false;
    const { sessions } = await response.json() as { sessions: SessionRow[] };
    return sessions.find((s) => s.id === session.id)?.cwdMissing === true;
  }, { message: "the session list still reports the deleted cwd as present", timeout: 60_000 }).toBe(true);

  // The project stays in the sidebar — its sessions are still on disk — but it
  // can no longer host a new one.
  await page.goto("/");
  const newSessionButton = page.getByRole("button", { name: `New session in ${projectRoot}` });
  await expect(newSessionButton).toBeVisible();
  await expect(newSessionButton).toBeDisabled();
  await expect(newSessionButton).toHaveAttribute("aria-disabled", "true");
  await expect(newSessionButton).toHaveAttribute("title", "Project directory no longer exists");

  // Opening one of its sessions shows the missing-folder state, not a composer
  // wired to a directory that rejects every request.
  await page.goto(`/?session=${session.id}`);
  await expect(page.getByText("This folder no longer exists")).toBeVisible();
  await expect(page.getByText(cwd, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove project" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Pick a new folder" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Message", exact: true })).toHaveCount(0);

  // The whole point: no 403 leaking into the interface.
  await expect(page.getByText("Access denied")).toHaveCount(0);
});
