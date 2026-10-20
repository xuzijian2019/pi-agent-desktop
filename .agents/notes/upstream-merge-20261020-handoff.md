# Upstream merge handoff — 2026-10-20

- Desktop upstream: `d414e9db0cc41e88d2cc4c243b728b4d28dd5ea9` (0.7.5).
- Fork before merge: `da680936445751be7f708f027d8b511a688661b6`.
- Merge base: `10cc27f9789a76d06dfd511b23304d8c2cad15cf`.
- Incoming: 23 commits, 214 upstream-touched paths, 61 overlapping paths.
- Integration branch: `merge/upstream-20261020-1215-d414e9db`; local backup: `backup/pre-upstream-merge-20261020-1215`.
- Fresh isolated checkout on the requested cloud executor. Separate fetches for origin, desktop upstream and agegr/pi-web. `--no-ff --no-commit` merge; no rebase, squash, force push or main push. No release/tag/deployment. Main merge requires separate approval for this PR.
- Actual pi-web drift baseline: `6fcd7d44981ab51a21d6cd6eb06d361d0e3d3068`, verified as the upstream/pi-web merge base.

## Integrated from upstream

- Desktop 0.7.4/0.7.5, Chats workspace separate from projects, chat pin/group/archive/settings and continue-in-project.
- Chat text/code/Word attachments, explicit-user-path read policy, safe non-overwriting Downloads saves, configurable tool allow-list and MCP behavior.
- Editable follow-up outbox, attachment restoration, title normalization and provider de-duplication.
- Shared menus/option controls/keyboard navigation; project timeline and session pagination.
- First-screen native reveal, macOS hidden-window paint mask/fallback, Windows overwrite route-cache cleanup and LAN exposure policy.

## Kept from the fork

- Project-tree/sidebar-left interaction design, manual ordering and missing-directory safety.
- Simplified composer, composer-only branch control, IndexedDB drafts, side/recap, prepared single sends and session isolation guards.
- Memoized transcript/tail-follow behavior, class-based tabs, live file status and browser workspace memory.
- Fork theme/customizations remain in native-theme.css; upstream globals.css/settings.css unchanged.

## Notable resolutions

- Resolved 37 textual conflicts and reviewed all 61 overlapping paths, including clean-merged file moves.
- Sidebar keeps manual project order, peek, path hints, session anchors and missing-directory protection. New Chats are server-classified and never selected as a missing-project fallback; executable regressions cover that boundary and Chat→project/browser Back transitions.
- Replaced the old Recent section with upstream timeline/pagination while preserving cross-project selection and draft coverage. Settings opens directly at the saved valid section; a runtime test verifies all sections and project-only fallback without retaining a deleted popup.
- Preserved fork tail-follow/memoized transcript instead of resurrecting upstream prompt-pinning. The new browser fixture tests the actual fork scroll and overlay resize callbacks across mobile/desktop and long replies.
- Composer keeps branch chip, side/recap, prepared single sends and IndexedDB drafts. Adopted outbox and attachments; fixed concurrent attachment count/byte overflow and rekey restoring stale drafts. Chats do not inherit/write project tool/thinking preferences, and file attachments remain in memory.
- Busy edit actions remain visible but disabled, editDisabled participates in memo comparisons, and copy feedback retains its live region. Branch summary and session-reset guards survive extraction-aware tests.
- Fork-only branch/command/context popups now join app-menu. BranchControl uses shared selects with a portal-aware outside-click boundary; regression coverage ensures child selectors do not dismiss the parent. New Playwright cases cover cancellation without changing Git state, desktop/mobile, light/dark and screenshots.
- All three effective locales contain 1,881 matching keys; retained pre-existing English-only countSuffix plural behavior. Fork settings switches, update busy guard, typography/timing/radii and styling boundaries remain intact.
- Ownership retains live FileViewerStatus and gains the sidebar target resolver; removed only truly obsolete SettingsEntryMenu/Recent entries. Nine overlaps in the historical ownership fixture now include both retained FileViewer and upstream's new hook boundary; assertions protect both.
- Preserved all existing dependency lock versions, adding Radix dependencies without re-resolving Tauri/pi versions.
- New upstream browser fixture scripts are included through the fork's Playwright test entry rather than silently replacing or omitting either suite.

## Known pre-existing issues and limits

- Local Chromium launch fails at process_singleton socket creation with EPERM. This is a verified executor limitation, not a browser test pass; no bypass attempted. Browser evidence must come from actual PR CI artifacts and/or authorized supplemental QA.
- Existing CI runs Linux and Windows Rust with placeholder bundle resources, not package acceptance. macOS/AppKit changed in this upstream batch and needs supplemental native verification.
- Fork Playwright webServer starts the dev workflow even when CI exports E2E_SERVER_MODE=start. A production build alone is not production-runtime browser acceptance.

## Verification

- npm ci: passed in isolated HOME/cache; existing peer/deprecation warnings retained.
- Component versions: desktop 0.7.5, pi 1.3.0, pi-web 0.10.0; both pins and generated manifest match.
- Focused upstream security/attachment/chat-policy/native-reveal/title/cache tests: 65 passed, no skips.
- TypeScript: passed on resolved tree; lint: passed, 0 errors / 21 warnings (same count as prior handoff).
- Release/tooling tests: 26 passed. Ownership and CSS checks passed. Drift measured against actual pi-web baseline, all recorded entries refreshed with no risk-policy relaxation.
- Production-only npm audit: zero reported vulnerabilities.
- Full unit suite: 3,232 passed, zero failures/skips/cancellations. Isolated production standalone build passed (pre-existing dynamic export dependency warning); this is not a packaged-native or production-browser pass.
- Exact-head GitHub CI, pixel/interaction review and supplemental macOS native validation: pending; PR must remain draft.

## Silent semantic overlap review inventory

- `.github/workflows/release.yml`
- `app/api/agent/new/route.ts`
- `app/layout.tsx`
- `app/native-theme.css`
- `components/AgentsConfig.test.mjs`
- `components/AppShell.right-panel-row.test.mjs`
- `components/AppShell.tsx`
- `components/AppShell.workspace-memory.test.mjs`
- `components/BranchNavigator.summary.test.mjs`
- `components/ChatInput.automation.test.mjs`
- `components/ChatInput.streaming-thinking.test.mjs`
- `components/ChatInput.test.mjs`
- `components/ChatInput.tsx`
- `components/ChatWindow.composer-alignment.test.mjs`
- `components/ChatWindow.tsx`
- `components/ComposerProjectChip.tsx`
- `components/FileExplorer.tsx`
- `components/FileTreeResizer.test.mjs`
- `components/MessageView.tsx`
- `components/MobilePwaLayout.test.mjs`
- `components/ProjectContextMenu.test.mjs`
- `components/ProjectContextMenu.tsx`
- `components/ProjectPicker.tsx`
- `components/SessionMentionMenu.tsx`
- `components/SessionSidebar.test.mjs`
- `components/SessionSidebar.tsx`
- `components/SessionSidebar.worktree.test.mjs`
- `components/SettingsPanel.test.mjs`
- `components/SettingsPanel.tsx`
- `components/fork-extractions.test.mjs`
- `components/path-ui.tsx`
- `components/restored-wiring.test.mjs`
- `components/sidebar-and-message-updates.test.mjs`
- `components/useAgentSession-session-isolation.test.mjs`
- `e2e/chat-appearance.mjs`
- `e2e/mcp-manager.mjs`
- `e2e/themes.mjs`
- `eslint.config.mjs`
- `hooks/useAgentSession.test.mjs`
- `hooks/useAgentSession.ts`
- `hooks/useKeyboardShortcuts.ts`
- `lib/app-prefs.ts`
- `lib/draft-store.test.mjs`
- `lib/draft-store.ts`
- `lib/i18n/locale-plugins.ts`
- `lib/project-group.test.mjs`
- `lib/project-group.ts`
- `lib/recent-sessions.test.mjs`
- `lib/rpc-manager-tool-exposure.test.mjs`
- `lib/rpc-manager.test.mjs`
- `lib/rpc-manager.ts`
- `lib/session-list-scanner.ts`
- `lib/session-reader.ts`
- `lib/types.ts`
- `next.config.ts`
- `package-lock.json`
- `package.json`
- `scripts/fork-ownership.json`
- `scripts/fork-ownership.test.mjs`
- `scripts/measure-fork-drift.mjs`
- `tsconfig.json`
