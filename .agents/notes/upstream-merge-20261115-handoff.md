# Desktop upstream sync — 2026-11-15

## Inputs and isolation
- Fork main: b7d6cfc0a3e64c5b4014dce9a752a3d60e2af30d; desktop upstream: 9669045cccc84fd78d1ce7b6e6d715e169ffcb18; merge base: 1a3d52963da627e8efb9952306ea746b09bd5dac.
- Fresh isolated cloud clone; branch sync/upstream-20261115-1300-9669045, backup backup/pre-upstream-20261115-9669045. No open PR at preflight; previous project task completed. No user computer or saved coding environment used.
- 22 upstream commits. Executed git merge --no-ff --no-commit. Eight textual conflicts: release workflow, native CSS, composer project chip, sidebar and sidebar tests, SettingsPanel, fork UI notes, release pins.

## Integrated from upstream
- Model discovery rejects incomplete >20-page and repeated-cursor catalogs and enforces total timeout.
- Settings desktop left navigation with keyboard roving focus and narrow icon rail.
- Sidebar subagent rows default folded; forks are independent sibling rows with source labels.
- Project path hover hint and bounded scrolling composer project list (the latter already present from fork).
- Payload credential/config exclusion and fail-closed scan, Linux/Windows canary CI, desktop 0.8.5 metadata and Intel release plumbing. Release workflows remain manual-only and were not dispatched.

## Kept from fork and resolutions
- Fork project order/branch labels, session links, archived sessions, side/recap, class-based menus, mobile AppSelect, hover missing-path warning and viewport bounds remain. No declined upstream UI restored.
- Kept PI_WEB_DIST_DIR isolation, Playwright test command, dependencies/overrides, main CI screenshot artifact retention. Release notes adopt upstream 0.8.5 and correct bundled versions.
- Resolved semantic integration issues: archived display-name mapping needed by the new independent fork rows; upstream Settings test referenced its old CSS variable name, adapted to existing fork fixture without weakening assertions.
- Reviewed every upstream path and the overlap set; independent backend/security/workflow review found no blocking merge regression. Added sidebar navigation/path-hint integration sentinel. All three locale keys match.
- npm dependencies unchanged; package-lock unchanged. Pins and manifest match desktop 0.8.5, pi 1.5.2, pi-web 0.15.0. CSS baseline advanced to desktop 9669045c, upstream stylesheet hashes unchanged.
- Actual integrated pi-web baseline is f130910abf662b506b2ef2f475fc21a2fe57badc. Fresh pi-web/main 174bff967807cdb59abb0204198d3d7cc19c862d is 106 commits ahead; not merged. Drift: 3985 cosmetic / 25506 structural; no risk mismatch flagged.

## Verification
- Fresh npm ci; canonical isolated HOME/USERPROFILE and agent data, cleared inherited PI_OFFLINE/XDG_STATE_HOME/Next environment.
- TypeScript clean after archived-name fix. Lint 0 errors / 21 warnings (previous 20; additional upstream sidebar hook dependency warning). Full unit suite: 4461 passed, 0 failed, 1 platform skip. Focused backend/security tests 60 passed.
- Local npm run web server starts, but local Chromium socket creation is prohibited; cloud browser cannot reach its loopback endpoint. No local screenshot acceptance claimed. CI E2E/browser artifacts and exact head/merge terminal results must be recorded in PR before ready.
- Existing pre-release demo drift remains advisory. Incoming upstream file has harmless extra EOF blank line; not a functional issue.

## Remaining boundaries
- No Mac native/Tauri/AppKit/app signing or packaged-runtime acceptance. Linux/Windows payload staging/scanning and Rust placeholder CI are not native application or production-runtime acceptance.
- Draft PR only. Main merge requires a later explicit user authorization for this PR. No direct main push, auto-merge, force-push, rebase, squash, release or tag.

## Focused web regression coverage
Existing four light/dark x desktop/phone Settings scenarios now assert actual left-navigation geometry, keyboard focus, compact selector and capture screenshots. One added sidebar scenario covers independent forks, child folding persistence and long-path hint dismissal in both themes. These run under the real npm run web harness with a synthetic read-only catalog; execution and pixel review are pending CI, not locally claimed.
