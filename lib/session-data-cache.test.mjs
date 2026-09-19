import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
const cache = await createJiti(import.meta.url, { tsconfigPaths: true }).import("./session-data-cache.ts");
test("cache evicts least recently used and oversized payloads", () => {
  for (let i = 0; i < 25; i++) cache.cacheSessionData(String(i), { sessionId: String(i) });
  assert.equal(cache.getCachedSessionData("0"), null);
  assert.equal(cache.getCachedSessionData("5").sessionId, "5");
  cache.cacheSessionData("25", { sessionId: "25" });
  assert.equal(cache.getCachedSessionData("6"), null);
  cache.cacheSessionData("huge", { content: "x".repeat(17 * 1024 * 1024) });
  assert.equal(cache.getCachedSessionData("huge"), null);
});
test("invalidated in-flight reads cannot repopulate cache; failures permit retry", async () => {
  const original = globalThis.fetch;
  try {
    let release;
    globalThis.fetch = () => new Promise((resolve) => { release = resolve; });
    const request = cache.prefetchSessionData("late");
    cache.invalidateSessionData("late");
    release({ ok: true, json: async () => ({ sessionId: "late" }) });
    assert.equal(await request, null);
    assert.equal(cache.getCachedSessionData("late"), null);
    globalThis.fetch = async () => { throw new Error("offline"); };
    assert.equal(await cache.prefetchSessionData("retry"), null);
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ sessionId: "retry" }) });
    assert.equal((await cache.prefetchSessionData("retry")).sessionId, "retry");
  } finally { globalThis.fetch = original; }
});
test("stalled prefetch aborts within three seconds and releases its pending slot", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = (_url, { signal }) => new Promise((_resolve, reject) => {
      calls++;
      signal.addEventListener("abort", () => reject(new Error("aborted")));
    });
    const first = cache.prefetchSessionData("stalled");
    assert.equal(cache.prefetchSessionData("stalled"), first);
    assert.equal(await first, null);
    globalThis.fetch = async () => { calls++; return { ok: false }; };
    await cache.prefetchSessionData("stalled");
    assert.equal(calls, 2);
  } finally { globalThis.fetch = original; }
});
test("expired payloads are swept even when a different session is accessed", () => {
  const now = Date.now;
  cache.cacheSessionData("expired", { sessionId: "expired" });
  try { Date.now = () => now() + 11_000; cache.getCachedSessionData("unrelated"); }
  finally { Date.now = now; }
  assert.equal(cache.getCachedSessionData("expired"), null);
});
