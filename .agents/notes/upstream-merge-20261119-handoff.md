# Desktop upstream sync — 2026-11-19

## Inputs and isolation
- Fork main: fc4f23f224ca263d167996d56bbeeaee3fe6c43a; desktop upstream: 30d039382c64267e94e3bade39b34a0d10d870d2.
- Fresh isolated dot-cloud checkout, timestamp/SHA branch and pre-merge backup; no open sync PR or concurrent sync at preflight. No saved coding environment or user computer used.
- 29 upstream commits; `git merge --no-ff --no-commit` retains both parents. Five textual conflicts: native-theme.css, ChatInput.tsx, option-controls fixture/script, package.json.

## Integrated and reviewed
- Desktop 0.8.7 metadata/icons; image-bearing composer history with complete ordered-image deduplication and restoration; long pasted text attachments with preview/insertion and literal command admission.
- Plugin discovery marketplace; custom provider display name vs immutable ID; llama.cpp router provider; reasoning levels/input modalities; Test model runtime alignment; trust-aware model settings and BOM/empty configuration handling; resilient auth SSE lifecycle.
- All overlapping fork files reviewed, including clean merges in ChatWindow/useAgentSession/rpc-manager/locales. Retained upstream-aligned composer appearance and fork IndexedDB drafts, conflict/version/session guards, references, queue restoration, native clipboard fallback, strict Chat workspace policy and MCP lifecycle.
- Smaller legacy token pastes and saved token drafts remain compatible; legacy token plus shell prefix is rejected without losing the draft. Compact composer keeps ordinary paste. Modern text attachments follow model-input admission even with ! or / prefixes.
- Fixed a silent semantic conflict: file-bearing legacy steer/follow_up commands normalize before acquiring the fork checkout lock, avoiding recursive acquisition deadlock. Literal file prompts still wait for normal MCP preparation. llama.cpp provider factory is available in isolated Chat runtime without enabling arbitrary extension discovery.
- Shared history restore now protects hydrated draft identity, pending images, existing chips and deferred focus. Full image bytes distinguish history items.

## Bookkeeping and boundaries
- Dependencies/package-lock unchanged; release pins and manifest match desktop 0.8.7 / pi 1.5.2 / pi-web 0.15.0. Release workflow remains manual-only; upstream macOS filename patterns retained without changing release policy.
- globals.css/settings CSS match upstream byte-for-byte; baseline advanced to 30d03938. Fork CSS remains native-theme.css, including both fork rules and plugin discovery UI.
- Fresh pi-web/main d40a8dd33b3b0df0d347c7916b6225cb0d0bf828 is drift-only context; integrated baseline remains f130910abf662b506b2ef2f475fc21a2fe57badc. Measured drift: 3800 cosmetic / 25939 structural (87% structural); ownership measurements refreshed, review policy unchanged.
- No native binary, Mac/Tauri/AppKit, signing, packaging or offensive-security validation. Existing Rust CI remains unchanged and is not packaged-runtime acceptance.
- Draft PR only; no main push/merge, auto-merge, squash, rebase, force push, tag or release. PR52's prior approval does not authorize this PR.

## Validation
- Fresh npm ci; isolated HOME/USERPROFILE/agent data and cleared inherited offline/state/Next environment.
- Composer focused tests: 85 passed; backend attachment/provider focused tests: 111 passed, plus isolated Chat provider regression; CSS/menu/release focused tests: 32 passed. Scoped ESLint clean; final TypeScript clean.
- Added four CI browser cases: real component plugin-discovery and long-paste/history fixtures; actual app model ID/display name and llama.cpp router at desktop light/narrow dark widths. Existing legacy-token app test retains complete payload checks below new 2000-character threshold.
- Existing option-controls Playwright skip remains: its separate-tool/thinking-menu locators predate the combined upstream run menu; structured history fixture itself updated, and new real-component fixture covers image and image-only restoration. No skipped browser test is counted as passed.
- Local Chromium fails socket initialization under current sandbox; no local browser pass or screenshot inspection claimed. Existing two-shard CI must reach terminal success for exact published SHA, with actual screenshots inspected. Final aggregate/remote evidence belongs in draft PR body.
- First full run: 4546 passed / 1 failed / 4 skipped. Abort/running-state fixture raced asynchronous checkout admission using a fixed 20 ms sleep. It now observes actual SDK prompt entry, preserving every running/abort/final-SSE assertion and failing on admission errors; no product logic or test expectation relaxed. Focused rerun: 3/3 passed. Full rerun follows.
- Aggregate lint: 0 errors / 21 pre-existing warnings, unchanged from November 18.
- Final full unit rerun: 4551 total, 4547 passed, 0 failed, 4 environment/platform skips. TypeScript and lint remain successful; the only later executable change is the focused-linted running-state fixture. Four parallel focused reruns also pass (12/12).

## First published CI and browser follow-up
- Head 4262aaecb61cf9d60805cf7bc690240a3119cf1f, synthetic merge faa1e99947f3bb78ee0fd878816798d3b133fddb, run 44534016188: nine jobs succeeded, E2E shard 2 failed one newly added fixture. Unit CI confirms 4547 pass / 0 fail / 4 skip. E2E totals: 101 pass, 1 failure, 1 pre-existing skip.
- Long-paste fixture put the composer near the page top, unlike ChatWindow's bottom overlay, so its upward history menu could not be clicked in the viewport. Fixture now reproduces bottom placement without modifying product CSS; asserts full menu bounds, preserves real clicks and captures menu screenshots. Two valid, distinct PNG fixtures now also verify decoded image identity after clearing and restoring history. No force-click, timeout increase, skipped check or weakened assertion.
- Opened actual first-run screenshots for long-paste at 1200 light/320 dark, plugin discovery at 390 light/1280 dark, model custom ID/name at 390 dark and llama.cpp at 1280 light. Attachment actions fit and text is readable; settings maintain their responsive layout. Final-head CI and screenshots remain required.
