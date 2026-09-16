import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { AGENT_DIR, SESSIONS_DIR, WORK_ROOT } from "./sandbox";

type SessionRow = { id: string; cwd: string; path: string };

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

async function jsonlForSession(sessionId: string): Promise<string> {
  let file = "";
  await expect.poll(async () => {
    const entries = await readdir(SESSIONS_DIR, { recursive: true, withFileTypes: true });
    const hit = entries.find((e) => e.isFile() && e.name.endsWith(`${sessionId}.jsonl`));
    if (!hit) return false;
    file = path.join(hit.parentPath, hit.name);
    return true;
  }, { message: `no jsonl on disk for ${sessionId}`, timeout: 60_000 }).toBe(true);
  return readFile(file, "utf-8");
}

/**
 * Bash results live behind the collapsed tool-call header. Re-click on each
 * attempt: a transcript reload between click and assertion remounts the block
 * with its collapsed default.
 */
async function expandBashOutput(page: Page, header: string, marker: string) {
  const block = page.getByRole("button", { name: header });
  await expect(block).toBeVisible({ timeout: 60_000 });
  const output = page.getByText(marker, { exact: true });
  await expect(async () => {
    if (!(await output.isVisible())) await block.click();
    await expect(output).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 60_000 });
}

test("bash-only session: run, persist to disk, reopen after reload", async ({ page, request }) => {
  const marker = `pi-e2e-${randomUUID()}`;
  // Directory name stays marker-free so UI assertions cannot match the sidebar
  // project label instead of the command output.
  const cwd = path.join(WORK_ROOT, `run-${randomUUID()}`);
  await mkdir(cwd, { recursive: true });
  const header = `bash printf '%s\\n' ${marker}`;

  await page.goto(`/?cwd=${encodeURIComponent(cwd)}`);

  const composer = page.getByPlaceholder("Message…", { exact: false });
  await expect(composer).toBeVisible();
  await composer.fill(`!printf '%s\\n' ${marker}`);
  await composer.press("Enter");

  await expandBashOutput(page, header, marker);

  const session = await findSession(request, cwd);

  // Isolation: sessions were written into the sandbox agent dir, not real ~/.pi.
  expect(session.path.startsWith(AGENT_DIR)).toBe(true);

  const jsonl = await jsonlForSession(session.id);
  expect(jsonl).toContain(marker);

  await page.goto(`/?session=${session.id}`);
  await expandBashOutput(page, header, marker);
});
