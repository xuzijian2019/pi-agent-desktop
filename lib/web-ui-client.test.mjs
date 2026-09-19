import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { alias: { "@": join(import.meta.dirname, "..") } });
const { uiFetch, invalidateUiCache, UiFetchError, FORBIDDEN_MESSAGE } = await jiti.import("./web-ui-client.ts");

/** Replaces global fetch with a recorder; returns the urls it was given. */
function stubFetch(respond) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => { calls.push(url); return respond(url, init); };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

test.beforeEach(() => invalidateUiCache());

test("concurrent and repeated GETs for one url share a single request", async () => {
  const pending = new Map();
  const stub = stubFetch((url) => new Promise((r) => pending.set(url, () => r(json({ ok: 1 })))));
  try {
    const inFlight = [uiFetch("/api/git/branches?cwd=/a"), uiFetch("/api/git/branches?cwd=/a")];
    assert.equal(stub.calls.length, 1, "an in-flight GET must be shared, not repeated");
    pending.get("/api/git/branches?cwd=/a")();
    assert.deepEqual(await Promise.all(inFlight), [{ ok: 1 }, { ok: 1 }]);
    assert.deepEqual(await uiFetch("/api/git/branches?cwd=/a"), { ok: 1 });
    assert.equal(stub.calls.length, 1, "a repeat within the TTL must come from the cache");
    const other = uiFetch("/api/git/branches?cwd=/b");
    assert.equal(stub.calls.length, 2, "a different url is a different entry");
    pending.get("/api/git/branches?cwd=/b")();
    await other;
  } finally { stub.restore(); }
});

test("an aborted caller does not cancel the request the others are waiting on", async () => {
  let resolve;
  const stub = stubFetch(() => new Promise((r) => { resolve = () => r(json({ ok: 1 })); }));
  try {
    const controller = new AbortController();
    const abandoned = uiFetch("/api/worktrees?cwd=/a", undefined, undefined, controller.signal);
    const kept = uiFetch("/api/worktrees?cwd=/a");
    controller.abort();
    await assert.rejects(abandoned, (error) => error.name === "AbortError");
    resolve();
    assert.deepEqual(await kept, { ok: 1 });
    assert.equal(stub.calls.length, 1);
  } finally { stub.restore(); }
});

test("403 becomes a friendly message that still carries the status", async () => {
  const stub = stubFetch(() => json({ error: "Access denied" }, 403));
  try {
    await assert.rejects(uiFetch("/api/git/branches?cwd=/gone"), (error) => {
      assert.ok(error instanceof UiFetchError);
      assert.equal(error.status, 403);
      assert.equal(error.message, FORBIDDEN_MESSAGE);
      return true;
    });
    // Failures are not replayed from the cache — the next caller retries.
    await assert.rejects(uiFetch("/api/git/branches?cwd=/gone"));
    assert.equal(stub.calls.length, 2);
  } finally { stub.restore(); }
});

test("a non-GET drops the cached answers for its own route and its collection", async () => {
  const stub = stubFetch(() => json({ ok: 1 }));
  try {
    await uiFetch("/api/worktrees?cwd=/a");
    await uiFetch("/api/git/branches?cwd=/a");
    assert.equal(stub.calls.length, 2);
    await uiFetch("/api/worktrees/fetch", { cwd: "/a" });
    await uiFetch("/api/worktrees?cwd=/a");
    assert.equal(stub.calls.length, 4, "the worktree list must be refetched after a fetch");
    await uiFetch("/api/git/branches?cwd=/a");
    assert.equal(stub.calls.length, 4, "an unrelated route keeps its cached answer");
  } finally { stub.restore(); }
});
