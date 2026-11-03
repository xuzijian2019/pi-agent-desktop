# Desktop upstream merge - 2026-11-03

## Inputs

- Fork tip: `1a882e4d9bd5daa2a9d86688ba10a411ede5412c`; desktop upstream `0a1c79efcc46cf7ae13175e4979f74bcd1233515` (0.8.2); merge base `140b454590a85714db2fe07751faa6cba550c9ec`; 57 incoming commits.
- Isolated cloud checkout; branch `merge/upstream-20261103-1305-0a1c79ef`; backup `backup/pre-upstream-20261103-1305-1a882e4d`. No open PR or other active sync was found at preflight.
- Fresh pi-web tip `6386fa43d9961e993d946cf6b44702c3321ddf7c`; actual integrated baseline remains `6fcd7d44981ab51a21d6cd6eb06d361d0e3d3068` (0.10.0). No independent pi-web merge.
- Text conflicts: AppShell, ChatWindow, MessageView, ProjectContextMenu and test, SessionSidebar, fork-sessions notes, deleted standalone title-feedback test, eslint config, app-prefs, locale patches, rpc-manager, package/lock, ownership, release pins.

## Integrated from upstream

Pi SDK 1.5.0, encrypted remote relay and phone Tasks view, remote-access/push hardening, project and individual-session archives, idle-session byte cap, atomic user-data writes, credential-file exclusion, live-session rename, whole-run scheduled-task deadline, and lower-GPU sidebar indicators. Release metadata follows desktop 0.8.2; pi-web remains 0.10.0.

## Kept from the fork

Project-tree/branch-chip/drag ordering and contextual path hints, full-height shell, simplified composer and new-task guide, usage preference with full token/cost detail, draft/scroll/request guards, extracted menus and branch navigator, single-send behavior, fork Playwright runner, security streaming restrictions. Deleted unused panels remain deleted. Retained existing undici 8.12.2 rather than downgrading to upstream 8.11.0; Tauri npm plugin versions remain at the fork lockfile pins.

## Notable resolutions

- Tasks uses existing page/history/inert handling; project archive blocks keyboard/native-menu creation while explicit directory selection restores the project only after stale-selection checks. Both native and DOM context-menu paths preserve archive/restore state.
- Initial full-unit run exposed a stale menu anchor literal and an existing MCP fixture race: codemode connection runs in the background while a direct server can fail first. Strengthened the menu sentinel for both anchor sources and awaited actual MCP terminal states with the existing bound; all failure/stderr/redaction assertions remain.
- Found a silent double auto-name path: fork's first-message autoNameSession and upstream's after-run autoTitleAfterRun could issue concurrent title requests. They now share an in-flight guard, honor explicit autoName:false, and protect user renames. Kept the fork's one existing localStorage preference (default on); did not mount a second contradictory server-preference switch (server default off). Added executable race/callback regressions.
- Upstream deleted file-explorer-state as unused, but fork retained dead sidebar-only imports/state. Removed that unused legacy sidebar state, preserving the actual right-panel explorer. Added sentinel against resurrection; audited other deleted modules for residual references.
- Kept fork ownership records while incorporating upstream new boundary records; recalculated actual pi-web structural drift and risk. CSS baseline points to exact desktop upstream. Lock regenerated from fork lock to preserve Tauri pins; component manifest and both release pins agree.
- All mutually modified paths reviewed, including clean merges in files route, CSS, settings, extraction sentinels, types and runtime tests. Security review covers relay request marking/header filtering, local-only/desktop-token boundaries, revoked-device push binding, file credential rejection before stream/watch/range routes, and scheduler lifetime.

## Verification and remaining boundaries

- npm ci completed in isolated HOME/cache. Final cloud TypeScript passed; lint 0 errors, 21 warnings (same baseline); full unit suite 3580/3580 passed. CSS/ownership/release-workflow/i18n consistency group 36/36 passed. Exact-head CI outcomes are recorded in the PR.
- Focused runtime/security/scheduler tests: 308 passed; relay server/shell: 17 passed; component focused tests and new archive/race regression results are recorded in PR.
- `npm run web -- --no-open -p 31203` started in isolated HOME, agent directory and build output. Chromium could not launch: socket syscall returned `Operation not permitted`. Separate execution network namespaces also prevent a later curl from reaching that process. No local screenshot, HTTP response or UI interaction is claimed. Added CI desktop/narrow, light/dark Tasks/project/session archive interactions and screenshots; CI artifacts must be visually inspected before a readiness claim.
- This is not production packaged-runtime acceptance. No Mac app binary, native/Tauri/AppKit, signed/unsigned package or installer acceptance was run. Rust CI uses placeholder bundle resources, not packaged-runtime evidence.
- `release:verify` includes a future-publication freshness gate and reports that 0.8.2 is already upstream's latest release; no release is being published by this sync. Local component consistency checks pass; no unrelated release configuration/version bump was added.
- Local npm audit remains non-clean: 1 critical (Next.js) and 1 high (transitive zod), with Next.js 16.3.8 unchanged by this merge. CI audit is advisory and must be read separately from job success. These findings are not an exploitability assessment or security clearance.
- Draft PR only; no main push, auto-merge, force-push, rebase, squash, release or tag. Main requires the user's later explicit authorization for this PR.

## First exact-head CI review

Head `1d8b842111575ef600e41eacf48dda4e03f034bc`, GitHub test merge `cbdc422e2bdd5e79b400daf2e4531e5d38faca7c`, run `41646717395`: checks and both Rust jobs passed; browser suite 68 passed, 8 failed, 1 pre-existing option-controls skip. The audit command exited 1 despite the advisory job success (one critical Next.js and one high zod).

Real traces/screenshots showed test locators/readiness issues: mobile sidebar opening matched both the off-canvas and topbar buttons; browser session actions require the action button, while right-click is the desktop hook; the missing-folder action is now Move to archive. Tests now target the actual controls and additionally verify history retention. The model-command trace showed no set_model request: submission preceded the initial model catalog response by about 80ms. Wait for the actual requested model option before exercising the command, retaining the backend model/thinking assertions and existing time limits.

Actually inspected desktop light/dark Tasks, archive menu and General/Relay/Remote-access screenshots plus long-composer desktop/light and phone/dark screenshots. Text and menus were contained and readable; no serious visual issue observed. Replacement-head CI and mobile/archive screenshots remain required. No production or native package acceptance implied.

## Replacement-head browser evidence

Head `14b418703066867b9ee634f8bfd493bbf63c9d63`, test merge `0a83004ec003e8ecd1596db3f4313214530c81f9`, run `41650269462`: all 76 runnable browser tests passed (one pre-existing option-controls skip), but the job reached its unchanged 20-minute total limit immediately after the summary and concluded cancelled. Retried only the e2e job, without increasing any timeout. All 28 added Tasks/project/session archive/Settings screenshots were actually viewed across desktop/narrow and light/dark, with no serious layout or core-control issue; disabled styling and the pre-existing dark range track remain cosmetic limitations.

The same-head retry passed 75 and exposed one pre-existing Chat access test race: server polling saw unlock before the browser's own POST response completed, so a one-shot visibility check guessed the desktop was narrow and waited for nonexistent More controls. The trace proves the check preceded response completion by about 210ms; the final screenshot showed the correct unlocked label. The test now waits on the actual access anchor's expected label/enabled state and retains server scoping, checked state and draft-preservation assertions. No product behavior or timeout changed. Final exact-head CI results remain in the PR.
