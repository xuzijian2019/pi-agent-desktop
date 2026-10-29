/**
 * Sentinels for fork changes inside upstream-owned components.
 *
 * A `git merge` conflict from agegr/pi-web is the safe outcome: the sync job
 * fails and a human looks. These tests cover the unsafe outcome — a merge that
 * succeeds cleanly and is still wrong, in either direction:
 *
 *   RESURRECTION  Code the fork moved to another file reappears at its origin.
 *                 Git does not track cross-file moves, so an upstream edit to
 *                 the moved region merges straight back in and the app ends up
 *                 with two copies of the same behaviour.
 *
 *   EROSION       A fork change is dropped by the merge, silently reverting a
 *                 desktop feature to its upstream form.
 *
 *   RE-ADOPTION   A region the fork deliberately deleted comes back, because
 *                 upstream still ships it and the deletion lost the conflict.
 *                 Covered by a FORK_FEATURES entry's `forbiddenMarkers`.
 *
 * Neither shows up in tsc, eslint, or the upstream test suite. See
 * docs/ownership-boundaries.md; risk levels live in scripts/fork-ownership.json.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (file) => readFile(join(rootDir, file), "utf8");

/** Source with import statements removed, so a re-import never reads as a definition. */
function withoutImports(source) {
  return source.replace(/^import\s[\s\S]*?from\s+["'][^"']+["'];?$/gm, "");
}

function definesSymbol(source, symbol) {
  const body = withoutImports(source);
  return new RegExp(
    `(?:^|\\n)\\s*(?:export\\s+)?(?:async\\s+)?(?:function|class|const|let|var)\\s+${symbol}\\b`,
  ).test(body);
}

const EXTRACTIONS = [
  {
    name: "i18n fork message patch",
    origin: "lib/i18n/registry.ts",
    // Upstream message packs are intentionally held in upstream shape. The
    // fork's additions, replacements, and deletions live in a fork-owned patch
    // module so upstream key edits merge directly into the three message files.
    movedTo: ["lib/i18n/locale-plugins.ts"],
    movedDefinitions: ["FORK_MESSAGE_PATCHES", "withForkMessages", "forkLocalePlugins"],
    absentFromOrigin: ["enLocale, zhCNLocale, zhTWLocale"],
    presentInTargets: ["./messages/en.ts"],
    requiredInOrigin: ["forkLocalePlugins"],
  },
  {
    name: "SessionSidebar project picker",
    origin: "components/SessionSidebar.tsx",
    // Roughly 500 lines were moved out of SessionSidebar into these files,
    // neither of which exists upstream. This is the highest-risk divergence in
    // the fork; see the manifest entry for components/SessionSidebar.tsx.
    movedTo: ["components/ProjectPicker.tsx", "components/path-ui.tsx"],
    movedDefinitions: ["getRecentProjects", "displayCwd", "PathLabel", "AnimatedDropdown"],
    // Project-picker internals that must live only in ProjectPicker now.
    absentFromOrigin: [
      "customPathOpen",
      "customPathValidating",
      "projectFilter",
      "/api/cwd/validate",
      "/api/default-cwd",
    ],
    requiredInOrigin: ["ProjectPicker"],
  },
  {
    name: "AppShell window chrome",
    origin: "components/AppShell.tsx",
    // Desktop-only UI belongs in components/desktop/, so upstream layout files
    // carry a mount point rather than Tauri calls and window state.
    movedTo: ["components/desktop/WindowControls.tsx", "components/desktop/useDesktopChrome.ts"],
    movedDefinitions: [],
    absentFromOrigin: [
      "minimizeWindow",
      "toggleMaximizeWindow",
      "closeWindow",
      "isWindowMaximized",
      "window-control-btn",
      "@/lib/desktop-window",
    ],
    requiredInOrigin: ["WindowControls", "useDesktopChrome"],
  },
  {
    name: "app info panel folded into General settings",
    origin: "components/SettingsPanel.tsx",
    // The Version & Updates block and the desktop window/tray switches used to
    // live in a standalone AppSettings modal reachable as a second settings tab
    // whose language and theme pickers duplicated General. They moved to
    // fork-owned files; regrouping them back into the settings panel is the
    // resurrection this guards against.
    movedTo: ["components/AppUpdatesSection.tsx", "components/desktop/DesktopAppSection.tsx"],
    movedDefinitions: ["AppUpdatesSection", "DesktopAppSection"],
    absentFromOrigin: ["/api/updates", "installLatestDesktopRelease", "closeQuits", "quitAppNative"],
    requiredInOrigin: ["AppUpdatesSection", "DesktopAppSection"],
  },
  {
    name: "useAgentSession fork layers",
    origin: "hooks/useAgentSession.ts",
    // useAgentSession is upstream's and the fork's biggest hook. The features the
    // fork added on top (summarized branch switches, the 0.86 automation switches,
    // compaction no-op notices, dismissible scope warnings, the extra SDK events)
    // live in fork-owned hooks it calls; upstream's own code — the event-stream
    // lifecycle, running-state reconciliation, the guards AGENTS.md lists — stays
    // in the origin so upstream edits to it still merge in place.
    movedTo: [
      "hooks/useBranchSummary.ts",
      "hooks/useSessionAutomation.ts",
      "hooks/useCompactNotice.ts",
      "hooks/useScopeWarningDismissal.ts",
      "hooks/useForkAgentEvents.ts",
    ],
    movedDefinitions: [
      "branchSummaryHolds",
      "summarizeAndNavigate",
      "handleAbortBranchSummary",
      "handleSetAutomation",
      "handleAbortRetry",
      "compactNoopMessage",
      "reportCompactFailure",
      "dismissModelScopeWarnings",
      "visibleModelScopeWarnings",
      "PENDING_BASH_OUTPUT_CAP",
      "externalAppendRefreshAtRef",
    ],
    absentFromOrigin: [
      "abort_branch_summary",
      "abort_retry",
      "set_steering_mode",
      "set_follow_up_mode",
      'case "summarization_retry_scheduled"',
      'case "bash_execution_update"',
      'case "entry_appended"',
      'case "session_replaced"',
      "setDismissedScopeWarningKeys",
    ],
    requiredInOrigin: [
      "useBranchSummary(",
      "useSessionAutomation(",
      "useSessionAutomationActions<",
      "useCompactNotice(",
      "useScopeWarningDismissal(",
      "useForkAgentEvents(",
      "handleForkAgentEvent(event)",
    ],
  },
  {
    name: "ChatInput fork layers",
    origin: "components/ChatInput.tsx",
    // The composer is upstream's. The fork's `#` session mentions, session (gear)
    // menu and project chip live in fork-owned files; ChatInput keeps their state
    // where its shared keyboard and outside-click handlers need it, and mounts them.
    movedTo: [
      "hooks/useSessionMentionPalette.ts",
      "components/SessionMentionMenu.tsx",
      "components/SessionAutomationMenu.tsx",
      "components/ComposerProjectChip.tsx",
    ],
    movedDefinitions: ["getProjectLabel", "applyHashCompletion", "updateHashQuery", "hashMatches"],
    absentFromOrigin: [
      "sessionIndexFetchingRef",
      "chat.noMatchingSessions",
      "chat.autoCompaction",
      "chat.steeringMode",
      "chat-project-context",
      "chat.switchProject",
    ],
    requiredInOrigin: [
      "useSessionMentionPalette(",
      "<SessionMentionMenu",
      "<ComposerProjectChip",
    ],
  },
  {
    name: "AppShell fork layers",
    origin: "components/AppShell.tsx",
    // Desktop cold-start tab restore and the missing-workspace probe stay in hooks.
    movedTo: [
      "hooks/useDesktopWorkspaceTabs.ts",
      "hooks/useWorkspaceAvailability.ts",
    ],
    movedDefinitions: ["workspaceStatusRef"],
    absentFromOrigin: [
      "workspaceFileTabsMatchContext",
      "setWorkspaceHydrated",
      "/api/cwd/status",
    ],
    requiredInOrigin: [
      "useDesktopWorkspaceTabs(",
      "useWorkspaceAvailability(",
    ],
  },
  {
    name: "SessionSidebar project menu",
    origin: "components/SessionSidebar.tsx",
    // The project row's "…" menu (DOM and native) — branches with fetch, and
    // the worktree pages that replaced the hidden header dropdown — is a fork
    // feature; the sidebar keeps the menu state and wires the actions in.
    // Reveal-in-file-manager stays in the origin: it is upstream's (#907).
    movedTo: ["components/ProjectContextMenu.tsx", "hooks/useProjectWorktreeActions.ts"],
    movedDefinitions: [
      "fetchProjectBranchMenu",
      "showNativeProjectBranchMenu",
      "showNativeProjectWorktreeMenu",
      "createProjectWorktree",
      "removeProjectWorktree",
      "fetchRemoteBranches",
    ],
    absentFromOrigin: [
      "sidebar-project-context-menu",
      "sidebar.fetchBranchesTitle",
      "sidebar.branchInWorktreeTitle",
      "sidebar.confirmRemoveWorktree",
      "/api/worktrees/fetch",
    ],
    requiredInOrigin: [
      "<ProjectContextMenu",
      "showNativeProjectWorktreeMenu(",
      "useProjectWorktreeActions(",
    ],
  },
  {
    name: "rpc-manager session replacement",
    origin: "lib/rpc-manager.ts",
    // Forking a session file and an extension command's ctx.newSession / fork /
    // switchSession are fork features; AgentSessionWrapper only wires them in.
    movedTo: ["lib/session-replacement.ts"],
    movedDefinitions: ["UNSAVED_SESSION_FORK_ERROR", "createSessionReplacementActions"],
    absentFromOrigin: [
      "cancelledBySessionReplacementHook",
      "moveToReplacementSession",
      "session_before_fork",
      "Session file not found: ",
    ],
    requiredInOrigin: ["createSessionReplacementActions(", "writeForkedSession(this.inner"],
  },
];

const FORK_FEATURES = [
  {
    name: "stable message keys in the fork memoized transcript",
    file: "components/ChatWindow.tsx",
    markers: ["assignMessageKeys(current.tracker, messages, entryIds)", "messageKeys[idx] ?? idx", "messageKeys[groupStartIdx] ?? groupStartIdx"],
  },
  { name: "Right panel single header", file: "components/AppShell.tsx", markers: ["right-panel-tab-strip", "file-panel-viewer-bar", "file-panel-split"] },
  { name: "Composer preparation and branch metadata", file: "components/ChatInput.tsx", markers: ["prepareOutgoingMessage", "<BranchControl", "snapshotRef"] },
  { name: "Checkout admission", file: "lib/rpc-manager.ts", markers: ["withCheckoutGuard", "hasBusyCheckout"] },
  {
    name: "ChatWindow new-session header",
    file: "components/ChatWindow.tsx",
    // Upstream renders an empty-state branding header (app icon + product name +
    // version badge) directly above the composer. The fork strips it, and later
    // dropped the update chip that replaced it, so merging upstream's
    // ChatWindow.tsx would silently put the header back — the absence checks
    // are the point of this entry.
    markers: ["isEmptyNew"],
    forbiddenMarkers: ["apple-touch-icon", "PRODUCT_NAME", "NewSessionUpdateLink"],
  },
  {
    name: "sidebar header controls",
    file: "components/AppShell.tsx",
    // The top-right row of the sidebar is settings + collapse only. The sun/moon
    // theme toggle that used to sit beside them (upstream's "toolbar theme
    // selector", reachable here through the fork's restyle) was removed on
    // request; theme selection lives in Settings → General, and its locale keys
    // (`theme.light` / `theme.dark` / …) went with it.
    markers: ["onClick={openSettingsAtLastSection}", "sidebar-chrome-button", "handleSidebarToggle"],
    forbiddenMarkers: ["theme.light", "aria-pressed={isDark}"],
  },
  {
    name: "AppShell desktop chrome",
    file: "components/AppShell.tsx",
    // The window buttons and platform detection live in components/desktop/ now;
    // what AppShell must keep is the mount point and the drag-region spread.
    markers: [
      "useDesktopChrome",
      "WindowControls",
      "dragRegionProps",
      "app-topbar--mac-inset",
      "SettingsPanel",
      "UpdateReminder",
      "PRODUCT_NAME",
    ],
  },
  {
    name: "app info and desktop preferences live in General settings",
    file: "components/SettingsPanel.tsx",
    markers: ["AppUpdatesSection", "DesktopAppSection", "settings-general-intro"],
  },
  {
    name: "FileViewer toolbar",
    file: "components/FileViewer.tsx",
    // The toolbar carries view controls only; the file's identity and icon
    // live on its tab in the panel header.
    markers: ["FileViewerToolbar", "FileViewerStatus", "file-viewer-controls"],
  },
  {
    name: "TabBar chrome",
    file: "components/TabBar.tsx",
    markers: ["file-tab-bar", "file-tab-label", "file-tab-close"],
  },
  {
    name: "missing-folder path (chat area)",
    file: "components/AppShell.tsx",
    // Losing the mount point puts the composer back in front of a directory
    // where every cwd-scoped request answers 403.
    markers: ["MissingFolderNotice", "activeCwdMissing", "sidebarActionsRef"],
  },
  {
    name: "missing-folder path (sidebar)",
    file: "components/SessionSidebar.tsx",
    markers: ["resolveSidebarNewSession", "actionsRef", "group.cwdMissing"],
  },
  {
    name: "Scheduled entry in the sidebar",
    file: "components/SessionSidebar.tsx",
    // The row under New Session, and the filter that keeps scheduled runs out of the
    // project tree. Losing the filter would bury a user's own sessions under every
    // run of an hourly task; losing the row leaves the feature unreachable.
    // The completion notification skips scheduled sessions: they report through
    // useScheduledRunNotifications instead, so losing the guard doubles every notification.
    markers: ["ScheduledSidebarRow", "onOpenScheduled", 'relation?.kind !== "scheduled"', "isScheduledRunSession"],
  },
  {
    name: "Scheduled page in AppShell",
    file: "components/AppShell.tsx",
    // The page covers the chat without unmounting it. Picking a session or starting a
    // new one must close it, and the cold-start restore must not.
    markers: ["ScheduledView", "scheduledOpen", "scheduledOpenRef", "handleOpenScheduled", "setScheduledOpen(false)", "useScheduledRunNotifications"],
  },
  {
    name: "scheduled runs are tagged in the session list",
    file: "app/api/sessions/route.ts",
    markers: ["attachScheduledRelations"],
  },
  {
    name: "scheduler starts with the server",
    file: "instrumentation-node.ts",
    markers: ["startScheduler"],
  },
  {
    name: "native theme layer",
    file: "app/layout.tsx",
    // Dropping this import silently reverts the entire restyle to upstream.
    markers: ["./native-theme.css", "PRODUCT_NAME"],
  },
  {
    name: "artifacts: assistant markdown renders previews and artifact cards",
    file: "components/MarkdownBody.tsx",
    // Inline ```html/```svg/```jsx previews and `:::artifact` cards. All the logic
    // lives in lib/html-preview.ts, lib/artifacts.ts and the Artifact*/HtmlPreview*
    // components; these are the hooks into the renderer a merge could drop.
    markers: ["ARTIFACT_FENCE_LANG", "encodeArtifactsForMarkdown", "htmlPreviewKind", "<HtmlPreviewBlock"],
  },
  {
    name: "artifacts: only assistant text opts into artifact rendering",
    file: "components/MessageView.tsx",
    markers: ["onOpenFile={onOpenFile} artifacts={artifacts}>{block.text}", "artifacts={Boolean(sessionId)}"],
  },
  {
    name: "artifacts: ChatWindow publishes the session's artifacts",
    file: "components/ChatWindow.tsx",
    markers: ["useArtifactPublisher("],
  },
  {
    name: "artifacts: the right panel hosts artifact tabs",
    file: "components/AppShell.tsx",
    markers: ["setArtifactOpener(", "<ArtifactPanel", "artifactPanelTab", "artifactTabs.some((tab) => tab.id === tabId)"],
  },
  {
    name: "artifacts: tab bar knows the artifact tab kind",
    file: "components/TabBar.tsx",
    markers: ['kind?: "terminal" | "artifact"', 'tab.kind === "artifact"'],
  },
  {
    name: "artifacts: normal sessions get the prompt section",
    file: "lib/rpc-manager.ts",
    markers: ["createArtifactGuideExtension()"],
  },
  {
    name: "artifacts: General settings has the artifacts switch",
    file: "components/SettingsPanel.tsx",
    markers: ["<ArtifactsSettingRow />"],
  },
];

/**
 * Upstream UI this fork deliberately deleted. Unlike a fork *addition*, a
 * deletion is invisible to the other sentinels: upstream still ships the code,
 * so a merge that reintroduces it is textually clean and the app silently grows
 * a second entry point back. See docs/ui-refresh-plan.md decisions 7 and 8.
 */
const REMOVED_UPSTREAM_UI = [
  {
    name: "redundant sidebar branch switching",
    file: "components/SessionSidebar.tsx",
    // Composer BranchControl remains the sole branch-switch entry. The new
    // project menu offers worktree checkout management without restoring it.
    markers: ["onShowBranches=", "showNativeProjectBranchMenu(", "sidebar.switchBranch"],
    required: ["<ProjectContextMenu", "showNativeProjectWorktreeMenu(", "useProjectWorktreeActions("],
  },
  {
    name: "Outgoing preview composer feature",
    file: "components/AppShell.tsx",
    markers: ["SendPreview", "sendPreview", "draftRevision"],
    required: ["file-panel-viewer-bar"],
  },
  {
    name: "Compact composer button",
    file: "components/ChatInput.tsx",
    markers: ["composer-compact-button", "sendPreview", "<SessionAutomationMenu"],
    required: ["ContextUsageRing", "prepareOutgoingMessage"],
  },
  {
    name: "Full history toolbar button",
    file: "components/AppShell.tsx",
    // The HTML export is reached through the /export slash command (handleExportHtml).
    markers: ["handleViewFullHistory", "history.full", "history.label"],
    required: ["handleExportHtml"],
  },
  {
    name: "Topbar Tools button and More menu",
    file: "components/AppShell.tsx",
    // Removed 2026-09-25: the topbar keeps only title, sub-agents and forks.
    markers: ["app-topbar-more", "handleSystemInfoToggle", "tools.label", "<SystemPromptPanel", "<ToolDefinitionsPanel"],
    required: ["panelOwnsTopRight"],
  },
  {
    name: "Session stats top panel",
    file: "components/AppShell.tsx",
    // The composer context ring (ContextUsageRing) is the only indicator left.
    markers: ["SessionStatsPanel", "openSessionStatsPanel", "appshell.sessionStats", "session-info-popover"],
    required: [],
  },
];

for (const extraction of EXTRACTIONS) {
  test(`${extraction.name}: extracted code does not reappear at its origin`, async () => {
    const origin = await read(extraction.origin);

    for (const symbol of extraction.movedDefinitions) {
      assert.equal(
        definesSymbol(origin, symbol),
        false,
        `${extraction.origin} defines ${symbol} again — an upstream merge probably resurrected it. ` +
          `It belongs in ${extraction.movedTo.join(" or ")}; importing it is fine, redefining it is not.`,
      );
    }

    for (const marker of extraction.absentFromOrigin) {
      assert.ok(
        !origin.includes(marker),
        `${extraction.origin} contains "${marker}" again — it moved to ` +
          `${extraction.movedTo.join(" or ")} and must not come back.`,
      );
    }
  });

  test(`${extraction.name}: the extraction targets still own the moved code`, async () => {
    const targets = await Promise.all(extraction.movedTo.map(read));

    for (const symbol of extraction.movedDefinitions) {
      assert.ok(
        targets.some((source) => definesSymbol(source, symbol)),
        `None of ${extraction.movedTo.join(", ")} defines ${symbol}.`,
      );
    }

    // Without this the origin-side check could pass simply because the code was
    // deleted everywhere rather than relocated.
    for (const marker of extraction.presentInTargets ?? extraction.absentFromOrigin) {
      assert.ok(
        targets.some((source) => source.includes(marker)),
        `"${marker}" is not owned by ` +
          `${extraction.movedTo.join(", ")} — it looks deleted, not moved.`,
      );
    }
  });

  test(`${extraction.name}: the origin still consumes the extraction`, async () => {
    const origin = await read(extraction.origin);

    for (const symbol of extraction.requiredInOrigin) {
      assert.ok(
        origin.includes(symbol),
        `${extraction.origin} no longer references ${symbol} — the merge may have reverted it ` +
          `to the upstream inline implementation.`,
      );
    }
  });
}

for (const feature of FORK_FEATURES) {
  test(`${feature.name}: fork changes survive upstream merges`, async () => {
    const source = await read(feature.file);

    for (const marker of feature.markers) {
      assert.ok(
        source.includes(marker),
        `${feature.file} lost "${marker}" — an upstream merge likely reverted this file toward ` +
          `its upstream form. Re-apply the fork change rather than deleting this assertion.`,
      );
    }

    for (const marker of feature.forbiddenMarkers ?? []) {
      assert.ok(
        !source.includes(marker),
        `${feature.file} contains "${marker}" again — an upstream merge re-adopted upstream's ` +
          `version of this region. The fork removed it deliberately; re-apply the removal ` +
          `rather than deleting this assertion.`,
      );
    }
  });
}

for (const removal of REMOVED_UPSTREAM_UI) {
  test(`${removal.name}: removed upstream UI does not come back`, async () => {
    const source = await read(removal.file);

    for (const marker of removal.markers) {
      assert.ok(
        !source.includes(marker),
        `${removal.file} contains "${marker}" again — an upstream merge probably restored UI ` +
          `this fork removed on purpose. Delete it again rather than deleting this assertion.`,
      );
    }

    for (const marker of removal.required) {
      assert.ok(
        source.includes(marker),
        `${removal.file} lost "${marker}" — the replacement for the removed UI is gone.`,
      );
    }
  });
}

test("the fork extension status line keeps upstream's opaque background", async () => {
  const composer = await read("components/ChatInput.tsx");
  const css = await read("app/native-theme.css");
  assert.match(composer, /<ExtensionStatusLine statuses=\{extensionStatuses\}/);
  assert.doesNotMatch(composer, /<ExtensionStatusBar/);
  const statusLine = css.match(/\.extension-status-line\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(statusLine, /background:\s*var\(--bg\)/);
});

test("fork project actions fall back when the native popup cannot open", async () => {
  const source = await read("components/SessionSidebar.tsx");
  const handler = source.slice(source.indexOf("const openProjectMenu ="), source.indexOf("// Phase A: project tree"));
  assert.match(handler, /showNativeProjectMenu[\s\S]*\.then\(\(shown\)/);
  assert.match(handler, /if \(!shown\) openDomMenu\(\)/);
  assert.match(handler, /setProjectMenuPos\(\{ top: rect\.bottom \+ 4, left \}\)/);
  assert.match(handler, /setProjectMenuAnchor\(\{ top: rect\.top, bottom: rect\.bottom, right: rect\.right \}\)/);
});

test("sidebar Settings opens the remembered safe section directly without a redundant menu", async () => {
  const shell = await read("components/AppShell.tsx");
  assert.match(shell, /onClick=\{openSettingsAtLastSection\}/);
  assert.match(shell, /onOpenSettings: settingsSection \|\| shortcutHelpOpen \? undefined : openSettingsAtLastSection/);
  assert.match(shell, /<SettingsPanel[\s\S]*?cwd=\{projectTrustCwd\}[\s\S]*?initialSection=\{settingsSection\}/);
  assert.doesNotMatch(shell, /useSettingsEntryMenu|<SettingsEntryMenu|toggleSettingsMenu/);

  // Execute the actual click callback with the production section resolver:
  // remembered project-only pages must not receive the hidden Chats directory.
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url);
  const { getLastSettingsSection, setLastSettingsSection } = await jiti.import("../lib/settings-navigation.ts");
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const body = shell.match(/const openSettingsAtLastSection = useCallback\(\(\) => \{([\s\S]*?)\n  \}, \[/)?.[1];
  assert.ok(body, "the Settings click callback must remain testable");
  const run = new Function("setActiveTopPanel", "setSettingsSection", "getLastSettingsSection", "isChatWorkspaceActive", "selectedSession", "newSessionCwd", "activeCwd", body);
  for (const section of ["general", "models", "skills", "agents", "plugins", "mcp"]) {
    setLastSettingsSection(section, storage);
    for (const chat of [false, true]) {
      const calls = [];
      run((value) => calls.push(["panel", value]), (value) => calls.push(["settings", value]),
        (cwd) => getLastSettingsSection(cwd, storage), chat, { cwd: chat ? "/hidden-chat" : "/project" }, null, "/project");
      const expected = chat && ["skills", "agents", "plugins"].includes(section) ? "general" : section;
      assert.deepEqual(calls, [["panel", null], ["settings", expected]]);
    }
  }
});

test("sidebar missing-folder protection delegates to the Chats-aware resolver", async () => {
  const sidebar = await read("components/SessionSidebar.tsx");
  const helper = await read("lib/sidebar-new-session.ts");
  assert.match(sidebar, /const target = resolveSidebarNewSession\(\{[\s\S]*?sessions: allSessions,[\s\S]*?recentProjects,[\s\S]*?homeDir,/);
  assert.match(sidebar, /if \(!target\) return;\s*const \{ cwd, workspaceKind \} = target;/);
  assert.match(sidebar, /onNewSession\?\.\(tempId, cwd, workspaceKind\)/);
  assert.match(helper, /import \{ resolveNewSessionCwd \} from "\.\/missing-folder"/);
  assert.match(helper, /const cwd = resolveNewSessionCwd\(/);
  assert.doesNotMatch(sidebar, /import \{ resolveNewSessionCwd \}/);
});

test("the shell mounts the shared in-app file context menu host", async () => {
  const source = await readFile(new URL("./AppShell.tsx", import.meta.url), "utf8");
  assert.match(source, /<DomContextMenuHost \/>/);
});

test("navigator jumps expand the fork's memoized transcript including process groups", async () => {
  const source = await read("components/ChatWindow.tsx");
  const renderer = source.slice(source.indexOf("const renderedMessages = useMemo"), source.indexOf("const selectConversationTurn ="));
  assert.match(renderer, /data-conversation-turn=\{turnIndexByMessageIndex\.get\(idx\)\}/);
  assert.match(source, /setVisibleCount\(\(current\) => Math\.max\(current, messages\.length \* 2\)\)/);
});
