# Upstream merge handoff — 2026-10-15

- Upstream tip: `e5a55965` (abcwyc/pi-agent-desktop/main, desktop 0.7.1).
- Fork tip before final merge: `e8117604` (origin/main); previous upstream tip / merge base: `dcc573ef`.
- The checkout initially lagged origin/main at 02f436f5. Preserved the resolved initial attempt in backup/resolved-upstream-merge-20261015 (01148f4d), aborted that merge, fast-forwarded main to origin/main, and re-applied the reviewed resolutions to a fresh upstream merge. The final commit has only e8117604 and e5a55965 as parents.
- Backups: `backup/pre-upstream-merge-20261015` (initial local tip), `backup/pre-upstream-merge-origin-20261015` (actual remote base), plus the resolved snapshot above.
- Incoming relative to origin/main: 52 commits (36 non-merge commits); full list below.
- Push explicitly authorized by the user together with commit and Apple Silicon rebuild. Normal two-parent merge; no rebase or force-push.
- Textually conflicted files (18): `AGENTS.md`, `README.md`, `README.zh-CN.md`, `app/native-theme.css`, `bin/pi-web.js`, `components/AppShell.right-panel-row.test.mjs`, `components/AppShell.tsx`, `components/AppShell.workspace-memory.test.mjs`, `components/ChatWindow.tsx`, `components/SettingsPanel.tsx`, `docs/web-profile.md`, `hooks/useAgentSession.ts`, `lib/browser-open.js`, `lib/browser-open.test.mjs`, `package-lock.json`, `package.json`, `scripts/release-component-pins.json`, `scripts/web-dev.mjs`.

## Integrated from upstream

- Desktop 0.7.1 and bundled Pi SDK 1.2.0, plus updated MCP resource capability reporting.
- HTML/SVG/React inline previews and artifact cards, versioned artifact tabs in the right panel, bundled React/Sucrase/Tailwind preview runtime, localized preview errors and downloads, Ask to fix, artifact prompt setting, Mermaid fit/zoom.
- Edited-file summaries with line counts, lazy terminal/Scheduled imports, local file loading skeleton and retry.
- Stable sent-message keys, explicit new-session promotion identity, panel close/focus and shortcut, file-tree narrow-panel collapse, overflowing-tab fades and mouse-wheel scrolling.
- Desktop shell split into native_prefs/logging/shell modules, Windows import fix and Windows Rust CI. Retained upstream's revert of the macOS window move/resize flicker patch.
- Browser launch/lifecycle helpers.
- The previous origin/main merge already supplied General settings regrouping, current/latest version card, launch at login, macOS Dock behavior, Bedrock closure/mammoth packaging, plugin translations and KaTeX 0.19; retained all of it.

## Kept from the fork

- Project-tree sidebar, hover peek, sidebar-left shell, simplified composer and git chip, Side Chat/Recap, IndexedDB drafts and local model/effort/tool preferences.
- Memoized transcript, tail following and overlay composer, session cache and monotonic stale-response guards, scroll restoration and retry/error UI.
- Class-based TabBar and file toolbar/controls portal, missing-folder protection, browser notification opt-in, auto-title and per-reply token/cost switches.
- Playwright remains test:e2e; web launcher retains the fork's port-reclaim behavior.
- Fork CSS stays in native-theme.css; upstream globals.css/settings.css baseline is unchanged.

## Notable resolutions

- Reviewed all 41 upstream-touched/fork-modified overlaps, including clean merges. The final overlap list is recorded below. Preserved the remote 2026-10-13 handoff, Settings regrouping tests, browser locale strings, CSS baseline ref, ownership decision log, aligned sidebar toggle and opaque ExtensionStatusLine background.
- ArtifactPanel mounts in file-panel-viewer-body alongside the existing FileViewer and terminal paths; no upstream topbar More/history/system/tools UI is resurrected. Upstream's file-tree visibility and panel-size observer work through the fork's file-panel-split.
- Removed the obsolete split-panel space reservation: the topbar already occupies the center column and subtracting the panel again clipped branch dropdowns. Retained the outer-row nesting and top-right WindowControls sentinel.
- The fork already skips file loading during promotion of a new live session. Kept that path and adopted upstream's exact draft-key → id identity, instead of adding a second render reset or a stale promoted-load flag. Stable message keys were ported into the fork's memoized renderer and covered by a new extraction sentinel.
- Shared upstream process-lifecycle helper supersedes the former browser-open followChildUntilExit helper; production bin/pi-web.js matches upstream. Removed duplicate declarations introduced by the add/add merge.
- Adapted source/VM tests to the retained sidebar peek callback, missing-cwd guard, combined panel body class, stable process keys, and initial sidebarCollapsed URL state. The new upstream macOS chrome sentinel now checks the fork's retained 10px inset + 28px button, whose centre is 24px, instead of demanding upstream's different 48px row. File-browser E2Es explicitly open the now opt-in file tree.
- Mapped upstream's undefined --radius-xl reference to the fork's --radius-lg token. The new CSS variable gate catches missing declarations.
- Cross-feature guard: SideChatPanel reuses MessageView without a persistent session id, so only session-scoped text enables artifact directives. This prevents ephemeral replies from reading the parent's active artifact store; a runtime rendering test covers parent vs ephemeral directives. Inline fenced previews remain available.
- New Playwright artifact acceptance covers persisted assistant artifact → isolated preview → local file tab → artifact tab → close and composer focus.
- Release pins and component manifest match pi-agent-desktop 0.7.1 / pi 1.2.0 / pi-web 0.10.0. Drift baseline remains pi-web 6fcd7d4; registered drift counts refreshed without changing policy/dispositions.

## Known pre-existing issues

- Lint baseline: 26 warnings, unchanged from 2026-10-12.
- Production webpack warns about the dynamic import in app/api/sessions/[id]/export/route.ts.
- Local builds are not official signed/notarized releases; updater artifacts were disabled for this local bundle.
- Terminal replay stores raw PTY output rather than serialized screen snapshots. Replaying shell redraws captured at changing widths can garble older output; no TerminalPanel/terminal-manager production code changed in this merge. The acceptance test checks live output across file-tab switches and then fresh output at the restored width across reload. A trial with /bin/sh reproduced the same limitation, so the sandbox shell preference remains unchanged.
- Native launch-at-login and Windows/Linux desktop behavior are not exercised by browser E2E on macOS.

## Verification

- Final TypeScript clean; lint 0 errors / 26 warnings. Full unit suite: 2,962 passed / 0 failed (13 suites, four workers, empty temporary PI_CODING_AGENT_DIR). An unbounded unit run concurrent with production compilation hit an existing 20ms timing assertion in the abort-running-state test and left its mocked prompt pending; standalone recheck passed all 3 cases. Final unit run uses an empty temporary agent directory and four test workers, preserving all suite files.
- Rust cargo test --locked --lib: 7 passed; clippy --all-targets -D warnings clean. Rust sources unchanged by incorporating origin/main.
- Packaged Code mode verifier: bundled Node starts the staged server, sandbox self-test available, Bedrock imports, no module resolution errors. Final .app server contents match the verified staging tree byte-for-byte.
- Desktop frontend production build in .next-desktop completed. Initial Finder AppleScript packaging timed out; CI mode bypassed Finder decoration. The first CI bundle produced app+DMG but stopped at updater signing without a private key. Final local build uses CI=true tauri build --target aarch64-apple-darwin --ci --config '{"bundle":{"createUpdaterArtifacts":false}}' and completed successfully.
- Pi Agent.app and Pi Agent_0.7.1_aarch64.dmg rebuilt after retaining origin/main CSS adaptations. Main executable and bundled Node both Mach-O arm64; Info.plist 0.7.1; bundled manifest pi 1.2.0 / pi-web 0.10.0. hdiutil verify reports VALID.
- New artifact acceptance passed in focused run; terminal/file pagination/reload acceptance passed after making the geometry/replay checkpoint explicit. Artifact fixture was corrected to timestamp_uuid.jsonl, and its sandbox assertion verifies allow-scripts plus absence of allow-same-origin while allowing upstream's forms/popups flags.
- Final full Playwright suite: 41 passed / 0 failed (7.5m, Chromium, 1 worker). The final artifact session-scope guard also passed a dedicated runtime render test; 76 focused message/extraction tests passed.
- Browser visual check after the panel animation: mobile panel x=0/y=0/width=390/height=844 at a 390×844 viewport. Screenshots inspected; the early suite captures show transition frames. No horizontal overflow after settling. The visual-check server was stopped and its generated tsconfig/AGENTS changes discarded.
- Drift against pi-web 6fcd7d4: 3368 cosmetic / 14602 structural, no risk mismatches.
- No conflict markers; globals.css and settings.css match upstream; AGENTS.md dev-server noise restored to upstream source before commit.


## Silent semantic review overlap inventory

- `.github/workflows/ci.yml`
- `AGENTS.md`
- `README.md`
- `README.zh-CN.md`
- `app/native-theme.css`
- `bin/pi-web.js`
- `components/AppShell.right-panel-row.test.mjs`
- `components/AppShell.tsx`
- `components/AppShell.workspace-memory.test.mjs`
- `components/ChatWindow.tsx`
- `components/FileExplorer.tsx`
- `components/MarkdownBody.test.mjs`
- `components/MermaidBlock.tsx`
- `components/MessageView.tsx`
- `components/MobilePwaLayout.test.mjs`
- `components/SessionSidebar.tsx`
- `components/SettingsPanel.tsx`
- `components/TabBar.tsx`
- `components/fork-extractions.test.mjs`
- `components/useAgentSession-session-isolation.test.mjs`
- `docs/web-profile.md`
- `e2e/chat-appearance.mjs`
- `e2e/file-panel.mjs`
- `eslint.config.mjs`
- `hooks/useAgentSession.test.mjs`
- `hooks/useAgentSession.ts`
- `hooks/useKeyboardShortcuts.ts`
- `lib/api-types.ts`
- `lib/branding.test.mjs`
- `lib/browser-open.js`
- `lib/browser-open.test.mjs`
- `lib/i18n/messages/en.ts`
- `lib/i18n/messages/zh-CN.ts`
- `lib/i18n/messages/zh-TW.ts`
- `lib/rpc-manager.ts`
- `next.config.ts`
- `package-lock.json`
- `package.json`
- `scripts/prepare-desktop.mjs`
- `scripts/release-component-pins.json`
- `scripts/web-dev.mjs`

## Incoming commits

```text
e5a55965 chore(homebrew): update cask to 0.7.1
9519ce4c Prepare desktop release 0.7.1
b72fa8ab Revert "fix(desktop): stop the macOS window flickering on move and resize" (#124)
7b9e6535 Merge pull request #126 from abcwyc/claude/preview-polish
3f9130d6 Merge pull request #125 from abcwyc/claude/input-flicker-issue-0ec01b
9e9e3529 Merge pull request #124 from abcwyc/claude/window-flicker-move-resize-949add
f58eb869 fix(previews): localized preview errors, a real Download label, live artifact tab titles, file-tree error retry
30f60649 fix(chat): stop the sent message flashing after send
1ca5667c fix(desktop): stop the macOS window flickering on move and resize
e8f2ac46 Merge pull request #123 from abcwyc/claude/ci-windows-check
6fd88cb8 ci: compile and lint the desktop shell on Windows
ca7738c6 chore(homebrew): update cask to 0.7.0
d1e5b91a Merge pull request #122 from abcwyc/claude/windows-server-fix
33b457b9 fix(desktop): import Command for the Windows server shutdown
ad96ff44 Merge pull request #120 from abcwyc/claude/right-panel-motion
bb993089 release: note the side-panel animation and load fix in 0.7.0
8de3cf04 fix(right-panel): animate open/close, repair the compact drawer, steady the toggle
0d3de19c Merge pull request #119 from abcwyc/claude/project-global-review-e4f27d
0efedd46 Prepare desktop release 0.7.0
10510280 deps: upgrade the bundled pi SDK to 1.2.0
dc1f75d1 chore: drop a stray screenshot and an unused import
b0d9da09 perf: parse only the streaming reply for artifacts; lazy-load terminal and Scheduled
e6e65e7c fix: right-panel and preview interaction issues from the release review
505ccf5b fix: unblock the release (desktop cfg gating, panel close, stale e2e)
167b1b3a style: unify topbar, chat and right panel on one workbench surface
7d3d13e1 style: embed right panel in native shell
7593860e feat: refine artifact previews and native shell structure
2a7b9d28 style(right-panel): give the floating card the same fill as the main window
e363bc8c test: accept the conditional right-panel tab-strip className after merging traffic-light branch
5f5f6b98 Merge branch 'claude/sweet-knuth-891238' into claude/merge-to-main-2abcab
068b6c8b Merge branch 'claude/file-modification-style-bf5576' into claude/merge-to-main-2abcab
caf4035a Merge branch 'claude/traffic-light-alignment-3cf5e6' into claude/merge-to-main-2abcab
e88c4c94 feat(artifacts): fit Mermaid diagrams to the panel width
b116a40e fix(artifacts): show tall Mermaid diagrams in full in the panel
9ecc015e Merge remote-tracking branch 'origin/main' into claude/sweet-knuth-891238
d9548cdc feat: inline HTML/SVG/React previews and artifacts in the side panel
48f1f51a build: bundle the React preview runtime (React, Sucrase, Tailwind)
91dfac84 Merge pull request #117 from abcwyc/claude/right-sidebar-floating-layer-ac9471
4b0c2e14 Merge pull request #116 from abcwyc/claude/file-tab-icon-scaling-3ab0fa
a711f66d feat(ui): right panel as a full-height floating card (Claude Desktop style)
56525a1e fix(files): keep tab-strip chips full size and fade overflowing tabs
87ac4c11 feat(chat): show changed files with line counts under a turn's reply
ee16e813 fix(desktop): keep the macOS traffic lights on the 24pt chrome line
6a0ec8a1 Merge pull request #68 from xuzijian2019/feat/web-profile-launch
3c920595 Merge pull request #104 from xuzijian2019/fix/abcwyc-code-background
54b10274 Merge pull request #105 from xuzijian2019/fix/abcwyc-sidebar-breakpoint
d01d5a82 chore(homebrew): update cask to 0.6.7
45e3457d Prepare desktop release 0.6.7
21d4ba40 fix(settings): keep the e2e reachability check and the Send key row valid after the regroup
cad4caaa fix(markdown): preserve code backgrounds across theme changes
869620e0 fix(shell): restore desktop sidebar state after mobile resizing
22572fb2 feat(web): open the loopback UI in the desktop browser
```
