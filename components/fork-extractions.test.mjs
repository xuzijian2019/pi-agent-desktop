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
];

const FORK_FEATURES = [
  { name: "Shared right workbench", file: "components/AppShell.tsx", markers: ["PanelModeSelector", "TranscriptSearchPanel", "SavedTasksPanel", "PinnedSection", "ChangesSection", "ActivityPanel", "panelMode: rightPanelMode"] },
  { name: "Composer preparation and branch metadata", file: "components/ChatInput.tsx", markers: ["prepareOutgoingMessage", "<BranchControl", "snapshotRef"] },
  { name: "Runtime activity and checkout admission", file: "lib/rpc-manager.ts", markers: ["beginActivity", "finishActivity", "withCheckoutGuard", "hasBusyCheckout"] },
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
    name: "desktop settings remain embedded in the settings panel",
    file: "components/SettingsPanel.tsx",
    markers: ["AppSettings embedded", "sectionHost(\"desktop\""],
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
    markers: ["resolveNewSessionCwd", "actionsRef", "group.cwdMissing"],
  },
  {
    name: "native theme layer",
    file: "app/layout.tsx",
    // Dropping this import silently reverts the entire restyle to upstream.
    markers: ["./native-theme.css", "PRODUCT_NAME"],
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
    name: "Outgoing preview composer feature",
    file: "components/AppShell.tsx",
    markers: ["SendPreview", "sendPreview", "draftRevision"],
    required: ["SavedTasksPanel"],
  },
  {
    name: "Compact composer button",
    file: "components/ChatInput.tsx",
    markers: ["composer-compact-button", "sendPreview"],
    required: ["ContextUsageRing", "prepareOutgoingMessage"],
  },
  {
    name: "Full history toolbar button",
    file: "components/AppShell.tsx",
    // The HTML export lives in the More menu now (handleExportHtml).
    markers: ["handleViewFullHistory", "history.full", "history.label"],
    required: ["handleExportHtml", "appshell.exportHtml"],
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
        `${extraction.origin} contains "${marker}" again — project-picker logic moved to ` +
          `${extraction.movedTo[0]} and must not come back.`,
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
    for (const marker of extraction.absentFromOrigin) {
      assert.ok(
        targets.some((source) => source.includes(marker)),
        `"${marker}" is absent from ${extraction.origin} but also from ` +
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
