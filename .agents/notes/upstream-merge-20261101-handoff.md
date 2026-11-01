# Desktop upstream merge - 2026-11-01

## Inputs

- Fork tip: `28f0d7eb1f71994161467615f1b5f7999036d5d2`; desktop upstream `140b454590a85714db2fe07751faa6cba550c9ec` (0.8.0); merge base `e09301162da6e641677f233d9b2da6ac52dbed33`. Unique branch `merge/upstream-20261101-1342-140b4545`; local backup `backup/pre-upstream-20261101-1342-28f0d7eb`.
- The integrated pi-web base remains `6fcd7d44981ab51a21d6cd6eb06d361d0e3d3068` (0.10.0), the merge-base with freshly fetched pi-web `d128bae47cd3abbdfe7135443ac793f547c14e47`; no independent pi-web merge.
- Conflicts: native-theme, AppShell, ChatAccessRows, ChatInput, ChatWindow, ComposerProjectChip, ContextUsageRing, DirectoryPicker, FileViewer, MessageView, ProjectPicker, SessionMentionMenu, SessionSidebar, artifact helpers test, useAgentSession test, locale patches; plus modify/delete BrowserPanel, DiffPanel and SessionStatsPanel.

## Integrated from upstream

Artifacts outputs/process filtering, favorites, context menus, resizable list, credential exclusion and missing-file explanations; localized tool preset labels, locale-aware timestamps, UI token/focus refinements, Chats-fold hydration fix and 0.8.0 metadata. Desktop upstream did not change npm dependencies; lockfile remained unchanged. Pi is 1.4.0 and pi-web 0.10.0.

## Kept from the fork

Project-tree sidebar and disambiguated project labels, full-height layout, simplified composer and overlay, single-send/draft guards, usage preference and full visible token/cost detail, security boundaries, recap, menu surfaces and extracted components. Declined Browser/Diff/Stats panel structures remain deleted; the fork's new-task guide remains instead of a second welcome screen.

## Notable resolutions

- Adopted the hydration-safe Chats preference store with an in-memory fallback when localStorage writes fail, preserving interactivity; added a regression. Kept the project's duplicate-basename disambiguation on narrow screens instead of upstream's basename-only split.
- Preserved cancellation/generation guards and both sides' artifact tests; audited file-role/favorite endpoints and credential filtering. Carried the session ID through missing-file existence probes. Retained fork's explicit usage details on touch devices.
- Reconciled the new upstream inline-style guard with *existing* fork literals: each raised per-file count was compared against fork HEAD and is no greater than its pre-merge count. The baseline records current counts and continues to reject increases; no assertions were removed. CSS baseline is desktop upstream `140b4545`; actual pi-web drift measured at `6fcd7d4`, nine manifest counts refreshed without risk-class change. Release pins and component manifest match.
- Independent component and artifact/security review found no other serious merge-introduced issue. The full source test run initially exposed three stale literal/class-token assertions and one inherited XDG_STATE_HOME contamination in the test environment; the assertions retain their behavioral checks, and subsequent test runs unset XDG_STATE_HOME.

## Verification and limits

- TypeScript passed; lint passed with 0 errors and 21 warnings, matching the prior baseline. Focused sidebar 65, composer 110, shell/file/message 61, artifacts 27 and generic components 100 tests passed. Full suite and exact-head CI results are recorded in the PR.
- The isolated `npm run web` dev server started successfully. Cloud Chromium could not launch because its socket syscall returned `Operation not permitted`; CUA is in a separate network namespace. No screenshot or UI interaction is claimed from this local attempt. CI screenshots must be actually inspected, with remaining gaps documented in the PR.
- No Mac native app, production runtime package, signed/unsigned bundle or installer acceptance was performed; CI Rust placeholder resources are not packaged-runtime evidence. No SDK bump or staging rebuild was needed. Merge remains a draft PR and requires the user's specific authorization before main is merged.
- Security audit is advisory, not clean: CI's `npm audit --omit=dev --audit-level=high` exited 1 although its job concludes success via `continue-on-error`. It reported Next.js 16.3.8 advisories GHSA-2464-fhr4-w9xw, GHSA-p3m5-59mp-jv5r and GHSA-673q-mjm6-r5xr (including critical/high), zod 4.3.6 GHSA-mrhx-c7xc-m3w5, and transitive minimatch GHSA-g3hv-75wg-m249. `package.json` and `package-lock.json` are byte-identical to fork tip `28f0d7eb`; these findings were not introduced by this merge. `sharp` is 0.35.5, images are unoptimized, and a bounded source search found no `use server` or `use cache` directives, but exploitability and packaged behavior were not fully assessed. Do not mistake those observations for a security clearance; assess dependency upgrades separately.
- The initial CI Playwright run reached 67 passed, one skipped, one failed on the old `full` label. The follow-up test-only commit checks the localized `All tools`/`Settings default` labels and selected menu state; the replacement head's CI and screenshots still determine the final verdict.
