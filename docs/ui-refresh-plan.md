# Web UI refresh plan

Status: decisions accepted 2026-09-19; all four phases landed on `main` the same day
(final verification on the desktop web UI at 1440 px, light and dark). Scope is the
browser profile (`npm run web`); the Tauri shell must keep working but is not the target.

Goal: a calmer, rounder, less duplicated UI with the idle-network and missing-folder
logic fixed. Every stream below is one worktree, one PR, one fresh session.

## Constraint that shapes everything

This repo is a fork of `agegr/pi-web` ([ownership-boundaries.md](./ownership-boundaries.md)).
Structural edits to upstream files (`AppShell.tsx`, `SessionSidebar.tsx`, `ChatInput.tsx`,
`FileExplorer.tsx`, `MessageView.tsx`, `ChatWindow.tsx`) are a permanent merge cost.
Prefer, in this order:

1. Fork-owned files: `components/workbench/`, `app/workbench.css`, `app/native-theme.css`,
   `lib/panel-modes.ts`, `lib/web-ui-client.ts`, `lib/i18n/messages/workbench.ts`,
   `components/AppSettings.tsx`, `app/api/git/branches/`, `lib/activity*.ts`.
2. Cosmetic edits to upstream files: swap an inline `style={{…}}` for a `className`, or
   change one guard line. Large diff is fine; the pattern is `ModelsConfig.tsx`.
3. Structural edits to upstream files only in stream E, and only in `AppShell.tsx`,
   which is already an accepted high-drift file.

Run `npm run drift` before opening a PR. Structural drift for upstream files must not
grow except in stream E. Update `scripts/fork-ownership.json` in the same commit when a
stream changes the boundary.

## Decisions (accepted defaults)

| # | Decision |
|---|---|
| 1 | Remove the **Browser** panel mode and `components/BrowserPanel.tsx`. |
| 2 | **Context** panel becomes a "Preview send" toggle in the composer; delete `ContextPanel.tsx` afterwards. |
| 3 | **Diff** merges into Files as a "Changes" section with inline patches; delete `DiffPanel.tsx`. |
| 4 | **Outputs** pins become a pinned section inside Files; delete `OutputsPanel.tsx`. |
| 5 | Header **Branches** (conversation forks) is renamed "Forks" and hidden when the session has none. |
| 6 | The two sidebar git-branch UIs go; the composer branch chip (`BranchControl`) is the one git entry point. |
| 7 | **Full history** header button is removed; the HTML export stays reachable under More. |
| 8 | "Session stats" leaves the More menu; the composer context ring stays as the single indicator and is hidden on empty sessions. |

Resulting panel modes: Files, Activity, Search, Saved Tasks.

## Streams

### Phase 1: correctness (A, B, C run in parallel)

**A. Network hygiene** (fork files, one guard line in `FileExplorer.tsx`)
- `lib/web-ui-client.ts`: coalesce identical in-flight GETs and serve repeats within
  5 s from a small cache; map 403 to a friendly message ("This folder is not accessible
  or no longer exists").
- `lib/desktop-connection.ts` / `AppShell.tsx:426`: run the `/api/home` probe only when
  `isTauriDesktop()`.
- `components/FileExplorer.tsx:1157`: when the watch-dir EventSource errors with a
  404/403, close it and do not reconnect until `cwd` changes.
- `components/workbench/BranchControl.tsx`: share one poller for `/api/git/branches` and
  `/api/worktrees` per cwd (module-level subscription), 10 s interval, paused when hidden.
- Gate: new Playwright test in `tests/e2e/` that opens a new task, idles 60 s, and asserts
  ≤ 15 requests to `/api/`. Baseline before the change was ~500 in a few minutes.

**B. Missing-folder path** (`SessionSidebar.tsx` two lines, `ChatWindow.tsx` empty state)
- Disable the project "+" button when `group.cwdMissing`; tooltip "Folder no longer exists".
- When the active cwd is missing, the chat area shows one state: folder path, "no longer
  exists", actions "Remove project" and "Pick a new folder". No composer, no chips.
- Gate: e2e with a project whose directory was deleted; no raw "Access denied" text anywhere.

**C. Small fixes bundle** (each a few lines)
- Sidebar project header click only expands/collapses; new task only via "+".
- Sidebar open state is kept per breakpoint so closing the mobile drawer does not hide
  the desktop sidebar.
- Transcript search: Enter in the input runs the search.
- `lib/activity.ts:34`: title falls back to the session title, never the raw id.
- Saved Tasks: "No saved tasks yet" when the library is empty and no filter is active.
- Session row "…" button: aria-label "Session actions" (new i18n key), not "Project actions".
- Settings: version label shows the web package version in the browser build; tagline
  drops "desktop app" in the browser build.
- Composer: hide "Compact" and the context ring when the session has no messages.

### Phase 2: consolidation (after Phase 1 merges)

**D. One git entry point**: remove the branch popover at `SessionSidebar.tsx` ~1350 and
the context-menu branch list at ~1754; rename header Branches → Forks; hide it when the
session has no branches. Lowers structural drift in `SessionSidebar.tsx`.

**E. Panel modes 8 → 4**: `lib/panel-modes.ts`, `PanelModeSelector.tsx`, `AppShell.tsx`
mode switch, i18n en + zh-CN + workbench, `workbench.css`, `tests/e2e/workbench.spec.ts`.
Fold Changes and Pins into the Files tab. Depends on A's shared poller. Move the Context
preview into a composer popover before deleting `ContextPanel.tsx`.

**F. Header/More cleanup**: remove Full history button and Session stats item.

### Phase 3: design language (G, H, I in parallel, after Phase 2)

**G. Tokens** (`app/native-theme.css` only): radius scale `--radius-sm 8 / md 12 / lg 16 /
pill 999`; buttons, chips, inputs → sm; popovers, cards, bubbles, file tabs → md;
composer, dialogs, right panel → lg. One focus ring `0 0 0 3px var(--focus-ring)` via
box-shadow. All transitions use `var(--ease-native)`, 120 ms hover / 200 ms layout.
Retire `--text-meta` (use `--text-dim`) and `--surface-muted` (use `--bg-panel`).
Replace raw `5px/7px/9px/10px` radii with tokens.

**H. Inline styles → classes**: three sub-PRs, one per file: `SessionSidebar.tsx` menus,
`ChatInput.tsx` chips and popovers, `MessageView.tsx`. Classes live in
`native-theme.css` and reuse `native-popover`.

**I. Dead CSS**: delete unreferenced selectors in `native-theme.css`
(`context-diff-*` 3765–3869, `file-workbench-breadcrumb*` 426–453,
`sidebar-view-switcher*` 927–968, `file-add-menu*`, `file-tab-add*`), grep-verified.

### Phase 4: empty states

New-task screen shows one guidance line plus two or three recent saved tasks; Saved
Tasks and Files pins hide their filters until content exists; file tree on the left,
viewer on the right.

## Per-PR gate

```
node_modules/.bin/tsc --noEmit
npm test
npm run test:e2e
npm run drift
```

Plus screenshots at 1440, 1200 and 375 px wide in light and dark. Never run
`next build` in the dev checkout. The dev server on 30141 stays on `main`; e2e uses 30142.
