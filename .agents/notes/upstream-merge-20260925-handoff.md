# Upstream merge record — 2026-09-25

Two-parent merge of abcwyc/pi-agent-desktop `upstream/main` (`a13d258`) into this
fork's `main` (`5b62ac0`). 32 incoming commits, including the pi-web segment F
merge (`15bee2b`, pi-web `96966e5`, pi SDK 0.87.1). 16 files conflicted:
AGENTS.md, app/globals.css, app/native-theme.css,
AppShell.file-viewer-state.test.mjs, AppShell.tsx, ChatInput.tsx, ChatWindow.tsx,
SessionSidebar.tsx, useAgentSession.test.mjs, useAgentSession.ts, pi-types.ts,
rpc-manager.ts, session-reader.ts, types.ts, package-lock.json,
fork-ownership.json.

## Integrated from upstream

- pi SDK 0.87.1, next 16.3.6, semver 7.8.5, undici 8.11.0; production-install
  trim (ansi_up and remark-frontmatter moved to devDependencies).
- Exact system prompts through `lib/exact-system-prompt.ts` (`before_agent_start`),
  including chat-only context-file prompts. The old `transformContext` path stays
  deleted.
- Session list hydration (`summary=1`, `detailsPending`), view-cache freshness,
  and single-flight session reads, with the fork's monotonic generation guards
  kept.
- Enabled-model toggles, manual catalog refresh, per-tab session memory
  (`lib/tab-session.ts`) on top of desktop workspace restore, auth/env fixes,
  and individual built-in subagent switches.
- Chat scrollbar (`scrollbar-subtle` + `useScrollbarVisibility`) and the
  pending-scroll visibility gate. New-session update link in the empty state.
- Per-tab session memory writes `?session=` on restore. The fork keeps
  `history.replaceState` instead of `router.replace` so the composer is not
  remounted. The fixed right-panel toggle stays the desktop control.

## Kept from the fork

- Project-tree sidebar, full-height sidebar, and the one-group topbar. Declined
  again: sidebar explorer panes, DirectoryPicker-as-sidebar, SessionSearch as
  the sidebar UI, ChatMinimap.
- Simplified class-based composer, context ring as a composer chip, side chat /
  recap, IndexedDB drafts (no abandoned-draft `clearDraft` on unmount).
- Native `pushState` / `replaceState` history so Back/Forward does not remount
  the composer. Tab-memory restore still writes `?session=` via `replaceState`.
- SSE running-id stream, not the 2.5s poll. Playwright remains `test:e2e`.
- Extension status bar (upstream removed it in `ede3600`); styles live in
  `app/native-theme.css`. Effort and tool-preset localStorage carry-over.
- `--experimental-strip-types` on the test script and the `scripts/**` glob.

## Notable resolutions

- `loadSession` combines upstream's `"error"` failure value with the fork's
  `if (!isCurrent()) return null` so a stale read cannot paint an error.
- New sessions still seed tools/effort from localStorage; existing sessions
  start at `CONFIGURED_TOOL_PRESET` until the transcript selection is read (#700).
- `configured` tool preset maps to saved-task `inherit` so TaskSetup stays valid.
- Layout test close sequence updated for the fork's file-tree wrapper inside
  upstream's main-column / inner-row structure.

## Known pre-existing issues

`SessionSidebar.tsx` still carries unused explorer/search state that
`SessionSidebar.test.mjs` pins as source markers. Lint reports those as unused.

## Verification

tsc clean; lint 0 errors (38 warnings, down from 45); unit 1,627 passed.
Playwright full suite: 44 passed, 2 failed. The failures were the saved-task
panel not restoring after reload (browser workspace hydration had been skipped)
and a plain draft expecting the old `default` tool preset. Both fixed
(`workspaceHydrated` starts false; the assertion expects `configured`).
Targeted rerun of those two tests passed. A second full-suite run was cancelled.
