# Desktop upstream sync — 2026-11-18

## Inputs and isolation
- Fork main: 42a601c45685f9b19ee76192873fe56c43aba3cd; desktop upstream: de722219d49c883dab32df20adbdc0b69e09d538.
- Fresh isolated dot-cloud clone, dedicated timestamp/SHA branch and pre-merge backup. No open sync PR at both preflight and pre-publish checks. No user computer or saved coding environment used.
- 12 incoming upstream commits; `git merge --no-ff --no-commit` preserves both parents. Eight textual conflicts: AppShell.tsx, ChatInput.tsx, ChatInput.test.mjs, FileViewer.tsx, ProjectPicker.tsx, e2e/file-panel.mjs, lib/app-prefs.ts, package.json.

## Integrated from upstream
- Desktop 0.8.6 metadata, calendar timeline with sessions and scheduled tasks, responsive month/week/agenda and detail preview.
- Theme-aware HTML preview, progressive script-free preview, draft-only sendPrompt bridge, artifact generation guidance and title handling.
- Composer reference-preparation single-flight guard; pending mobile sidebar inertness; localized project/native file actions; stale settings-load guards.
- All upstream paths and fork-overlap paths reviewed, including moved file actions and project-picker UI. New locale keys remain available in English, Simplified Chinese and Traditional Chinese.

## Kept from the fork
- Upstream-aligned composer UI from the owner's November 15 decision, plus fork draft hydration/persistence, pasted text, references, attachment-clear/version and session-change guards, chat-only policy, queue restoration.
- Peek sidebar, existing workspace/header actions, navigation history guards, menu/segmented-control design tokens. Calendar menus use the shared DOM app-menu; calendar switches use shared segmented controls.
- No unrelated welcome/branding or native UI restoration. FileViewer's extracted actions stay in AppShell.

## Notable resolutions
- Shared composer submission helper wraps the complete fork preparation pipeline, retires stale submissions on draft-key changes, and clears a queue draft before its callback can restore a rejected item. Source tests now execute the shared helper, preserving safety assertions.
- Moved upstream file-action translations and visible error reporting to the existing AppShell actions, using existing desktopChrome platform state rather than reintroducing extracted desktop-window code.
- Explicit PreviewPromptContext scopes Markdown's nested previews. Cross-session artifacts cannot fall back to a hidden unrelated conversation's prompt handler; normal transcript and same-session insertion remain available. Added behavioral/call-chain tests and a real-component browser fixture.
- ProjectPicker keeps fork structure while incorporating upstream translations; SSR tests now supply the translation provider.
- Dependencies and package-lock unchanged. Pins and component manifest match desktop 0.8.6 / pi 1.5.2 / pi-web 0.15.0. Upstream CSS files remain byte-matching desktop de722219; baseline metadata advanced.
- Actual integrated pi-web baseline remains f130910abf662b506b2ef2f475fc21a2fe57badc, not fresh pi-web/main f97292eee7957e8d166d94433ec8df554fe0c9f3. Drift: 3777 cosmetic / 25338 structural (87% structural). Changed ownership measurements refreshed, review policy unchanged.

## Known pre-existing issues
- Lint retains 21 warnings, matching the November 15 handoff; no lint errors.
- Demo drift and dependency audit are advisory; no unrelated CI/release policy changes. Release workflow remains manual-only.

## Verification
- Fresh npm ci; isolated HOME/USERPROFILE/agent data; inherited PI_OFFLINE, XDG_STATE_HOME and Next environment cleared.
- Final TypeScript clean; lint 0 errors / 21 warnings. Final full unit suite: 4515 passed, 0 failed, 4 environment/platform skips (4519 total).
- Focused composer tests 57 + 8 passed; preview/calendar/security review 31 passed; extraction/project/i18n regression set 101 passed.
- Added six real-app Playwright cases: calendar detail/filter/navigation in light/dark at desktop/phone widths; preview theme changes preserve iframe/input state and sendPrompt edits only the draft. They produce actual screenshots for pixel review. A Playwright wrapper also runs the real nested-prompt and progressive-stream browser fixtures, requiring zero skips in browser-equipped CI.
- Local npm run web startup reached Next compilation, but Chromium cannot create required sockets in this environment. Browser-only unit fixtures explicitly skip when unavailable. No local browser or screenshot pass claimed; exact-commit GitHub CI and real artifact pixel review remain required before ready.
- Full Playwright and Rust checks delegated to existing CI, not duplicated locally. CI results and inspected screenshot evidence will be recorded in the draft PR.

## Remaining boundaries
- Web/dev-server evidence is not production packaged-runtime acceptance. No Mac native/Tauri/AppKit, signing, binary build or packaged-app acceptance performed or required by the owner's current scope. Rust placeholder/payload CI does not change that boundary.
- Draft PR only. Main merge requires later explicit approval for that PR. No direct main push, auto-merge, force-push, rebase, squash, tag or release.

## First CI and browser evidence
- Published head 5f135796f248052574070bef93a0130df540d0b5, exact local tree 0c3e42dc397626608b96abe300bd244d90279981 and two intended parents. Existing GitHub connector published the tree because the cloud CLI had no credentials; no credentials created or exposed.
- CI run 44209396487 checked out synthetic merge 9f94a15789431de4d97c200fde40aa05be95b911. Eight jobs successful; E2E cancelled around the existing 20-minute limit after completing item 89 of 99, without a full summary. Browser dependency installation consumed 3m38s. No timeout or unrelated CI policy change made.
- All four new calendar cases and narrow preview case passed. The real nested-prompt/streaming security fixture passed (3 cases, zero skips). Desktop preview failed only because its fixture counted the normal read-only get_tools query as a mutation. The fixture now supplies a normal empty-tool response solely for the exact get_tools request; unknown/malformed/extra-field requests and all mutations still fail the no-submission assertion.
- Opened and inspected actual CI screenshots: calendar desktop light detail/dark month, narrow light detail/dark agenda, and all four theme-aware preview desktop/phone light/dark images. Calendar content is readable, long titles wrap/ellipsis, detail actions fit, preview state survives theme changes. Dev-only Next indicator overlaps the extreme lower-left area on phone as in prior runs; not packaged runtime evidence. Final-head rerun remains required.
