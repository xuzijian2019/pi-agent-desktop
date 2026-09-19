import type { AgentMessage, SessionTreeNode } from "@/lib/types";

export interface CachedSessionData {
  sessionId: string;
  filePath: string;
  tree: SessionTreeNode[];
  leafId: string | null;
  context: {
    messages: AgentMessage[];
    entryIds: string[];
    thinkingLevel: string;
    model: { provider: string; modelId: string } | null;
  };
}

const CACHE_TTL_MS = 10_000;
const MAX_ENTRIES = 20;
const MAX_BYTES = 32 * 1024 * 1024;
const sessionDataCache = new Map<string, { data: CachedSessionData; cachedAt: number; bytes: number }>();
const prefetches = new Map<string, { promise: Promise<CachedSessionData | null>; controller: AbortController }>();
function sweep(): void {
  for (const [id, entry] of sessionDataCache) {
    if (Date.now() - entry.cachedAt > CACHE_TTL_MS) sessionDataCache.delete(id);
  }
  let bytes = [...sessionDataCache.values()].reduce((sum, entry) => sum + entry.bytes, 0);
  for (const [id, entry] of sessionDataCache) {
    if (sessionDataCache.size <= MAX_ENTRIES && bytes <= MAX_BYTES) break;
    sessionDataCache.delete(id);
    bytes -= entry.bytes;
  }
}
export function invalidateSessionData(sessionId: string): void {
  sessionDataCache.delete(sessionId);
  prefetches.get(sessionId)?.controller.abort();
  prefetches.delete(sessionId);
}
export function getCachedSessionData(sessionId: string): CachedSessionData | null {
  sweep();
  const entry = sessionDataCache.get(sessionId);
  if (!entry) return null;
  sessionDataCache.delete(sessionId);
  sessionDataCache.set(sessionId, entry);
  return entry.data;
}
export function cacheSessionData(sessionId: string, data: CachedSessionData): void {
  prefetches.get(sessionId)?.controller.abort();
  prefetches.delete(sessionId);
  sessionDataCache.delete(sessionId);
  const bytes = JSON.stringify(data).length * 2;
  if (bytes > MAX_BYTES) return;
  sessionDataCache.set(sessionId, { data, cachedAt: Date.now(), bytes });
  sweep();
}
/** Optional warming; never delays navigation. Abandoned reads expire in 3s. */
export function prefetchSessionData(sessionId: string): Promise<CachedSessionData | null> {
  const cached = getCachedSessionData(sessionId);
  if (cached) return Promise.resolve(cached);
  const pending = prefetches.get(sessionId);
  if (pending) return pending.promise;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3_000);
  const params = new URLSearchParams({ deferThinking: "1", deferMedia: "1" });
  const promise = fetch(`/api/sessions/${encodeURIComponent(sessionId)}?${params}`, { signal: controller.signal })
    .then(async (response) => {
      if (!response.ok) return null;
      const data = await response.json() as CachedSessionData;
      if (controller.signal.aborted) return null;
      cacheSessionData(sessionId, data);
      return data;
    }).catch(() => null).finally(() => {
      clearTimeout(timeout);
      if (prefetches.get(sessionId)?.controller === controller) prefetches.delete(sessionId);
    });
  prefetches.set(sessionId, { promise, controller });
  return promise;
}
