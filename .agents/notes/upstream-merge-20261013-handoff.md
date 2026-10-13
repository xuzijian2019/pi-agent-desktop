# Upstream merge handoff — 2026-10-13

- Upstream tip: `dcc573ef2b97ec306f0014dd41f3a16da48c52cb` (abcwyc/pi-agent-desktop/main, desktop 0.6.6).
- Fork tip before merge: `02f436f`; merge base / previous upstream tip: `06132389`.
- Backup: `backup/pre-upstream-merge-20261013`.
- Incoming commits (19): `c6028b43` missing plugin translations and static translation-call gate; `e828b493` production mammoth dependency; `745ecb21` desktop 0.6.6; `abb8e648` Homebrew cask; `bc7a225e` Bedrock SDK staging; `9e5fbf52` macOS traffic-light positioning; `9fac1866` opaque extension status; `69b49249` macOS tray removal; `a32090ba` launch at login; `f2e1fdf3`, `2803ba8b`, `dfe93043`, `eda8a9e0`, `15b373d4` General settings regrouping/version card/removal of iOS push UI; `886848a9` packaged Bedrock import verification; integration merges `e82a6bc4`, `dd5c9de2`, `d714f21e`; `dcc573ef` KaTeX 0.19.0 override.
- Textually conflicted files (7): `app/native-theme.css`, `components/SettingsPanel.tsx`, `lib/i18n/messages/en.ts`, `lib/i18n/messages/zh-CN.ts`, `lib/i18n/messages/zh-TW.ts`, `package.json`, `package-lock.json`.
- All eight fork-modified/upstream-touched paths reviewed against the merge base, including clean-merged `components/AppUpdatesSection.tsx`.

## Integrated from upstream

- General settings: Version & Updates plus Language and Chat in the left column; Appearance, desktop preferences and Windows shell selection in the right column. Current/latest version card and consistent group panels replace version/repository chips and loose rows. The iOS push-registration section and its unused locale keys are removed.
- Launch-at-login setting through the Tauri autostart plugin; Rust registration and capability permissions; OS state readback and errors in the desktop-only settings section. Login launches start hidden. macOS uses the Dock/app menu instead of a tray icon; traffic lights align with the 48px top bar.
- Bedrock dependency closure staging preserves nested versions and adds a staged implementation import to `desktop:verify`; release workflow uses this verification. Production mammoth dependency supports packaged document previews.
- Six plugin-panel translations in every locale plus static checks for missing translation keys and interpolation parameters.
- KaTeX 0.19.0, forced across dependents through the npm override. Regenerated lockfile eliminates nested older KaTeX copies from fork-only LobeHub dependencies.
- Desktop 0.6.6; pi 1.1.0 and pi-web 0.10.0 remain bundled.

## Kept from the fork

- Project-tree sidebar, sidebar-left layout, single aligned collapse toggle and opaque hover peek.
- Simplified composer, composer git-branch chip, side/recap, IndexedDB drafts, class-based tabs and Playwright `test:e2e`.
- General's automatic title, browser notification opt-in, per-reply token/cost visibility and diff-mode controls; web/desktop tagline split.
- Browser current version uses `WEB_APP_VERSION`; the clean merge retained this inside the new update card.
- Existing package name/version, fork scripts/dependencies and npm `allowScripts`, alongside the upstream KaTeX override.

## Notable resolutions

- Settings conflict kept the browser notification section in the right column while removing the obsolete iOS push section and duplicate relocated groups. All three locales retain browser notification strings while dropping only upstream's removed push keys.
- Sidebar CSS retains the fork's shared 10px top inset and left/right controls arrangement. Upstream's macOS 10px inset is already satisfied; its outdated right-aligned-row comment and redundant rule were not reintroduced.
- Silent semantic conflict: upstream's opaque `.extension-status-shelf` rule would not fix this fork because it mounts `ExtensionStatusLine` in the composer. Ported `background: var(--bg)` to the mounted `.extension-status-line`; extraction sentinel protects the adaptation.
- Settings sentinel now isolates Chat and Appearance after their cross-column move and verifies one copy of each group, the browser notification opt-in, and absence of removed push controls.
- Removed the `readFile` import left unused by upstream's packaging refactor, preserving the previous lint warning baseline.
- Release pins and component manifest validate (`piPin`, `piWebPin`, `manifest`: all true); no pin change required.
- CSS baseline refreshed against the actual integrated pi-web `6fcd7d4` (resolved `6fcd7d44`); stylesheet hashes unchanged. Drift: 3310 cosmetic / 13930 structural; no risk mismatches. SettingsPanel measured 578 total / 467 structural and remains accepted high risk in the ownership manifest.

## Known pre-existing issues

- Lint baseline: 26 warnings, unchanged after removing upstream's newly unused packaging import.
- Local real session data includes a `/tmp` cwd/root. An unisolated unit run therefore makes the cwd/status authorization test's supposed outside directory authorized. Use an empty `PI_CODING_AGENT_DIR` for reproducible full-suite verification; application authorization was not changed.
- Two stale generated `.next-e2e` validators referred to the deleted `/api/app-update` route and initially prevented typechecking. Removed only those verified generated files; the succeeding typecheck was clean.
- npm install inherits `NODE_ENV=production` in this runtime, so `npm install --include=dev` is necessary to retain development dependencies. Existing React peer-dependency and audit notices remain; no unrelated dependency updates were made.
- This environment has no Cargo installation (`cargo test --locked --lib` exits 127). Rust compilation and packaged OS interactions (autostart, Dock/tray and traffic lights) were not verified locally. The unit suite does validate npm/Rust Tauri version alignment and packaging contracts.

## Verification

- TypeScript: `node_modules/.bin/tsc --noEmit` clean after clearing the two stale generated validators.
- Lint: 0 errors / 26 warnings (previous handoff: 26).
- Unit tests: 2872 passed / 0 failed with an empty temporary `PI_CODING_AGENT_DIR`. Initial unisolated run: 2871 passed / 1 environment-dependent failure described above.
- Browser preflight: port 30142 available; `npx playwright install chromium` successful. Inherited `__NEXT_PRIVATE_STANDALONE_CONFIG` and `__NEXT_PRIVATE_ORIGIN` removed; `NODE_ENV=development` for the isolated `.next-e2e` server.
- Full Playwright suite: 40 passed / 0 failed (5.9m), first run, Chromium, 1 worker.
- Rust: unavailable, as described above. No Next production build run in this checkout.
- Diff whitespace checks clean; no unresolved index paths or remaining conflict markers in merge changes. No generated AGENTS.md, tsconfig.json or next-env.d.ts changes.
