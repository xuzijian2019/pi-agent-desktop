# Desktop upstream merge - 2026-10-31

## Inputs

- Fork tip: `6310e82b` on `main`; clean before merge.
- Desktop upstream: `e09301162da6e641677f233d9b2da6ac52dbed33` (0.7.10), 34 incoming commits; merge base `202697d427aa8fe65ee778fb1ee463ac482ca8ee`.
- Integrated pi-web baseline remains `6fcd7d44981ab51a21d6cd6eb06d361d0e3d3068` (0.10.0). Both upstream remotes fetched; latest pi-web was not merged independently.
- Backup: `backup/pre-upstream-merge-20261031`. Two-parent merge with fork first and desktop upstream second; no rebase or push.
- Conflicts: `.github/workflows/release.yml`, `app/native-theme.css`, `components/AppShell.tsx`, `components/AppShell.workspace-memory.test.mjs`, `components/ChatAccessRows.test.mjs`, `components/ChatInput.tsx`, `components/ChatWindow.tsx`, `components/SessionSidebar.tsx`, `e2e/option-controls.mjs`, `hooks/useAgentSession.ts`.

## Integrated from upstream

Cross-session Artifacts page with search, persisted index, thumbnail images, written/edited file outputs and missing-file snapshots; shared artifact viewer; faster cold session switching and stale model-cache refresh; image metadata display cleanup and history-edit admission; explicit draft clearing; direct chat permission toggles and in-conversation shell-access prompt; chat file cards; neutral file/code surfaces and shared-star hover; sidebar window dragging; Windows single instance, cache preservation and WebView2 recovery; startup timing diagnostics; desktop 0.7.10 release metadata. Pi remains 1.4.0 and pi-web 0.10.0. No npm dependency change or lockfile regeneration.

## Kept from the fork

Project-tree sidebar, full-height workspace layout, class-based tabs, simplified composer and contiguous menu rows, IndexedDB drafts and attachment aliases, recap, single composer/send path, session request-generation guards, missing-folder defenses, per-chat file/security scope, shared AppSelect/menu surfaces, desktop locale/settings wiring and Playwright as the primary E2E suite. No sidebar explorer, windowed list, minimap, duplicate topbar menu or new-session branding restored.

## Notable resolutions

- Generalized the existing Scheduled page to one Scheduled/Artifacts workspace view without remounting the hidden conversation. Native history and popstate reconcile both pages; delayed workspace restores cannot steal a direct page URL. Artifact conversation jumps retain the version entry id through both catalogue and fetched session routes.
- Reused one honest boolean open-session callback instead of a duplicate fetch wrapper. Navigation generations prevent delayed artifact opens/forks from navigating or auto-sending after the user leaves. Artifact body responses and missing-file snapshots reject canceled or mismatched results.
- Kept retry loading, streaming seed, promotion-skip and all monotonic hook guards while applying upstream bounded model-after-session loading. Explicit draft clearing also retires prepared send/queue work and late attachment reads; text-file reads follow per-draft clear stamps and aliases so clearing another chat does not discard the original chat's import. Shell continuation requires the same session generation, including A -> B -> A switches. Independent review found history-edit continuation could branch from the pending edit; the prompt is now hidden during edits and the callback checks current edit state both before and after unlocking, with executable regressions.
- Kept richer fork permission descriptions in all three locales: named external-file read-only exceptions and account/MCP boundaries remain visible. Adopted removed confirmation controls and new shell/Artifacts labels. New shell prompt uses accent-contrast and shared geometry, touch targets and keyboard focus; upstream white-on-white dark-theme action was corrected.
- Reviewed all 21 fork-modified/upstream-touched files for silent semantic conflicts. Extended executable workspace/async tests and extraction/declined-UI sentinels rather than dropping behavior assertions. Updated obsolete VM mocks and browser confirmation expectations to the new equivalent behavior.
- CSS baseline updated to `e0930116`; drift measured against actual integrated pi-web baseline. Updated nine recorded drift counts, with no risk-class mismatch. Release pins and component manifest all match; existing pin reasons remain valid.

## Known pre-existing issues / limits

- Lint baseline is 21 warnings (same as 2026-10-29).
- `SessionSearch` already exists in fork tip `6310e82b`, despite the older standing-doc declined-UI wording; not introduced or removed by this merge.
- The unchanged `useChatAccess` hook can apply a stale POST response to current client state after a session switch. New automatic shell continuation is generation-guarded; server permissions remain session-scoped.
- Cargo and GTK/WebKit development packages are unavailable on this host. Native Rust compilation and packaged Windows/macOS recovery/single-instance/cache acceptance are not claimed. No SDK bump, so no staged-runtime rebuild was required; no Next production build was run.

## Verification

- Final TypeScript passed; lint passed with 0 errors and 21 warnings, matching the previous handoff. Full unit suite passed: 3,418 tests (post-review rerun).
- Final full Playwright rerun passed: 68 tests, one pre-existing option-controls fixture skipped. Standalone option-controls passed in both themes at 1280/390/320px, including star hover and shell-prompt contrast/geometry; image-display/edit replay passed. Desktop/narrow Artifacts and missing-file snapshots were exercised and screenshots inspected.
- CSS baseline, menu consistency, fork extraction/declined-UI guards, release workflow/dependency pairing and explicit-baseline drift passed. Release pins and component manifest all match. No conflict markers or whitespace errors remain.
- Independent read-only review covered native recovery/cache/single-instance, artifact API/index/sandbox and fork adapters. Its one history-edit shell-continuation finding was fixed and regression-tested, including edits started while unlocking; no other introduced regression was found.
- Initial unit failures were two obsolete workspace/sentinel fixtures; corrected focused rerun passed. Initial focused browser run passed all four chat-access cases; two new artifact cases used the wrong English history label (Write vs Written), corrected before full runs. First full Playwright run: 67 passed, one skipped, one Scheduled fixture failed because the new Artifacts row shared its CSS class; that fixture now uses the exact Scheduled accessible-name selector. The final full rerun passed all 68 active tests.
