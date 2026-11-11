import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { createJiti } from "jiti";

const source = await readFile(new URL("./AppShell.tsx", import.meta.url), "utf8");
const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const draftStore = await jiti.import("@/lib/draft-store");

function callbackBody(name) {
  const tree = ts.createSourceFile("AppShell.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let statement;
  function visit(node) {
    if (ts.isVariableStatement(node) && node.declarationList.declarations.some(d => d.name.getText(tree) === name)) statement = node.getText(tree);
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.ok(statement, `${name} callback not found`);
  return statement;

}

test("explicit context changes invalidate a pending workspace restore", () => {
  const callbacks = [
    ["handleCwdChange", "handleSelectSession"],
    ["handleSelectSession", "handleNewSession"],
    ["handleNewSession", "hydrateSelectedSession"],
    ["handleSessionCreated", "handleAgentEnd"],
    ["handleSessionForked", "handleInitialRestoreDone"],
    ["handleSessionDeleted", "handleOpenFile"],
  ];

  for (const [name, nextName] of callbacks) {
    assert.match(callbackBody(name, nextName), /invalidateWorkspaceRestore\(\);/);
  }
});

test("all active-session transitions share one persistence effect", () => {
  assert.match(
    source,
    /useEffect\(\(\) => \{\s+if \(selectedSession\) \{[\s\S]*?setLastOpenSession\(projectKey, selectedSession\.id\);\s+setTabOpenSession\(selectedSession\.id\);\s+return;\s+\}\s+if \(newSessionCwd\) setTabOpenNewSession\(newSessionCwd\);\s+\}, \[newSessionCwd, selectedSession\]\);/,
  );
});

test("keeps chat scroll positions in page memory by session id", () => {
  assert.match(source, /useRef\(new Map<string, ChatScrollPosition>\(\)\)/);
  assert.match(source, /sessionScrollPositionsRef\.current\.set\(sessionId, position\)/);
  assert.match(source, /initialScrollPosition=\{selectedSession \? sessionScrollPositionsRef\.current\.get\(selectedSession\.id\) \?\? null : null\}/);
  assert.match(source, /onScrollPositionChange=\{handleSessionScrollPositionChange\}/);
  assert.doesNotMatch(source, /localStorage[^\n]*sessionScroll/i);
});

test("workspace restoration remains inside the cross-project branch", () => {
  assert.match(
    callbackBody("handleCwdChange", "handleSelectSession"),
    /if \(currentProject !== newProject\) \{[\s\S]*?restoreWorkspaceContext\(newProject, cwd\);[\s\S]*?\}/,
  );
});

test("New restores the draft after session navigation and workspace auto-restore", async (t) => {
  const callbacks = [
    callbackBody("restoreWorkspaceContext", "handleCwdChange"),
    callbackBody("handleCwdChange", "handleSelectSession"),
    callbackBody("handleSelectSession", "handleNewSession"),
    callbackBody("handleNewSession", "hydrateSelectedSession"),
  ].join("\n");
  const parkedKeyHelper = source.slice(source.indexOf("function parkedNewSessionDraftKey"), source.indexOf("export function AppShell"));
  const hookSource = await readFile(new URL("../hooks/useAgentSession.ts", import.meta.url), "utf8");
  const cleanupStart = hookSource.indexOf("    return () => {", hookSource.indexOf("  // Load session on mount"));
  const cleanupEnd = hookSource.indexOf("    // eslint-disable-next-line", cleanupStart);

  for (const rememberedCwd of ["/draft-project", "/draft-project-worktree"]) {
    await t.test(`remembered session cwd: ${rememberedCwd}`, async () => {
      const cwd = "/draft-project";
      const session = { id: "remembered", cwd: rememberedCwd, projectKey: cwd };
      const response = Promise.withResolvers();
      const context = vm.createContext({
        ...draftStore,
        crypto: globalThis.crypto,
        queueMicrotask,
        navigationGeneration: { current: 0 },
        rightPanelModeRef: { current: "files" },
        window: { location: { pathname: "/", search: "" }, history: { state: {}, pushState() {} } },
        URLSearchParams,
        router: { replace() {} },
        fetch: () => response.promise,
        getLastOpenSession: (key) => key === cwd ? session.id : null,
        clearLastOpen() {},
        workspaceKeyOf: (value) => value.projectKey ?? value.cwd,
        useEffect: () => {},
        useCallback: (callback) => callback,
        useGlobalKeyboardShortcuts() {},
        useNativeAppMenu() {},
        activeNewSessionDraftKeyRef: { current: `new:${cwd}` },
        handleRightPanelClose() {},
        handleSidebarToggle() {},
        chatInputRef: { current: null },
        rightPanelOpen: false,
        shortcutHelpOpen: false,
        pageOpenRef: { current: false },
        activeProjectKeyRef: { current: cwd },
        workspaceRestoreTokenRef: { current: 0 },
        suppressCwdBumpRef: { current: false },
        branchLeafChangeFnRef: { current: null },
        liveFollowFrameRef: { current: null },
        bashRecoveryIdRef: { current: 0 },
        cancelEventStreamGrace() {},
        closeEvents() {},
        closeSettingsMenu() {},
        settingsSection: null,
        getLastSettingsSection: () => "general",
        isMobile: false,
        isChatWorkspaceActive: false,
        desktopMode: false,
        activeCwd: cwd,
        activeFileTabId: null,
        chatWorkspaceCwd: null,
        newSessionCwd: cwd,
        newSessionDraftId: "initial",
        newSessionWorkspaceKind: "project",
        selectedSession: null,
        sessionCatalog: [],
        sessionKey: 0,
      });
      context.invalidateWorkspaceRestore = () => context.workspaceRestoreTokenRef.current++;
      for (const [setter] of callbacks.matchAll(/\bset[A-Z]\w*(?=\()/g)) {
        const state = setter[3].toLowerCase() + setter.slice(4);
        context[setter] = (value) => {
          context[state] = typeof value === "function" ? value(context[state]) : value;
        };
      }
      vm.runInContext(stripTypeScriptTypes(`${parkedKeyHelper}\n${callbacks}
        globalThis.navigate = { handleCwdChange, handleSelectSession, handleNewSession };
      `), context);
      // Run the actual hook cleanup with the outgoing mount's captured draft key.
      const makeCleanup = vm.runInContext(stripTypeScriptTypes(`((isNew, newSessionDraftKey) => {
        const sessionHookMountedRef = { current: true };
        const newSessionPromotedRef = { current: false };
        const sessionIdRef = { current: null };
        const dataRef = { current: null };
        const messagesRef = { current: [] };
        const entryIdsRef = { current: [] };
        const activeLeafIdRef = { current: null };
        const historyCursorRef = { current: null };
        const hasEarlierMessagesRef = { current: false };
        const getSessionViewSnapshot = () => null;
        const setSessionViewSnapshot = () => false;
        const deleteSessionViewSnapshot = () => {};
        ${hookSource.slice(cleanupStart, cleanupEnd)}
      })`), context);
      let mountedKey = context.sessionKey;
      let cleanup = makeCleanup(true, context.activeNewSessionDraftKeyRef.current);
      async function commit() {
        if (mountedKey !== context.sessionKey) {
          cleanup();
          mountedKey = context.sessionKey;
          const activeCwd = context.newSessionCwd ?? context.activeCwd;
          const key = context.selectedSession ? null : `new:${activeCwd}`;
          context.activeNewSessionDraftKeyRef.current = key;
          cleanup = makeCleanup(!context.selectedSession, key);
        }
        await new Promise((resolve) => setImmediate(resolve));
      }

      const draft = { value: "unsent project draft", images: [{ data: "aGVsbG8=", mimeType: "image/png" }] };
      draftStore.setDraft(context.activeNewSessionDraftKeyRef.current, draft);
      context.navigate.handleSelectSession({ ...session, cwd });
      await commit();
      context.navigate.handleNewSession("direct-return", cwd);
      await commit();
      assert.deepEqual(draftStore.getDraft(context.activeNewSessionDraftKeyRef.current), draft);
      context.navigate.handleSelectSession({ ...session, cwd });
      await commit();
      context.navigate.handleCwdChange("/other-project", "/other-project", "/other-project");
      await commit();
      context.navigate.handleCwdChange(cwd, cwd, cwd);
      await commit();
      assert.deepEqual(draftStore.getDraft(context.activeNewSessionDraftKeyRef.current), draft);
      response.resolve({ ok: true, json: async () => ({ sessions: [session] }) });
      await new Promise((resolve) => setImmediate(resolve));
      await commit();
      assert.equal(context.selectedSession.id, session.id);
      context.navigate.handleNewSession("after-auto-restore", cwd);
      await commit();
      assert.deepEqual(draftStore.getDraft(context.activeNewSessionDraftKeyRef.current), draft);
      draftStore.clearDraft(context.activeNewSessionDraftKeyRef.current);
    });
  }
});

function navigationHarness(names, overrides = {}) {
  const callbacks = names.map(callbackBody).join("\n");
  const context = vm.createContext({ useCallback: (callback) => callback, URLSearchParams,
    navigationGeneration: { current: 0 }, pageOpenRef: { current: false }, isMobile: false,
    console: { error() {} }, ...overrides });
  for (const [setter] of callbacks.matchAll(/\bset[A-Z]\w*(?=\()/g)) {
    if (context[setter]) continue;
    const state = setter[3].toLowerCase() + setter.slice(4);
    context[setter] = (value) => { context[state] = typeof value === "function" ? value(context[state]) : value; };
  }
  vm.runInContext(stripTypeScriptTypes(callbacks + "\nglobalThis.navigate = { " + names.join(", ") + " };"), context);
  return context;
}

test("workspace pages use native history and Back preserves the hidden conversation", async () => {
  const tree = ts.createSourceFile("AppShell.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const parser = tree.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "parseWorkspaceView");
  let historyEffect;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(tree) === "useEffect"
      && node.arguments[0]?.getText(tree).includes('window.addEventListener("popstate"')) historyEffect = node.arguments[0].getText(tree);
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.ok(parser && historyEffect);
  let listener;
  const selected = { id: "visible", cwd: "/project" };
  const context = navigationHarness(["openWorkspaceView"], {
    selectedSession: selected, chatWorkspaceCwd: "/chats",
    invalidateWorkspaceRestore() {}, handleSelectSession(session) { context.selectedSession = session; },
    window: { location: { search: "?session=visible" },
      history: { state: { piSession: selected }, pushState(state, _, url) { this.state = state; context.window.location.search = url; } },
      addEventListener(_, callback) { listener = callback; }, removeEventListener() {} },
    router: { replace() { assert.fail("page navigation must not remount through Next router"); } },
  });
  for (const [setter] of historyEffect.matchAll(/\bset[A-Z]\w*(?=\()/g)) {
    const state = setter[3].toLowerCase() + setter.slice(4);
    context[setter] = (value) => { context[state] = value; };
  }
  const cleanup = vm.runInContext(stripTypeScriptTypes(parser.getText(tree) + "\n(" + historyEffect + ")()"), context);
  for (const view of ["scheduled", "artifacts"]) {
    context.navigate.openWorkspaceView(view);
    assert.equal(context.workspaceView, view);
    assert.equal(context.pageOpenRef.current, true);
    assert.equal(context.window.location.search, "?view=" + view);
    await listener();
    assert.equal(context.selectedSession, selected, "Back to a page retains its hidden chat");
  }
  context.window.location.search = "?session=visible";
  await listener();
  assert.equal(context.workspaceView, null);
  assert.equal(context.pageOpenRef.current, false);
  assert.equal(context.selectedSession, selected);
  context.window.location.search = "?cwd=%2Fproject";
  await listener();
  assert.equal(context.selectedSession, null);
  assert.equal(context.activeCwd, "/project");
  assert.equal(context.newSessionWorkspaceKind, "project");
  assert.equal(context.parseWorkspaceView("unknown"), null);
  cleanup();
});

test("same-session artifact jumps close the page without remounting or losing the entry target", () => {
  const session = { id: "same", cwd: "/project", projectKey: "/project" };
  const pushes = [];
  const context = navigationHarness(["handleSelectSession"], {
    selectedSession: session, activeCwd: session.cwd, activeFileTabId: null, newSessionCwd: null, chatWorkspaceCwd: null,
    activeNewSessionDraftKeyRef: { current: null }, activeProjectKeyRef: { current: session.cwd },
    pageOpenRef: { current: true }, workspaceView: "artifacts", sessionKey: 7,
    workspaceKeyOf: (value) => value.projectKey ?? value.cwd, invalidateWorkspaceRestore() {},
    window: { history: { state: {}, pushState: (...args) => pushes.push(args) } },
  });
  context.navigate.handleSelectSession(session, false, "artifact-entry");
  assert.equal(context.workspaceView, null);
  assert.equal(context.pageOpenRef.current, false);
  assert.equal(context.sessionKey, 7);
  assert.equal(context.searchTarget.entryId, "artifact-entry");
  assert.equal(pushes[0][2], "?session=same");
});

test("page session opens report failure and reject late navigation", async () => {
  const opened = [], delayed = Promise.withResolvers();
  let calls = 0;
  const context = navigationHarness(["handleOpenSession"], {
    sessionCatalog: [{ id: "known", transient: false }], handleSelectSession: (...args) => opened.push(args),
    fetch: () => { calls++; return delayed.promise; },
  });
  assert.equal(await context.navigate.handleOpenSession("known", "entry"), true);
  assert.equal(calls, 0);
  assert.equal(opened[0][2], "entry");
  const pending = context.navigate.handleOpenSession("late", "old-entry");
  context.navigationGeneration.current++;
  delayed.resolve({ ok: true, json: async () => ({ info: { id: "late" } }) });
  assert.equal(await pending, false);
  assert.equal(opened.length, 1);
  context.fetch = async () => ({ ok: false, status: 404, json: async () => ({ error: "gone" }) });
  assert.equal(await context.navigate.handleOpenSession("gone"), false);
  assert.equal(opened.length, 1);
  assert.match(source, /onOpenInConversation=\{handleOpenSession\}/);
});

test("artifact continuation opens the fork's own metadata and drops prompts after navigation", async () => {
  const forkResult = Promise.withResolvers(), infoResult = Promise.withResolvers(), opened = [];
  const forkInfo = { id: "fork", cwd: "/source-project", workspaceKind: "project" };
  const context = navigationHarness(["handleContinueArtifact"], {
    refreshKey: 0, translate: (key) => key,
    sendAgentCommand: async (id, command) => { assert.equal(id, "other-source"); assert.equal(command.entryId, "artifact-entry"); return forkResult.promise; },
    fetch: async () => infoResult.promise, handleSelectSession: (info) => opened.push(info),
  });
  const pending = context.navigate.handleContinueArtifact("other-source", "artifact-entry", "continue prompt");
  forkResult.resolve({ newSessionId: "fork" });
  infoResult.resolve({ ok: true, json: async () => ({ info: forkInfo }) });
  await pending;
  assert.equal(opened[0], forkInfo);
  assert.equal(context.pendingQuotePrompt.text, "continue prompt");
  context.pendingQuotePrompt = null;
  const nextInfo = Promise.withResolvers();
  context.fetch = () => nextInfo.promise;
  const stale = context.navigate.handleContinueArtifact("other-source", "artifact-entry", "must not send");
  await new Promise((resolve) => setImmediate(resolve));
  context.navigationGeneration.current++;
  nextInfo.resolve({ ok: true, json: async () => ({ info: forkInfo }) });
  await stale;
  assert.equal(opened.length, 1);
  assert.equal(context.pendingQuotePrompt, null);
});


test("delayed workspace restore and session promotion retain either visible page", async () => {
  for (const view of ["scheduled", "artifacts"]) {
    const response = Promise.withResolvers();
    const session = { id: "restored", cwd: "/project", projectKey: "/project" };
    const context = navigationHarness(["restoreWorkspaceContext", "openWorkspaceView", "handleSessionCreated"], {
      sessionKey: 0, refreshKey: 0, sessionCatalog: [],
      workspaceRestoreTokenRef: { current: 0 }, activeNewSessionDraftKeyRef: { current: null },
      getLastOpenSession: () => session.id, workspaceKeyOf: (item) => item.projectKey,
      invalidateWorkspaceRestore() {}, hydrateSelectedSession() {},
      fetch: () => response.promise,
      window: { location: { search: "" }, history: { state: {}, pushState(_, __, url) { context.window.location.search = url; } } },
      router: { replace() { assert.fail("hidden restoration/promotion must not close the page"); } },
    });
    context.navigate.restoreWorkspaceContext("/project", "/project");
    context.navigate.openWorkspaceView(view);
    response.resolve({ ok: true, json: async () => ({ sessions: [session] }) });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(context.selectedSession, session);
    assert.equal(context.workspaceView, view);
    context.navigate.handleSessionCreated(session);
    assert.equal(context.window.location.search, "?view=" + view);
    assert.equal(context.workspaceView, view);
  }
});
