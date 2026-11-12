import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url, { alias: { "@": process.cwd() } });
const { DELETE } = await jiti.import("./[id]/route.ts");
const { cacheSessionPath, invalidateSessionPathCache, invalidateSessionListCache } = await jiti.import("../../../lib/session-reader.ts");

for (const mode of ["parent", "descendant", "queued-descendant", "live-descendant", "idle", "explicit"]) {
  test(`bulk delete checks current ${mode} state without relying on dialog snapshot`, async (t) => {
    const dir = await mkdtemp(join(tmpdir(), "pi-idle-delete-"));
    const saved = { sessions: globalThis.__piSessions, runs: globalThis.__piSubagentRuns, agent: process.env.PI_CODING_AGENT_DIR };
    process.env.PI_CODING_AGENT_DIR = join(dir, "agent");
    globalThis.__piSessions = new Map(); globalThis.__piSubagentRuns = new Map();
    const parent = `idle-delete-${mode}`, child = `${parent}-child`;
    const path = join(dir, `${parent}.jsonl`);
    const original = JSON.stringify({ type: "session", version: 3, id: parent, timestamp: new Date().toISOString(), cwd: dir }) + "\n";
    await writeFile(path, original); cacheSessionPath(parent, path);
    let shutdowns = 0;
    const running = mode === "parent" || mode === "explicit";
    globalThis.__piSessions.set(parent, { isRunning: () => running, isAwaitingInput: () => false, shutdown: async () => { shutdowns++; globalThis.__piSessions.delete(parent); } });
    if (mode === "descendant" || mode === "queued-descendant") {
      globalThis.__piSubagentRuns.set(child, { run: { sessionId: child, parentSessionId: parent, status: mode === "descendant" ? "running" : "queued" } });
    }
    if (mode === "live-descendant") {
      const header = { type: "session", version: 3, id: child, cwd: dir, timestamp: new Date().toISOString() };
      const entries = [{ type: "custom", customType: "pi-web:subagent", timestamp: header.timestamp, data: { version: 1, parentSessionId: parent, parentSessionPath: path, profile: "Explore", description: "running child" } }];
      globalThis.__piSessions.set(child, {
        sessionId: child, sessionFile: join(dir, "unpersisted-child.jsonl"), cwd: dir,
        isAlive: () => true, isRunning: () => true, isAwaitingInput: () => false,
        inner: { sessionManager: { getHeader: () => header, getEntries: () => entries, getSessionFile: () => null, getSessionName: () => undefined } },
        shutdown: async () => { shutdowns++; },
      });
    }
    t.after(async () => {
      globalThis.__piSessions = saved.sessions; globalThis.__piSubagentRuns = saved.runs;
      if (saved.agent === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = saved.agent;
      invalidateSessionPathCache(parent); invalidateSessionListCache(); await rm(dir, { recursive: true, force: true });
    });
    const response = await DELETE(new Request(`http://localhost/api/sessions/${parent}${mode === "explicit" ? "" : "?idleOnly=1"}`, { method: "DELETE" }), { params: Promise.resolve({ id: parent }) });
    if (["parent", "descendant", "queued-descendant", "live-descendant"].includes(mode)) {
      assert.equal(response.status, 409); assert.equal((await response.json()).code, "session_running");
      assert.equal(await readFile(path, "utf8"), original); assert.equal(shutdowns, 0);
      assert.equal(globalThis.__piSessions.has(parent), true);
      if (mode === "live-descendant") assert.equal(globalThis.__piSessions.has(child), true);
      else if (mode !== "parent") assert.equal(globalThis.__piSubagentRuns.has(child), true);
    } else {
      assert.equal(response.status, 200); assert.equal(shutdowns, 1);
      await assert.rejects(readFile(path), { code: "ENOENT" });
    }
  });
}


test("fork deletion stays on the guarded per-id route without the deferred alternate bulk path", async () => {
  for (const file of ["./delete/route.ts", "../../../lib/session-delete.ts"]) {
    await assert.rejects(access(new URL(file, import.meta.url)), { code: "ENOENT" });
  }
});
