# Upstream merge handoff — 2026-10-18

- Desktop upstream: `10cc27f9789a76d06dfd511b23304d8c2cad15cf` (`abcwyc/pi-agent-desktop/main`, desktop 0.7.3).
- Fork before merge: `842ff2b2fdeb749ba025a22279998501e1c8c8a7` (`origin/main`).
- Merge base: `ee23e581e01637b51b6b7aa18ab265861344aef1` (desktop 0.7.2).
- Incoming: 24 commits, 20 non-merge commits; 327 upstream-touched paths and 28 upstream/fork overlaps.
- Integration branch: `merge/upstream-20261018-1400`; local backup: `backup/pre-upstream-merge-20261018-1400`.
- Ordinary two-parent `--no-ff --no-commit` merge, resolved in a fresh isolated checkout. No rebase, squash, force push, main push, tag, release, deployment or auto-merge. Publication is a draft PR only; merging main requires separate user approval.
- `agegr/pi-web` was fetched independently for drift measurement only. Its integrated baseline is `6fcd7d44981ab51a21d6cd6eb06d361d0e3d3068`, verified against desktop upstream ancestry.

## Integrated from upstream

- Desktop 0.7.3; unchanged bundled pi 1.3.0 and pi-web 0.10.0.
- Composer/session, workspace/settings-entry, project-menu/worktree and RPC session-replacement extractions.
- Cross-project Recent sessions, remembered expanded project lists, disambiguated project labels and worktree management from project actions.
- Workspace toggle/navigation improvements, Scheduled URL restoration and scheduler-owner diagnostics/takeover protection.
- Fork locale patch extraction: upstream-shaped base packs plus the fork's additions, replacements and removals.
- Refusal of unauthenticated non-loopback listeners without explicit opt-in; terminal cwd authorization before stat; option-like skill-package rejection; route/security coverage.
- Mammoth argparse 2 override, dropping vulnerable sprintf-js; installed dependency/lockfile pretest gate.
- Upstream demo refresh, demo-sync tooling and advisory drift job; CI action version updates. Verified upstream's three v7 action refs exist.

## Kept from the fork

- Full-height left project tree, sidebar peek, manual ordering, missing-directory protection, project path hints and link behavior.
- Simplified composer, separate model/reasoning/tools controls, composer branch chip as the sole branch-switch entry, latest focus treatment, IndexedDB drafts with references/setup, Side Chat/Recap and prepared single-shot sends.
- Memoized transcript/stable keys, session/request guards, class-based TabBar, fork file toolbar and live loading/error/empty states.
- Browser workspace persistence, terminal tab reconnect/selection, selected-file highlighting and controlled explorer search.
- General's auto-title/browser notification/reply-usage options. Completion audio, gear/extra steering controls, sidebar explorer and splitters remain absent.
- All custom CSS stays in native-theme.css; globals.css and settings.css remain byte-identical to the pi-web baseline.

## Notable resolutions

- Upstream removed FileViewerStatus as unused there, but this fork calls it in three live states. Restored it, retained its ownership boundary and added executable rendering/retry coverage. The ownership overlap fixture correctly remains eight, including FileViewer.
- Moved hook state needed fork-specific resets and async generation guards: scope warnings, automation/retry, branch-summary holds/results and idle-entry throttling. Tests exercise late replies, session switches and duplicate sends rather than only source strings.
- Preserved browser file-panel memory and terminal selection through the new workspace hook. Artifact title changes now invalidate memoized tabs. Selecting an already-restored session exits Scheduled in both UI and URL.
- Honored the fork’s 2026-09-19 single branch-entry decision: new sidebar Worktrees create/switch/remove/fetch is integrated, while a redundant Branches submenu remains absent in both DOM/native actions. Generic extracted branch helpers remain available without being mounted.
- Removed the clean-merged duplicate legacy project-menu portal. Preserved native-popup fallback, server-canonical checkout paths and correct project identity when creating a worktree from a nonselected project. Menu async responses and positioning are guarded; tests cover callbacks, IME behavior and stale loads.
- Updated extraction-aware test readers to their actual new owners. The composer automation-menu mount is explicitly forbidden rather than reintroduced to satisfy an upstream sentinel.
- All three effective locales contain 1,808 keys with matching placeholders. Restored branch/worktree labels needed by the new menu while preserving fork wording/removals. Base locale packs are identical to desktop upstream.
- New worktree route tests were adapted to the fork's existing Host/same-origin authorization. Kept invalid branch assertions strict: option-like names now return 400 before branch lookup. Added adversarial-host/origin checks; no authorization guard was removed.
- Recent-session test fixtures now use consistent local-day timestamps and pass UTC, Los Angeles and Taipei, fixing a timezone-dependent fixture failure without changing behavior.
- Started from the fork lockfile to retain Tauri/pi pins. npm's first lock-only update silently retained invalid argparse 1; applied the two exact upstream entry removals, regenerated and reran npm ci. npm ls and a runtime-resolution regression verify mammoth uses argparse 2.0.1 with no sprintf-js in the lock.
- CI uploads the existing synthetic E2E test-results/ and playwright-report/ artifacts on success as well as failure, with the existing seven-day retention. This enables visual review; the tests use isolated temporary HOME/agent data and synthetic sessions, not user data.

## Known pre-existing issues and verification limits

- Demo drift remains advisory: the newly integrated upstream demo copies do not include this fork's full custom UI. The check reports 29 additions, 43 updates, five removals, and manual patch conflicts in AppShell/FileViewer; no automatic rewrite of those custom demo patches was attempted.
- The existing Playwright configuration starts the dev server even when E2E_SERVER_MODE=start is set. E2E results must not be described as production-runtime coverage. The isolated webpack build is a separate gate.
- Installed Chromium cannot launch in this executor: process_singleton socket() is denied. This restriction was not bypassed. Browser acceptance and screenshot review must use the matching-revision CI artifacts or an explicitly authorized supplemental environment.
- Rust/cargo is absent here. Matching-revision Linux/Windows desktop-shell CI is required for Rust test/clippy results.
- Native-specific visual gaps are macOS/Windows window-controls ownership with the floating workspace panel, real native project/worktree menus and compact-terminal reload. Browser CSS/interaction screenshots cannot establish native AppKit behavior.
- Webpack's existing dynamic-import warning in app/api/sessions/[id]/export/route.ts and React peer/deprecation warnings remain.

## Verification

Final local gate pass after the single-branch-entry adjustment (2026-10-18 14:17 UTC): TypeScript clean; lint 0 errors / 21 warnings (previous baseline 26); full unit suite 3,076 passed / 0 failed across 13 suites. Isolated production webpack build in .next-desktop passed, with the pre-existing export-route warning. Dependency installation, lock/runtime override, release pins/manifest, CSS baseline and measured drift checks passed. Measured pi-web drift is 3,303 cosmetic / 12,898 structural lines (80% structural); risk thresholds and accepted dispositions are unchanged. Whitespace-only cleanup removes six inherited demo whitespace findings. Matching-revision browser/Rust CI and actual screenshots remain pending; keep this PR draft until the necessary acceptance evidence is reviewed. Publication uses the existing authenticated GitHub connector because shell push has no credential helper, preserving the tested tree and two ordered parents; exact commit/tree mapping is recorded in the PR. Focused evidence before final gates: composer/session 144 passing; shell/workspace 47; sidebar/Settings/locales 160; security/file-state/session-replacement 25; release/CSS consistency 29; worktree route 5.

## CI publication and validation follow-up

- Draft PR: https://github.com/xuzijian2019/pi-agent-desktop/pull/34. Published two-parent merge `149aa81e3e1b20d06e902344275db8b72a0b87d7` has the exact locally tested tree `a120da79207db4e3228830c50523aea2a13f9f03` from local merge `b316f7bb47d1ace22d78d62feae47a0e20523b91`. Fetched back and verified both ordered parents and empty tree diff.
- Upstream advanced to `42b685b1b42b9b0f4c423a4d95b70632e29068be` during publication. Its four later commits are deliberately excluded from this pinned 0.7.3 merge; handle them in the next sync.
- GitHub had suspended fork workflows for Actions usage scale. After maintainer-approved re-enabling, a single close/reopen retained the PR's draft state and SHA and triggered run `39140256018`. No repository credentials or permissions were added.
- Initial matching-head CI: checks, audit, demo advisory, Linux Rust tests/clippy and Windows Rust tests/clippy passed. E2E completed with 40 passed / 6 failed (46 total). The failures were test contracts made stale by the new UI: three tests had duplicate Recent/project-tree link targets, the mobile test matched both drawer/header controls, `/resume` expected the old search label, and Worktrees hovered the expanded group's child session instead of its header.
- Validation follow-up scopes navigation to the intended tree/header, preserves the exact search focus assertion with the current label, and verifies header-action opacity, pointer events and real center-point ownership before an ordinary click. No forced clicks, removed assertions, production CSS changes or product-code changes are used to hide these failures. Added Recent/tree selection and draft-restoration assertions.
- Visual evidence explained two provisional concerns: Today was fully visible in the initial screenshot; later retry snapshots recorded sidebar scrolling (17px then 295px), causing partial heading clipping. Phone panel slivers were captured immediately after the existing 250ms close transition began. Tests now wait for a closed, hidden, inert panel and real header hit targets before navigation/screenshots, plus settled open-panel geometry. Revised CI must confirm clean final screenshots.
- Supplemental macOS compile and WKWebView fixture load passed. UI automation timed out, so native menu/visual interactions were not verified. The diff changes no Rust source, native-menu bridge, window-controls implementation, TerminalPanel or PTY bottom layer. Final acceptance/remaining native-risk judgment and current-revision CI evidence are tracked in the PR; absence of checks or unreviewed screenshots is not success.

## Textually conflicted paths (20)

- `.github/workflows/release.yml`
- `app/native-theme.css`
- `components/AppShell-session-reset.test.mjs`
- `components/AppShell.tsx`
- `components/AppShell.workspace-memory.test.mjs`
- `components/ChatInput.automation.test.mjs`
- `components/ChatInput.tsx`
- `components/FileExplorer.tsx`
- `components/SessionSidebar.tsx`
- `components/SettingsPanel.tsx`
- `components/fork-extractions.test.mjs`
- `e2e/file-panel.mjs`
- `hooks/useAgentSession.test.mjs`
- `hooks/useAgentSession.ts`
- `lib/i18n/messages/en.ts`
- `lib/i18n/messages/zh-CN.ts`
- `lib/i18n/messages/zh-TW.ts`
- `package-lock.json`
- `package.json`
- `scripts/fork-ownership.json`

## Silent semantic review overlap inventory

- `.github/workflows/ci.yml`
- `.github/workflows/release.yml`
- `app/native-theme.css`
- `components/AppShell-session-reset.test.mjs`
- `components/AppShell.tsx`
- `components/AppShell.workspace-memory.test.mjs`
- `components/BranchNavigator.summary.test.mjs`
- `components/ChatInput.automation.test.mjs`
- `components/ChatInput.tsx`
- `components/ExtensionStatusLine.test.mjs`
- `components/FileExplorer.tsx`
- `components/FileViewer.tsx`
- `components/SessionSidebar.test.mjs`
- `components/SessionSidebar.tsx`
- `components/SettingsPanel.test.mjs`
- `components/SettingsPanel.tsx`
- `components/fork-extractions.test.mjs`
- `e2e/file-panel.mjs`
- `hooks/useAgentSession.test.mjs`
- `hooks/useAgentSession.ts`
- `lib/app-prefs.ts`
- `lib/i18n/messages/en.ts`
- `lib/i18n/messages/zh-CN.ts`
- `lib/i18n/messages/zh-TW.ts`
- `lib/rpc-manager.ts`
- `package-lock.json`
- `package.json`
- `scripts/fork-ownership.json`

## Incoming commits

```text
10cc27f9 chore(homebrew): update cask to 0.7.3
53798bd9 Prepare desktop release 0.7.3
f3ee4123 feat: improve workspace navigation and scheduled diagnostics
72b2a818 chore: extract fork i18n patches
abade109 chore: sync demo and update CI actions
bc54835d chore: remove dead file viewer code and drift entry
6606f43d Merge pull request #146 from abcwyc/claude/worktree-project-menu
d7c097ea feat(sidebar): manage worktrees from the project "…" menu; drop the hidden header dropdown
3bf663a0 Merge pull request #141 from abcwyc/claude/wonderful-rhodes-a3bc01
43981ebb Merge pull request #145 from abcwyc/claude/sharp-sanderson-b563bd
8bed60df Merge pull request #144 from abcwyc/claude/project-health-check-951794
cc6bca4c refactor(rpc): move session forking and extension session moves out of rpc-manager
9ef86d94 refactor(sidebar): move the project menu and branch list out of SessionSidebar
3a57dffd refactor(shell): move AppShell's fork layers into fork-owned files
0d238c9a feat(demo): mock the fork-only API routes
c3136c31 docs(agents): move fork topic notes out of AGENTS.md (80 KB -> 28 KB)
0b1d2b58 refactor(composer): move ChatInput's fork layers into fork-owned files
4afda339 fix(skills): reject option-like packages; route tests for worktrees, skills install, API keys
b05c436c refactor(chat): move useAgentSession's fork layers into fork-owned hooks
ee92e98a feat(demo): sync script for demo copies, resync with the main tree
c3a0e359 docs(agents): scope the app-prefs localStorage rule to fork code
8b1d8612 deps: override mammoth's argparse to 2.x to drop vulnerable sprintf-js
3be989f4 fix(security): refuse unauthenticated LAN listeners, authorize terminal cwd before stat
e5b6531f test: check node_modules against package-lock before npm test
```
