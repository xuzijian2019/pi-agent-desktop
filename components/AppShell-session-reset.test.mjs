import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("reopening New Session resets its runtime without discarding the project draft", async () => {
  const source = await readFile(new URL("./AppShell.tsx", import.meta.url), "utf8");
  const start = source.indexOf("const handleNewSession = useCallback");
  const end = source.indexOf("// Global keyboard shortcuts", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const handler = source.slice(start, end);
  assert.doesNotMatch(handler, /clearDraft\(/);
  assert.match(handler, /setSessionKey\(\(key\) => key \+ 1\)/);
});

test("switching sessions immediately clears parent-owned session UI", async () => {
  const source = await readFile(new URL("./AppShell.tsx", import.meta.url), "utf8");
  const start = source.indexOf("const handleSelectSession = useCallback");
  const end = source.indexOf("const handleNewSession = useCallback", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const handler = source.slice(start, end);
  assert.match(handler, /setBranchTree\(\[\]\)/);
  assert.match(handler, /setBranchActiveLeafId\(null\)/);
  assert.match(handler, /branchLeafChangeFnRef\.current = null/);
  assert.match(handler, /setActiveTopPanel\(null\)/);
});

test("chat file links open in the file panel with session-scoped access", async () => {
  const source = await readFile(new URL("./AppShell.tsx", import.meta.url), "utf8");
  const start = source.indexOf("<ChatWindow");
  assert.notEqual(start, -1);
  const chatWindow = source.slice(start, source.indexOf("/>", start));
  assert.match(chatWindow, /onOpenFile=\{\(filePath\) => handleOpenFile\(filePath, getFileName\(filePath\), \{ sourceSessionId: selectedSession\?\.id \}\)\}/);
});

test("session restore remains desktop-only while panel state supports browsers", async () => {
  const source = await readFile(new URL("./AppShell.tsx", import.meta.url), "utf8");
  assert.match(source, /resolveInitialNavigation\(searchParams, desktopMode \? persistedWorkspace : null\)/);
  assert.match(source, /useDesktopConnection\(\)/);
  assert.match(source, /activeFileTabId,\n      rightPanelOpen,\n    \} satisfies PersistedWorkspace/);
  assert.match(source, /if \(!workspaceHydrated\) return/);
});
