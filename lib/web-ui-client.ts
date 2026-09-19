"use client";

// Several panels ask for the same route within a few milliseconds of each
// other, and timers re-ask for it every few seconds. One module-level map keyed
// by URL collapses both: an in-flight GET is shared, a settled one is replayed.
// Only GETs are cached — they are the repeated ones, and they have no effects.
// Bursts of identical GETs arrive within milliseconds; pollers are 10 s apart.
// One second collapses the former without ever replaying a stale answer to a
// user who just changed something on disk and pressed Refresh.
const CACHE_TTL_MS = 1_000;
const CACHE_MAX = 32;
export const FORBIDDEN_MESSAGE = "This folder is not accessible or no longer exists.";

/** Carries the HTTP status so callers can tell "gone" from "broken". */
export class UiFetchError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = "UiFetchError"; }
}

type Entry = { settledAt: number; done: boolean; promise: Promise<unknown> };
const cache = new Map<string, Entry>();
const routeOf = (url: string) => url.split("?")[0];

/** Without a route, drop everything (a git operation can change any answer).
 *  With one, drop the route and the collection a sub-route writes through. */
export function invalidateUiCache(route?: string) {
  if (!route) { cache.clear(); return; }
  for (const key of [...cache.keys()]) { const cached = routeOf(key); if (cached.startsWith(route) || route.startsWith(cached)) cache.delete(key); }
}
if (typeof window !== "undefined") window.addEventListener("pi-git-changed", () => invalidateUiCache());

const deadline = (signal?: AbortSignal) => signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000);

async function request<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new UiFetchError(res.status === 403 ? FORBIDDEN_MESSAGE : data.error || `HTTP ${res.status}`, res.status);
  }
  return await res.json() as T;
}

function remember(url: string, promise: Promise<unknown>): Entry {
  const entry: Entry = { settledAt: 0, done: false, promise };
  // A failure must not be replayed for 5 s — the next caller should retry.
  void promise.then(() => { entry.done = true; entry.settledAt = Date.now(); }, () => { if (cache.get(url) === entry) cache.delete(url); });
  cache.delete(url); cache.set(url, entry);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
  return entry;
}

/** The shared request outlives any one caller, so callers race their own signal
 *  against it instead of owning it — one unmount must not cancel the others. */
function untilAborted<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    void promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

export async function uiFetch<T>(url: string, body?: unknown, method = "POST", signal?: AbortSignal): Promise<T> {
  if (body !== undefined) {
    invalidateUiCache(routeOf(url));
    return request<T>(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: deadline(signal) });
  }
  const hit = cache.get(url);
  const fresh = hit && (!hit.done || Date.now() - hit.settledAt < CACHE_TTL_MS) ? hit : remember(url, request<T>(url, { signal: deadline() }));
  return untilAborted(fresh.promise as Promise<T>, signal);
}
