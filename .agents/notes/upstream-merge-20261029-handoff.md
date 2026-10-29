# Desktop upstream merge - 2026-10-29

## Inputs

- Fork tip: `ab64f195176ffea1b3c8707c7480630dec3f634b`.
- Desktop upstream: `202697d427aa8fe65ee778fb1ee463ac482ca8ee` (0.7.8), 18 incoming commits; merge base `56691c5a47189e2b803194e1755f345227b130eb`.
- Integrated pi-web baseline remains `6fcd7d44981ab51a21d6cd6eb06d361d0e3d3068` (0.10.0). Latest pi-web `d128bae4` was fetched for comparison, not merged.
- Backup: `backup/pre-upstream-merge-20261029`. Merge has fork as first parent and desktop upstream as second parent.
- Conflicts: `app/native-theme.css`, `components/AppShell.more-menu.test.mjs`, `components/AppShell.tsx`, `components/ChatWindow.tsx`, `components/FileViewer.tsx`, `components/ProjectContextMenu.tsx`, `components/SessionSidebar.tsx`, `lib/i18n/locale-plugins.ts`, and `package.json`.

## Integrated from upstream

Conversation-local find, terminal shell preferences and staged PTY helpers, terminal theme and preload, Markdown frontmatter/alerts/code folding and saved-file opening, measured sidebar menu placement, shared deletion confirmation, project subfolder identity fix, portable test fixtures, and desktop 0.7.8 metadata. Upstream replaces the background presets with a neutral canvas. Pi remains 1.4.0 and pi-web 0.10.0; no dependency change or lockfile regeneration.

## Kept from the fork

Project tree, workspace layout, class-based tabs, composer and IndexedDB drafts, recap, session guards, per-chat file scope, AppSelect menus, and Playwright as the primary E2E suite. Declined topbar More/title UI was not restored; its upstream-only test and release-note claim were removed. The upstream accidental `app/native-theme.css-e` backup was omitted.

## Notable resolutions

- Added find inside the existing chat content region and kept recap, guarded history loading and streaming state. Browser highlight rules are installed at runtime because Next's CSS parser warns on the standard `::highlight` selector.
- Kept the fork's menu classes and native fallback while adopting measured placement. Shared session confirmation retains the fork's menu-only delete entry, full title, pending state, error/retry and focus return. Narrow composer controls open above the toolbar so they cannot cover reasoning.
- Saved-code external opening requires a path inside the message workspace, retaining the chat-folder boundary; the in-app opener still uses AppShell's existing guard.
- Maintained all three locale sets and the fork's CSS geometry. CSS baseline updated to desktop upstream `202697d4`; drift measured against the actual pi-web baseline and no risk mismatch was reported. Release component pins and manifest match.
- Examined all fork-modified/upstream-touched files for silent conflicts; the project-menu fallback sentinel was updated to assert measured anchor placement as well as the native fallback. Added a real-session search browser check and chat file-opening regression.

## Known pre-existing issues

- Lint has 21 warnings, matching the 2026-10-26 handoff. Local tests do not constitute signed/native macOS or Windows packaged-runtime acceptance.
- The 12 open fork issues were reviewed against the incoming desktop changes and latest pi-web. No issue was closed: they retain separate upstream feature, build isolation, network, draft, or reproduction work. In particular, #28 still tracks build isolation and #20 still tracks Write language inference/highlighting.

## Verification

- TypeScript, lint and full unit suite passed (3,349 tests; 0 lint errors, 21 warnings).
- Focused Chromium checks passed for session deletion, sidebar menu placement, conversation find, terminal settings/theme and shared option controls; desktop/narrow light/dark states were exercised. Menu consistency test passed.
- Full Playwright rerun: 66 passed, one pre-existing option-controls fixture skipped (its standalone `node e2e/option-controls.mjs` passed). Real-session find rerun: 2 passed; desktop/mobile screenshots inspected, with highlights rendered.
- The first full run had four failures: two fixtures opened newly seeded project folders before the existing file-access cache refreshed, and two measured a switch during its opening animation (25.9935px vs 26px). Tests now wait for API authorization and animation completion; all four passed in focused and full reruns.
