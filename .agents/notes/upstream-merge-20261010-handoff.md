# Upstream merge handoff — 2026-10-10

- Upstream tip: `1cabde80` (abcwyc/pi-agent-desktop/main, desktop 0.6.4).
- Fork tip before merge: `add1370e09eb790932c5787ea1e1eb035abd437a`; merge base / previous upstream tip: `f59e0b18ed25d4c686bf10778983ea617dc24561`.
- Backup: `backup/pre-upstream-merge-20261010`.
- Incoming commits (7): `6f5be008` Rust-built popup menus/test build; `d12b0aa1` manual desktop test-build workflow; `ebf734c6` macOS test cfg repair; `ae5e5e5a` integration merge; `a85b7e62` native popups on by default; `43da101f` desktop 0.6.4 release preparation; `1cabde80` light/dark WebP README screenshots.
- Textually conflicted files: none. Semantic overlap review: AGENTS.md, README.md, README.zh-CN.md, components/AppShell.tsx; also inspected menu callers and native implementation across files.

## Integrated from upstream

- Native popups are built and shown in Rust through `show_popup_menu`, using plain-data specs and returning the selected action id after closing. No JS menu-resource/click-channel ownership or webview resource-table lock during popup.
- Native menus enabled by default; build-time `NEXT_PUBLIC_NATIVE_POPUP_MENUS=0` retains DOM-only operation. Settings adopts native section selection with project-required entries disabled appropriately.
- File menu falls back to the shared in-app host on native failure. Popup lifecycle diagnostics go to bounded desktop.log.
- Manual three-platform test installer workflow produces artifacts without publishing a release or updater manifest.
- Desktop release 0.6.4 metadata, Rust version/lockfile, permissions/capabilities and README screenshots. Pi remains 1.1.0 and pi-web remains 0.10.0; no npm dependency changes or lockfile regeneration needed.

## Kept from the fork

- Project-tree sidebar and sidebar-left layout, simplified composer, composer branch chip, side chat/recap, IndexedDB drafts, class-based TabBar, overlay composer and Playwright test:e2e.
- Declined topbar History/More/session stats and ChatMinimap remain absent. Native Settings is integrated in the existing sidebar button, not a resurrected upstream topbar.
- Existing General updates UI and shared DOM file-menu host remain intact.

## Notable resolutions

- Clean textual merge concealed missing AppShell imports: the fork had removed `canUseNativeMenu`, `showNativeMenu`, and `menuPointBelow` along with the upstream More menu. Restored the imports for upstream's new Settings handler; initial typecheck caught the missing symbols.
- Enabling native popups exposed the fork project menu's ignored `false` result. Added DOM fallback while preserving fork project actions and placement.
- Added two fork-extraction sentinels covering Settings imports/project gating/DOM fallback and project action fallback.
- Release component pins and bundled manifest validate unchanged (all true). Drift measured against actual integrated pi-web `6fcd7d4`; refreshed AppShell 2481 total / 1979 structural and SessionSidebar 2973 total / 2251 structural. Both remain accepted high risk; no risk mismatches.

## Known pre-existing issues / limitations

- Lint baseline is 26 warnings; no broad lint cleanup attempted.
- Browser tests and macOS Rust validation do not exercise packaged native popup GUI interactions, nor constitute Linux/Windows validation.

## Verification

- Initial repaired-patch gate: tsc clean; lint 0 errors / 26 warnings; unit 2849 passed (before final project-fallback sentinel).
- Rust: `cargo test --locked --manifest-path src-tauri/Cargo.toml --lib`: 5 passed / 0 failed on macOS.
- Clippy: `cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`: clean.
- Release pins/manifest: all true (desktop 0.6.4, pi 1.1.0, pi-web 0.10.0).
- E2E preflight: 30142 free; `npx playwright install chromium` successful. Dev environment variables cleared only for isolated test run; no production build.
- Final ordered gates: TypeScript clean; lint 0 errors / 26 warnings (unchanged from previous handoff); unit 2,850 passed / 0 failed, including both merge sentinels.
- Full Playwright suite: 40 passed / 0 failed (5.2m), first run. Desktop workbench and phone composer screenshots inspected.
- Ownership bookkeeping tests rechecked after measurements: 11 passed / 0 failed.
- No Next-generated AGENTS.md working-tree noise appeared; staged upstream documentation addition preserved.
- Whitespace check clean; no conflict markers.

No push performed. Ask before pushing.
