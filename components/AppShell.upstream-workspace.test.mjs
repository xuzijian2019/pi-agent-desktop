import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { workspaceFileTabsMatchContext } from "../lib/workspace-state.ts";

const source = await readFile(new URL("./AppShell.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("AppShell.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const nodes = [];
function visit(node) { nodes.push(node); ts.forEachChild(node, visit); }
visit(tree);
function declaration(name) {
  const node = nodes.find((node) => ts.isVariableStatement(node)
    && node.declarationList.declarations.some((item) => item.name.getText(tree) === name));
  assert.ok(node, `${name} must remain wired into AppShell`);
  return node.getText(tree);
}
function run(text, context) {
  return vm.runInContext(stripTypeScriptTypes(text), context);
}
function withState(values) {
  const context = vm.createContext({ useCallback: (callback) => callback, ...values });
  for (const name of Object.keys(values)) {
    context[`set${name[0].toUpperCase()}${name.slice(1)}`] = (value) => {
      context[name] = typeof value === "function" ? value(context[name]) : value;
    };
  }
  return context;
}

test("the one workspace toggle opens an empty tree without changing desktop sidebar state", () => {
  assert.equal(nodes.filter((node) => ts.isVariableDeclaration(node)
    && node.name.getText(tree) === "handleRightPanelToggle").length, 1);
  const context = withState({
    isMobile: false, sidebarOpen: true, activeTopPanel: "branches",
    rightPanelOpen: false, rightPanelExpanded: false, fileTreeOpen: false, panelTabs: [],
  });
  run(`${declaration("handleRightPanelToggle")}\nglobalThis.toggle = handleRightPanelToggle;`, context);
  context.toggle();
  assert.equal(context.rightPanelOpen, true);
  assert.equal(context.fileTreeOpen, true);
  assert.equal(context.sidebarOpen, true);
  context.rightPanelExpanded = true;
  context.toggle();
  assert.equal(context.rightPanelOpen, false);
  assert.equal(context.rightPanelExpanded, false);
  context.isMobile = true;
  context.fileTreeOpen = false;
  context.panelTabs = [{ id: "terminal:restored" }];
  context.toggle();
  assert.equal(context.rightPanelOpen, true);
  assert.equal(context.fileTreeOpen, false, "a terminal does not force the tree open");
  assert.equal(context.sidebarOpen, false);
  assert.equal(context.activeTopPanel, null);
});

test("artifact title updates invalidate the memoized workspace tabs", () => {
  let title = "Original artifact";
  let memo;
  let previousDependencies;
  const context = vm.createContext({
    fileTabs: [], terminalTabs: [], artifactTabs: [{ id: "artifact:session:preview" }],
    useArtifactTitles: () => title,
    artifactPanelTab: (tab) => ({ ...tab, label: title, kind: "artifact" }),
    getFileName: (path) => path,
    useMemo: (callback, dependencies) => {
      if (!previousDependencies || dependencies.some((value, i) => value !== previousDependencies[i])) {
        memo = callback();
        previousDependencies = dependencies;
      }
      return memo;
    },
  });
  const render = () => run(`(() => {
    ${declaration("artifactTitleKey")}
    ${declaration("panelTabs")}
    return panelTabs;
  })()`, context);
  assert.equal(render()[0].label, "Original artifact");
  title = "Regenerated artifact";
  assert.equal(render()[0].label, "Regenerated artifact");
});

test("a single compact-breakpoint event closes the panel without hiding a restored terminal on mount", () => {
  const effect = nodes.find((node) => ts.isCallExpression(node)
    && node.expression.getText(tree) === "useEffect"
    && node.arguments[0]?.getText(tree).includes("const compactQuery"));
  assert.ok(effect);
  const listeners = new Set();
  const query = {
    matches: true,
    addEventListener: (event, listener) => { assert.equal(event, "change"); listeners.add(listener); },
    removeEventListener: (event, listener) => { assert.equal(event, "change"); listeners.delete(listener); },
  };
  const context = withState({
    rightPanelOpen: true, SPLIT_PANEL_MIN_WIDTH: 1000,
    window: { matchMedia: () => query },
  });
  const cleanup = run(`(${effect.arguments[0].getText(tree)})()`, context);
  assert.equal(context.rightPanelOpen, true, "initial mount preserves a restored terminal overlay");
  assert.equal(listeners.size, 1);
  query.matches = false;
  for (const listener of listeners) listener();
  assert.equal(context.rightPanelOpen, true);
  query.matches = true;
  for (const listener of listeners) listener();
  assert.equal(context.rightPanelOpen, false, "desktop-to-compact closes on the first event");
  cleanup();
  assert.equal(listeners.size, 0);
});

test("a direct Scheduled URL survives project selection and delayed workspace restoration", async () => {
  const replacements = [];
  const pushes = [];
  const response = Promise.withResolvers();
  const session = { id: "remembered", cwd: "/project/worktree", projectKey: "/project" };
  const context = withState({
    window: { location: { pathname: "/", search: "?view=scheduled" }, history: { state: {}, pushState: (...args) => pushes.push(args) } },
    URLSearchParams, crypto: globalThis.crypto,
    router: { replace: (...args) => replacements.push(args) },
    fetch: () => response.promise,
    getLastOpenSession: (project) => project === "/project" ? session.id : null,
    workspaceKeyOf: (value) => value.projectKey ?? value.cwd,
    clearLastOpen() {}, rekeyDraft() {},
    parkedNewSessionDraftKey: (cwd) => `new:${cwd}`,
    navigationGeneration: { current: 0 },
    workspaceRestoreTokenRef: { current: 0 },
    activeProjectKeyRef: { current: "/old-project" },
    activeNewSessionDraftKeyRef: { current: null },
    scheduledOpenRef: { current: true },
    suppressCwdBumpRef: { current: false },
    branchLeafChangeFnRef: { current: null },
    chatWorkspaceCwd: null, newSessionWorkspaceKind: "project",
    activeCwd: "/old-project", activeFileTabId: null, selectedSession: null,
    newSessionCwd: null, sessionCatalog: [], sessionKey: 0, isMobile: false,
    scheduledOpen: true, branchTree: [], branchActiveLeafId: null, branchSwitchLocked: false,
    activeTopPanel: null, fileTabs: [], rightPanelOpen: false,
    newSessionDraftId: "initial", searchTarget: null, initialSessionRestored: true,
  });
  context.invalidateWorkspaceRestore = () => context.workspaceRestoreTokenRef.current++;
  run(`${declaration("restoreWorkspaceContext")}\n${declaration("handleCwdChange")}\n${declaration("handleSelectSession")}
    globalThis.navigate = { handleCwdChange, handleSelectSession };
  `, context);
  context.navigate.handleCwdChange("/project", "/project", "/project");
  assert.equal(context.scheduledOpen, true);
  assert.equal(replacements.length, 0);
  response.resolve({ ok: true, json: async () => ({ sessions: [session] }) });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(context.selectedSession.id, session.id, "the hidden workspace still restores");
  assert.equal(context.scheduledOpen, true);
  assert.equal(replacements.length, 0, "background restore must not replace ?view=scheduled");
  context.navigate.handleSelectSession(session);
  assert.equal(context.scheduledOpen, false, "explicit session selection leaves Scheduled");
  assert.equal(pushes.at(-1)[2], "?session=remembered");
});

const workspaceSource = await readFile(new URL("../hooks/useDesktopWorkspaceTabs.ts", import.meta.url), "utf8");
const workspaceTree = ts.createSourceFile("useDesktopWorkspaceTabs.ts", workspaceSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const workspaceFunction = workspaceTree.statements.find((node) => ts.isFunctionDeclaration(node)
  && node.name?.text === "useDesktopWorkspaceTabs");
function workspaceHarness(overrides = {}) {
  const writes = [];
  let hydrated;
  let initialized = false;
  const options = {
    desktopMode: true, initialSessionRestored: false,
    persistedWorkspace: {
      sessionId: "session", cwd: "/project", activeFileTabId: "terminal:restored", rightPanelOpen: true,
      fileTabs: [{ filePath: "/project/file.txt", label: "file.txt", sourceSessionId: "session", initialDisplayMode: "source" }],
    },
    sessionId: "session", cwd: "/project", showPlaceholder: false,
    fileTabs: [], activeFileTabId: "terminal:restored", rightPanelOpen: true,
    ...overrides,
  };
  for (const name of ["fileTabs", "activeFileTabId", "rightPanelOpen"]) {
    options[`set${name[0].toUpperCase()}${name.slice(1)}`] = (value) => {
      options[name] = typeof value === "function" ? value(options[name]) : value;
    };
  }
  const context = vm.createContext({
    APP_PREF_KEYS: { workspace: "workspace" },
    setPrefJson: (key, value) => writes.push(JSON.parse(JSON.stringify({ key, value }))),
    workspaceFileTabsMatchContext,
    useState: (initial) => {
      if (!initialized) { hydrated = initial(); initialized = true; }
      return [hydrated, (value) => { hydrated = value; }];
    },
    useEffect: (callback) => callback(),
  });
  run(`${workspaceFunction.getText(workspaceTree).replace(/^export /, "")}\nglobalThis.hook = useDesktopWorkspaceTabs;`, context);
  return { options, writes, render: () => context.hook(options) };
}

test("extracted desktop restoration waits for the session and keeps the restored terminal selected", () => {
  const harness = workspaceHarness();
  harness.render();
  assert.equal(harness.options.fileTabs.length, 0);
  assert.equal(harness.writes.length, 0, "hydration must not overwrite saved files before restore");
  harness.options.initialSessionRestored = true;
  harness.render();
  assert.equal(harness.options.fileTabs[0].filePath, "/project/file.txt");
  assert.equal(harness.options.fileTabs[0].sourceSessionId, "session");
  assert.equal(harness.options.activeFileTabId, "terminal:restored");
  assert.equal(harness.options.rightPanelOpen, true);
  assert.equal(harness.writes.length, 0);
  harness.render();
  assert.equal(harness.writes[0].value.activeFileTabId, "terminal:restored");
});

test("extracted workspace state persists browser panels without restoring the desktop chat", () => {
  const harness = workspaceHarness({ desktopMode: false, activeFileTabId: "file:/browser/current.txt", fileTabs: [
    { filePath: "/browser/current.txt", label: "current.txt", sourceSessionId: "browser" },
  ] });
  harness.render();
  assert.equal(harness.options.fileTabs[0].filePath, "/browser/current.txt");
  assert.equal(harness.options.activeFileTabId, "file:/browser/current.txt");
  assert.equal(harness.writes.length, 1);
  assert.equal(harness.writes[0].value.fileTabs[0].sourceSessionId, "browser");
});


test("new project navigation cannot inherit Chat workspace restrictions", () => {
  const context = withState({
    chatWorkspaceCwd: "/server-owned-chat", newSessionWorkspaceKind: "chat",
    scheduledOpen: true, selectedSession: { id: "chat", cwd: "/server-owned-chat", workspaceKind: "chat" },
    newSessionCwd: "/server-owned-chat", newSessionDraftId: "old", sessionKey: 1,
    navigationGeneration: { current: 0 }, activeNewSessionDraftKeyRef: { current: "old" },
    branchTree: [1], branchActiveLeafId: "old", branchLeafChangeFnRef: { current: () => {} },
    branchSwitchLocked: true, activeTopPanel: "branches", fileTabs: [], activeFileTabId: null,
    fileTreeOpen: false, rightPanelOpen: false, rightPanelExpanded: false, isMobile: false,
    invalidateWorkspaceRestore() {},
    window: { history: { state: {}, pushState() {} } },
  });
  run(`${declaration("handleNewSession")}
globalThis.start = handleNewSession;`, context);
  context.start("new-project", "/project");
  assert.equal(context.newSessionWorkspaceKind, "project");
  assert.equal(context.newSessionCwd, "/project");
  assert.equal(context.activeNewSessionDraftKeyRef.current, "new:/project");
  assert.equal(context.selectedSession, null);
  assert.equal(context.branchSwitchLocked, false);
  context.fileTabs = [{ id: "file:/project/private.txt" }];
  context.activeFileTabId = "file:/project/private.txt";
  context.fileTreeOpen = context.rightPanelOpen = context.rightPanelExpanded = true;
  context.start("new-chat", "/server-owned-chat");
  assert.equal(context.newSessionWorkspaceKind, "chat");
  assert.equal(context.fileTabs.length, 0);
  assert.equal(context.activeFileTabId, null);
  assert.equal(context.rightPanelOpen, false);
  assert.equal(context.fileTreeOpen, false);
  assert.equal(context.rightPanelExpanded, false);
});

test("browser Back to a blank project reclassifies a previously active Chat", async () => {
  const effect = nodes.find((node) => ts.isCallExpression(node)
    && node.expression.getText(tree) === "useEffect"
    && node.arguments[0]?.getText(tree).includes('window.addEventListener("popstate"'));
  assert.ok(effect);
  let listener;
  const context = withState({
    chatWorkspaceCwd: "/server-owned-chat", newSessionWorkspaceKind: "chat",
    navigationGeneration: { current: 0 }, selectedSession: { id: "chat" },
    newSessionCwd: "/server-owned-chat", activeCwd: "/server-owned-chat",
    URLSearchParams,
    window: {
      location: { search: "?cwd=%2Fproject" }, history: { state: {} },
      addEventListener(type, callback) { assert.equal(type, "popstate"); listener = callback; },
      removeEventListener(type, callback) { assert.equal(type, "popstate"); assert.equal(callback, listener); },
    },
  });
  const cleanup = run(`(${effect.arguments[0].getText(tree)})()`, context);
  await listener();
  assert.equal(context.newSessionWorkspaceKind, "project");
  assert.equal(context.activeCwd, "/project");
  assert.equal(context.selectedSession, null);
  context.window.location.search = "?cwd=%2Fserver-owned-chat";
  await listener();
  assert.equal(context.newSessionWorkspaceKind, "chat");
  cleanup();
});
