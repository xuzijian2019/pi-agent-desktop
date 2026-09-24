# Upstream merge record — 2026-09-24

Two-parent merge of abcwyc/pi-agent-desktop `upstream/main` (3e6350b) into this
fork's `main` (45ffe69). Two incoming commits: 6c82e92 (settings desktop tab,
file-panel terminals, per-session scroll anchors, app-update version detection)
and 3e6350b (topbar dropdowns clear of sidebar and file panel). 7 files
conflicted: AppSettings, AppShell, ChatInput, ChatWindow, SessionSidebar,
TabBar, useAgentSession.

## Integrated from upstream

- Settings "desktop" section embedding `AppSettings` in `SettingsPanel`;
  `UpdateReminder` now opens that section.
- Terminal tabs: `TabBar` "New terminal" button; "Open terminal here" in the
  fork's project context menu (`SessionSidebar`).
- Per-session scroll anchors: saved from `useAgentSession`'s identity-switch
  block; `ChatWindow` resets viewport state during render on session change
  (replaces the fork's post-commit lazy-load reset effect).
- `loadSession` generation guard (`if (!isCurrent()) return null`) after fetch.
- Steer/follow-up with attached images from `ChatInput`.
- Topbar dropdowns reserve sidebar / split file-panel width (`wideSplitLayout`).
- `/api/app-update` version detection + test; i18n keys.

## Kept from the fork

- Project-tree sidebar and its menu layout; `TabBar` class-based markup
  (upstream now matches the fork's single label).
- `test:e2e` stays Playwright; upstream's runner is `test:e2e:upstream`.
- `/settings` builtin still opens the `AppSettings` modal (upstream removed
  the modal). Same content as the new desktop tab — candidate to unify.

## Housekeeping

- `release-component-pins.json` / `component-versions.json` now match the
  bundled versions (pi 0.86.1, pi-web 0.10.0); the previous pi-web pin
  (`0.9.1+main974c8bb`) no longer matched `package.json`.
- New sentinels: topbar reservation (`AppShell.right-panel-row.test.mjs`),
  desktop settings embedding (`fork-extractions.test.mjs`), session-switch
  scroll/generation guards (`useAgentSession-session-isolation.test.mjs`).

## Known, pre-existing (not introduced here)

`SessionSidebar.tsx` carries dead state — `setSessionSearchOpen`,
`virtualIndices`, explorer/changes state — flagged by lint as unused. The new
`SessionSidebar.test.mjs` sentinel asserts those markers survive, which guards
source text rather than working behaviour.

## Verification

tsc clean; lint 0 errors (45 warnings, all pre-existing); unit 1,444 passed;
Playwright 46 passed (`PW_CHANNEL=chrome`; bundled Chromium not installed).
