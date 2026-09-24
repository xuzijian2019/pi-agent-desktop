import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../hooks/useAgentSession.ts", import.meta.url);
const chatWindowUrl = new URL("./ChatWindow.tsx", import.meta.url);

function functionSlice(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  return source.slice(start, end);
}

test("context loads ignore stale sessions and out-of-order branch responses", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const body = functionSlice(source, "const loadContext = useCallback", "const loadTools = useCallback");
  assert.match(body, /requestId = \+\+contextLoadIdRef\.current/);
  assert.match(body, /sessionIdRef\.current === sid/);
  assert.match(body, /contextLoadIdRef\.current === requestId/);
  assert.match(body, /if \(!isCurrent\(\)\) return false/);
});

test("tool preset loads ignore stale sessions and out-of-order responses", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const body = functionSlice(source, "const loadTools = useCallback", "const promoteNewSession = useCallback");
  assert.match(body, /requestId = \+\+toolsLoadIdRef\.current/);
  assert.match(body, /sessionIdRef\.current === sid/);
  assert.match(body, /toolsLoadIdRef\.current === requestId/);
  assert.match(body, /tools && isCurrent\(\)/);
});

test("agent-end state refreshes cannot overwrite a switched session or newer run", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const body = functionSlice(source, 'case "agent_end"', 'case "agent_settled"');
  assert.match(body, /const sid = sessionIdRef\.current/);
  assert.match(body, /const sessionGeneration = sessionGenerationRef\.current/);
  assert.match(body, /const runId = promptRunIdRef\.current/);
  assert.match(body, /sessionIdRef\.current !== sid/);
  assert.match(body, /sessionGenerationRef\.current !== sessionGeneration/);
  assert.match(body, /promptRunIdRef\.current !== runId/);
});

test("a stale branch load cannot navigate the newly active session", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const body = functionSlice(source, "const handleLeafChange = useCallback", "const handleModelChange = useCallback");
  assert.match(body, /const loaded = await loadContext\(sid, leafId\)/);
  assert.match(body, /loaded && leafId && sessionIdRef\.current === sid/);
});

test("returning to a session restores its last scroll position", async () => {
  const source = await readFile(sourceUrl, "utf8");
  // The save must happen inside the render-phase reset block: by the time an
  // effect cleanup runs for a session switch, the message list has already
  // been emptied in the same commit and the browser has clamped scrollTop to
  // 0, so a cleanup-time read records 0 for every switch (#scroll-restore).
  const resetBlock = functionSlice(source, "if (sessionIdentity !== appliedIdentity)", "const currentModel =");
  assert.match(resetBlock, /rememberScrollPosition\(previousIdentity, container\)/);
  assert.match(resetBlock, /opts\.onScrollPositionChange\(previousIdentity/);
  assert.match(resetBlock, /setMessages\(cachedSession\?\.context\.messages \?\? \[\]\)/);
  assert.match(resetBlock, /setData\(cachedSession\)/);
  assert.match(resetBlock, /sessionIdRef\.current = session\.id/);
  assert.match(resetBlock, /initialScrollDoneRef\.current = false/);
  assert.match(source, /pendingInitialScrollTopRef\.current = sessionScrollTops\.get\(sessionIdentity\) \?\? null/);
  assert.match(source, /container\.scrollTop = savedScrollTop/);
});

test("the stable ChatWindow reloads whenever its session identity changes", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const effect = functionSlice(source, "// Load session on mount and whenever", "useEffect(() => {\n    onSystemPromptChange");
  assert.match(effect, /sessionIdRef\.current = session\.id/);
  assert.match(effect, /loadSession\(session\.id, true, true/);
  assert.match(effect, /\}, \[sessionIdentity\]\)/);
});

test("session loads reject A-B-A responses from an older generation", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const body = functionSlice(source, "const loadSession = useCallback", "const loadContext = useCallback");
  assert.match(body, /const sessionGeneration = sessionGenerationRef\.current/);
  assert.match(body, /sessionGenerationRef\.current === sessionGeneration/);
  assert.match(body, /sessionReadIdRef\.current === readId/);
  assert.match(body, /if \(!isCurrent\(\)\) return null/);
  assert.match(body, /isCurrent\(\) && showLoading && !messagesLoaded/);
});

test("the stable ChatWindow resets viewport state for the selected session", async () => {
  const source = await readFile(chatWindowUrl, "utf8");
  const block = functionSlice(source, "if (lazyLoadSessionKey !== appliedLazyLoadSessionKey)", "const searchMessage =");
  assert.match(block, /sessionVisibleCounts\.set\(appliedLazyLoadSessionKey, visibleCount\)/);
  assert.match(block, /sessionVisibleCounts\.get\(lazyLoadSessionKey\)/);
  assert.match(block, /setPendingScrollRestore\(nextPosition && !nextPosition\.atBottom \? nextPosition : null\)/);
  assert.match(block, /restoreStartedRef\.current = false/);
});
