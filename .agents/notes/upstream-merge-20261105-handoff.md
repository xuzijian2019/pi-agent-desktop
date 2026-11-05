# Desktop upstream merge - 2026-11-05

## Inputs

- Fork tip: `f12c028ad7b2b962e0317d61d9f86619601d8cc6`; desktop upstream `eaf955fd33b26ee1fc3edfcdb27c6f6585515b40`; merge base `0a1c79efcc46cf7ae13175e4979f74bcd1233515`. Three incoming commits, including a merge, touch six files.
- Isolated cloud checkout; branch `merge/upstream-20261105-1338-eaf955fd`; local backup `backup/pre-upstream-20261105-1338-f12c028a`. No open PR or active sync at preflight.
- Fresh pi-web tip `f130910abf662b506b2ef2f475fc21a2fe57badc`; integrated pi-web baseline stays `6fcd7d44981ab51a21d6cd6eb06d361d0e3d3068`. No independent pi-web merge.
- Text conflicts: `components/ChatWindow.tsx`, `lib/mcp-host.integration.test.mjs`.

## Integrated from upstream

The unavailable-workspace recheck now shows checking and unchanged states, disables repeated requests while checking, and announces the unchanged result. The new labels are in English, Simplified Chinese and Traditional Chinese. Upstream also fixes an MCP test race.

## Kept from the fork

Preserved the fork composer, project tree, session and draft safeguards, class-based presentation and security remediation from PR #47. The fork's MCP integration test already waited for both named servers to leave connecting before asserting failure; retain it instead of the upstream `every()` predicate, which could pass vacuously on an empty list. Neither package nor lockfile changed.

## Notable resolutions

- Kept fork-only `UserMessage` import and used the new `UnavailableWorkspaceNotice` type. Audited all four mutually modified files and both other incoming paths for silent conflicts; the existing AppShell → ChatWindow → ChatInput chain retains draft/send guards.
- Upstream places the action beneath the notice body; this fork places it in the heading. Adapted the action to fork-owned `native-theme.css` with a wrapping heading, rather than adding inline shared styling.
- Stylesheets match desktop upstream byte-for-byte; baseline reference updated. Pins and manifest match desktop 0.8.2, pi 1.5.0 and pi-web 0.10.0. Against the integrated pi-web baseline, ChatInput structural drift is 1785 versus 1778 recorded, accepted/high unchanged; manifest updated without relaxing risk policy.
- Latest pi-web is 323 commits ahead of integrated baseline and is not independently merged here.

## Verification and remaining boundaries

- `npm ci` succeeded in an isolated HOME/cache. TypeScript passed; lint passed with zero errors and 20 existing warnings. Installed-version pins and manifest verified; 32 focused i18n/ownership/CSS tests passed. The first full unit run failed one environment-sensitive skill-lock test because inherited `XDG_STATE_HOME` pointed outside the isolated HOME; a full rerun with that variable unset and other XDG paths isolated passed 3588/3588. No assertion was weakened.
- `npm run web -- --no-open` started in an isolated data/build sandbox. Local Chromium could not launch: its socket call was denied before test code ran. No local browser interactions or screenshot inspection are claimed. Added CI-discovered actual-app tests for checking, unchanged, repeat, recovery, cancellation, failure, preserved draft and desktop/narrow light/dark including Chinese. Exact-head CI and its screenshots remain required for evidence.
- No Mac native application build or acceptance, release, tag, direct main push, force-push, rebase, squash or auto-merge is authorized by this task.
