# Desktop upstream merge — 2026-10-26

## Pinned inputs and scope
- Fork main: `fcfc2cdb29acc2033b0dc80c3e341a0fe3b9a339`.
- Desktop upstream: `56691c5a47189e2b803194e1755f345227b130eb` (0.7.7), 24 incoming commits from merge base `845a7ec1fd535a6f33bb2c4ecf4cf80508ac23e9`.
- Actual integrated pi-web baseline: `6fcd7d44981ab51a21d6cd6eb06d361d0e3d3068` (0.10.0). Latest `agegr/pi-web/main` `e533d9b3975f8a74b378d5007c92fdf4d15d3fba` fetched for drift only, not merged.
- Clean clone in dot's own cloud environment, native subagents; no saved coding environment or Mac task. Local backup `backup/pre-upstream-20261026-1249-fcfc2cdb`.
- Dedicated sync branch `merge/upstream-20261026-1249-56691c5a`. True `merge --no-ff --no-commit`, first parent fork and second parent desktop upstream. No main push/auto-merge/rebase/squash/release/tag authorized.
- Open fork PR list was empty at preflight. Existing completed logging task was not restarted.

## Integrated from upstream
Appearance/background/font controls and settings layout, responsive conversation navigation, chat-owned generated-file browsing, conservative readable Write rendering, startup failure diagnostics, 0.7.7 metadata, E2E home/environment isolation, and opt-in verbose web logs. App notice snapshot, logging and previous fork contributions are retained without duplicating implementations.

## Kept from the fork
Project tree/full-height file panel and toolbar, AppSelect/menu primitives, simplified composer and attachment geometry, recap (no side chat), IndexedDB drafts/session race guards, tail-follow and scroll restoration, custom radius tokens, browser notifications/auto-title, class-based TabBar, and the primary Playwright suite. pi/SDK stays 1.4.0; pi-web stays 0.10.0; no package-lock regeneration required. No dependency or unrelated CI changes.

## Notable resolutions and semantic review
Eleven textual conflicts: `app/native-theme.css`, `components/AppShell.chat-workspace.test.mjs`, `components/AppShell.tsx`, `components/ChatWindow.tsx`, `components/FileTreeResizer.test.mjs`, `components/SettingsPanel.test.mjs`, `components/SettingsPanel.tsx`, `e2e/composer-geometry.mjs`, `lib/i18n/locale-plugins.ts`, `package.json`, `scripts/fork-ownership.json`.

- Appearance moved out of General; retained General's desktop initialization (otherwise a clean-merge runtime crash), notification/auto-title controls, existing AppSelect, and fork geometry. Excluded obsolete queue and first-line attachment styling rather than resurrecting declined UI. Three-language keys retained and tested.
- Chat-owned folders can browse/open files, but old/root chats cannot; guarded opener checks server-classified chat folder, `isPathInside` and session provenance. Terminal/mentions/project switching remain disabled for chats. Missing-cwd guard retained. Old tests prohibiting all chat files were updated to assert the new scoped behavior, not dropped.
- Navigator uses actual content width and is hidden while the panel opens; clean FileViewer merge reviewed with tab restoration/closing behavior.
- Auto-merged MessageView's highlighted branch bypassed upstream rejection of ambiguous/extra/partial Write args. Gate it through the conservative validator. Preserve fork path/filePath highlighting and line numbers; snake-case plaintext still works. Keep original fallback assertions and add extra aliases/modes/long paths/streaming and actual token rendering regressions.
- Appearance/font routes preserve unrelated settings and authenticated desktop enumeration. Fixed execFile commands, bounded timeout/output and font normalization reviewed. Rust startup timeout/error changes source-reviewed only.
- Upstream release workflow difference is release-note text only; no unrelated CI/release modifications. Cargo/package/component manifest align at desktop0.7.7; release pins valid.
- globals.css/settings.css remain byte-identical to desktop upstream; CSS baseline refreshed to56691c5a. Ownership paths merged additively, all measured shared-file drift/risk numbers refreshed against actual6fcd7d4, thresholds unchanged.

## Verification
- Fresh isolated-HOME npm ci succeeded. TypeScript `tsc --noEmit` passed. Lint passed:0 errors/21 warnings, unchanged count from previous handoff.
- First full unit run3314/3315; only stale all-chat-files-disabled assertion failed. Replaced with stronger scoped/provenance checks; focused11/11 pass. Final full rerun3315/3315 passed, zero failures/skips.
- Focused new/existing appearance/font/API/CSS/i18n checks87 passed; MessageView37 passed; chat structural checks20 passed; environment/logging/theme preflight22 passed (overlap not added into a misleading unique total).
- Actual `npm run web -- --no-open -p30427` using isolated HOME/agent/config/cache/dist started and returned HTTP200 for `/` and `/api/appearance`. This is a dev-server HTTP smoke, NOT production-packaged runtime acceptance. Generated tsconfig paths were removed from changes.
- Local Chromium preflight blocked by socket EPERM. No bypass and no claim of local pixel validation. Added8 real-data Playwright cases for appearance and scoped chat files across1280/390 light/dark, long content/fonts, persistence/reset/navigation and screenshots. Exact-head GitHub CI and real artifact pixel inspection remain required; PR stays draft until evidence is reviewed.
- Latest CI covers TS/lint/unit, full Playwright, Linux/Windows Rust. Do not duplicate full Rust/Playwright locally. Queued/skipped/no-check is not success.

## Known pre-existing issues and unverified boundaries
21 lint warnings; npm peer/deprecation warnings unchanged. Existing advisory dependency audit does not imply zero vulnerabilities. No Mac binary rebuild, native/Tauri/AppKit/OS font/dialog/signing/packaged-runtime acceptance is performed under the user's2026-10-20 boundary. Rust CI placeholder resources are not packaged-runtime evidence. Main integration requires separate explicit approval for this PR.

## Reviewed changed paths
All incoming paths and fork overlap were distributed across appearance/chat/runtime reviewers; merge owner reviewed resulting changes and cross-file contracts. The list below records final changed tracked paths (test and bookkeeping additions included):

- `.github/workflows/release.yml`
- `Casks/pi-agent.rb`
- `app/api/appearance/fonts/route.test.mjs`
- `app/api/appearance/fonts/route.ts`
- `app/api/appearance/route.test.mjs`
- `app/api/appearance/route.ts`
- `app/api/desktop/fonts/route.test.mjs`
- `app/api/desktop/fonts/route.ts`
- `app/layout.tsx`
- `app/native-theme.css`
- `components/AppShell-session-reset.test.mjs`
- `components/AppShell.chat-workspace.test.mjs`
- `components/AppShell.tsx`
- `components/AppearanceSettings.tsx`
- `components/ChatWindow.chat-folder-files.test.mjs`
- `components/ChatWindow.tsx`
- `components/ConversationNavigator.tsx`
- `components/FileTreeResizer.test.mjs`
- `components/FileViewer.tsx`
- `components/FontSettings.tsx`
- `components/MessageView.test.mjs`
- `components/MessageView.tsx`
- `components/ModelsConfig.tsx`
- `components/SettingsPanel.test.mjs`
- `components/SettingsPanel.tsx`
- `components/TerminalPanel.tsx`
- `components/desktop/DesktopAppSection.tsx`
- `docs/agents/fork-chat-workspace.md`
- `docs/agents/fork-ui.md`
- `docs/native-theme.md`
- `docs/native-theme.zh-CN.md`
- `docs/ui-menu-audit.md`
- `e2e/README.md`
- `e2e/appearance.fixture.jsx`
- `e2e/appearance.mjs`
- `e2e/composer-geometry.mjs`
- `e2e/conversation-navigator.fixture.tsx`
- `e2e/conversation-navigator.mjs`
- `e2e/file-panel.mjs`
- `e2e/fonts.mjs`
- `e2e/run.mjs`
- `e2e/settings-controls.fixture.jsx`
- `e2e/settings-controls.mjs`
- `e2e/themes.mjs`
- `hooks/useBackground.ts`
- `hooks/useFonts.ts`
- `lib/app-prefs.ts`
- `lib/background-settings.ts`
- `lib/backgrounds.ts`
- `lib/desktop-api-contract.test.mjs`
- `lib/desktop-native.ts`
- `lib/file-links.ts`
- `lib/font-preferences.test.mjs`
- `lib/font-preferences.ts`
- `lib/font-settings.ts`
- `lib/i18n/locale-plugins.ts`
- `lib/installed-fonts.test.mjs`
- `lib/installed-fonts.ts`
- `lib/settings-navigation.test.mjs`
- `lib/settings-navigation.ts`
- `lib/system-fonts.ts`
- `lib/theme.test.mjs`
- `lib/theme.ts`
- `package.json`
- `public/THIRD_PARTY_NOTICES.txt`
- `scripts/e2e-server-env.mjs`
- `scripts/e2e-server-env.test.mjs`
- `scripts/fork-ownership.json`
- `scripts/upstream-css-baseline.json`
- `src-tauri/Cargo.lock`
- `src-tauri/Cargo.toml`
- `src-tauri/pi-agent-desktop-package.json`
- `src-tauri/resources/component-versions.json`
- `src-tauri/src/lib.rs`
- `tests/e2e/upstream-076-chats.spec.ts`
- `tests/e2e/upstream-appearance.local.spec.ts`
- `tests/e2e/upstream-chat-files.local.spec.ts`

## First published CI and browser evidence (2026-10-26)
- Draft PR: https://github.com/xuzijian2019/pi-agent-desktop/pull/44 . Published true merge head `eee65779c7f7fe6df041e9c0a9c6d6ed69d56f0f` has exact tested tree `5917659e61a323032da528498daf1de05f96ac7e`; connector authorship changes the commit SHA from the local merge, not its tree/parents.
- GitHub run40334125553 checked head above / synthetic merge6304b1a4. checks, Linux+Windows Rust, advisory audit and demo-drift succeeded. E2E was62 passed /2 failed /1 pre-existing skip, NOT an all-green run. Both new appearance and chat-files four-case matrices passed.
- Failures exposed old fixture assumptions: navigator expected visible with insufficient new responsive gutter; upstream geometry helper incorrectly assumed the attachment button lives inside the input card, while the fork intentionally places it in the toolbar below. Compatibility corrections retain functional navigation/preview and geometry assertions; no timeout increase or skip is introduced. Latest PR status and CI artifacts are authoritative for their rerun.
- Real artifact12656139931 downloaded and inspected. All four chat-file screenshots viewed at1280/390 light/dark: readable contrast, panel/header within viewport, long content wraps, desktop draft/composer retained. Two existing desktop-long-dark/mobile-light composer screenshots inspected: simplified toolbar/attachment placement and input geometry intact. Dev-only Next indicator is visible; not a packaged-runtime artifact.
- User explicitly authorized merging PR44 at2026-10-26 13:59:41UTC, contingent on completing CI/web verification; no additional approval needed for this PR. No merge occurred while checks were failing/pending.
- All8 appearance screenshots and2 related Settings screenshots actually viewed: desktop/narrow light/dark, long-family ellipsis and wrapping intact; no horizontal clipping/unusable controls. Desktop shots are scrolled and crop part of the color-mode group, which is fully visible in narrow shots. Additional4 composer screenshots reviewed (long desktop and empty narrow in both themes), no overlap or overflow.

## Second CI follow-up
Run40337745231 on9d97d7db again passed checks/Rust/advisories; E2E62 pass/2 fail/1 prior skip. Responsive navigator fix passed. Two further precise corrections:
- New upstream placeholder selector targeted `.chat-input-textarea`, not fork `.composer-textarea`; fixed actual textarea placeholder to share dynamic `--composer-line-height` (including mobile font clamp). Added source regression; browser geometry assertion remains unchanged.
- Slash fixture trace proved `/session` was entered while `/name`'s awaited session reload still held `aria-busy=true`: title update completed before loadSession, no get_session_stats POST was sent, and input retained `/session`. Command helper now waits for actual ready state before dispatch, without extra delay/retry/timeouts or removing stats/fork/export assertions. This is deterministic synchronization, not classifying an unexplained failure as flaky.
Latest CI on the follow-up head remains the final gate; no failing/pending run is treated as pass.

- Full local unit rerun after placeholder fix:3316/3316 passed, zero failures/skips; changed tests lint/syntax clean.
