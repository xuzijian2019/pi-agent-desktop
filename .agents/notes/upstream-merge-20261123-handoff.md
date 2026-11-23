# Desktop upstream sync — 2026-11-23

## Inputs and conflicts
- Fork main c59129d56a0af79339c1d64928a101e6ff2397f4; pinned desktop upstream 79d74598d0108d188993b2b0e43f6d8ff6b4201d; common desktop baseline 211bd1e997684d63e89a5ff694b4bef36883c66e. Seventeen incoming commits; exact upstream #258 main CI 45174285670 completed successfully, separate from fork CI.
- Isolated dot cloud checkout, unique branch and backup; no parallel sync or open fork PR at preflight. The two-parent merge is not a fast-forward, rebase or squash.
- Reviewed 20 overlap paths (including clean semantic overlaps). Nine textual conflicts in ChatWindow, MessageView and its test, SettingsPanel and its test, useAgentSession, app-prefs, html-preview tests, and package-lock.

## Integrated and kept
- #256: folded runs of tool-only steps, actual summed step timing, live final step visible, streamed argument rows, shared intermediate-thinking preference, chart blocks with exact hover values, distinct render-input repair vs renderer-loading Retry, and finished-blank vs streaming preview behavior.
- Folded groups are integrated into the fork's memoized transcript, not a duplicate upstream inline tree. Preserve revealed search and per-session scroll targets, final text, write syntax highlighting, composer draft/send/recovery, selection/diff/usage controls and request guards. Settings keeps its eight existing chat options plus the new shared process-thinking preference.
- #258: updater cache compares against the running app version, rechecks stale/upstream-older data, serializes forced refresh behind cached-background work, and distinguishes failure from up-to-date. Refreshed the three reminder captions for the one-day background cache. Mock-only validation; did not contact release servers, download or install.
- Historical active HTML/SVG/React stays source-first and requires explicit Preview. Blank and renderer-error changes preserve the fork's scoped draft prompt and iframe behavior. Tiny finite values in hover tooltips no longer round to zero.
- #259 ancestry, helper and tests kept; the unsolicited post-task star overlay is not mounted in the fork (no production AppShell hook/import, no automatic open or starring). Existing product branding and upstream releases source unchanged.

## Dependencies and ownership
- Preserve fork Next and eslint-config-next 16.4.5; add only diagrammatic 0.0.4 to the verified npm lock, keeping existing Tauri pairing. Fresh lock regeneration and npm ci completed; Cargo.lock and CI/release workflow byte-wise unchanged.
- Desktop 0.8.7 / pi 1.5.2 / pi-web 0.15.0 manifest and pins agree. globals/settings CSS unchanged from upstream; baseline stamp advanced to 79d74598; fork styling remains in native-theme.css.
- Latest agegr/pi-web 432366bd510c72ce7b678a6cb1220f9cac1ed56c is drift context only. Actual integrated baseline f130910abf662b506b2ef2f475fc21a2fe57badc; 3795 cosmetic / 26420 structural (87%), refreshed measured overlap entries without changing ownership policy.

## Verification and limits
- Focused offline gates: transcript 152 pass (56 retested after final guard), chart/preview 74 pass, updater 11 pass, settings/theme/menu/release 57 pass. TypeScript/lint/unit and browser CI tracked separately.
- Eight added Playwright cases: tool groups/shared preference and updater failure/recovery at 1280 light and 390 dark, narrow CJK/exact chart tooltip, Mermaid parse/Retry, blank vs streaming, and historical active previews. Synthetic/recorded inputs and mocked endpoints only, no live providers. Local browser cannot create required Unix socket; final SHA actual CI and screenshot pixel review recorded in PR.
- No native/Tauri/AppKit, signing, or packaged-runtime verification. Existing CI shell/payload checks are not native product acceptance. No push to main, auto-merge, rebase, squash, force, release or tag. A separate explicit approval is required to merge this draft PR.
- Final local TypeScript clean; lint 0 errors / 21 existing warnings; 4625 unit pass / 0 fail / 6 environment/platform skips (4631 total). Isolated npm run web served the app index HTTP 200. All eight new browser tests enumerate; CI performs browser interactions and collects screenshots.
