# Desktop upstream ancestry sync - 2026-11-13

## Inputs and isolation

- Fork main: `0afd8cfa3e407a115b70797afd193fa62e5ddb0c` (PR #49 completed); fixed desktop upstream: `1a3d52963da627e8efb9952306ea746b09bd5dac`; merge base: `57de4b19a01530200d96584dd0e86ae5940dd15c`.
- Fresh independent cloud clone; branch `merge/upstream-20261113-132200-1a3d5296`; local backup `backup/pre-upstream-20261113-132200-0afd8cfa`. No open PR was found at preflight. No saved coding environment or user computer used.
- Executed `git merge --no-ff --no-commit` against the fixed upstream SHA. No textual conflict. Upstream tip is not yet an ancestor of fork main, so this preserves the outstanding add-and-revert ancestry rather than pretending the histories are already synchronized.
- Both the merge base and upstream tip have identical tree `073db87310f581dc174f27a5ad65afb4d33baaca`. Incoming history has four commits, but zero net content changes.
- The four commits are the README intro-video/screenshots change `ea16f269`, its merge `bc6973fe`, full revert `410926d0`, and revert merge `1a3d5296`. Reviewed both patches: the temporary changes affect only README.md, README.zh-CN.md, and an intro-poster image. No runtime or safety logic was introduced or removed by this sequence.

## Integrated from upstream

The four outstanding commits and their revert relationship only. The final README/image tree remains unchanged. CSS baseline provenance advances to 1a3d5296; stylesheet hashes are unchanged.

## Kept from the fork

The entire application, dependencies, lockfile, locales, UI/CSS, security protections, tests, CI and release configuration are byte-identical to the verified fork main. All PR #49 application and browser-regression fixes remain intact. No deleted upstream UI is resurrected, no assertion weakened, no timeout increased, and no release/tag generated.

## Review and notable resolutions

- Reviewed all paths in the incoming add and revert and compared the complete final upstream tree, plus the fork-modified inventory. There are no overlapping net changes and thus no cross-file semantic delta to transplant.
- Actual integrated pi-web baseline remains `f130910abf662b506b2ef2f475fc21a2fe57badc` (0.15.0). Fresh pi-web/main is `97e411f3c7433088937ce6ba18039439658f5e6e`, 55 commits ahead; it is observed only, not a merge source. Drift measured against the integrated baseline: 3978 cosmetic / 25403 structural lines, no manifest risk mismatch flagged.
- Release pins and component manifest remain consistent: desktop 0.8.4, pi SDK 1.5.2, pi-web 0.15.0. No SDK, npm or Cargo lock change is needed. All three locale files are unchanged.
- No UI code changes means no new interactive behavior needs a separate local visual acceptance; existing GitHub full E2E still runs for this exact PR head/merge. Relevant screenshots will be reviewed from that run rather than represented as native or production-runtime acceptance.

## Verification

- Fresh isolated npm ci succeeded. HOME, USERPROFILE and agent data are confined to this run; PI_OFFLINE/XDG_STATE_HOME and inherited Next production config are explicitly removed for checks. No user sessions or credentials are used by tests.
- Local TypeScript passed; lint passed with zero errors / 20 existing warnings; full unit suite passed 4431 tests with zero failures and one platform skip. CSS/ownership/menu consistency additionally passed 18/18. The initial unit run exposed a test-environment-only issue because HOME contained /../; reran successfully with canonical isolated HOME, without source or assertion changes. Exact-head CI results are recorded in the PR once available; the existing browser option-controls skip is not a pass.
- CSS baseline content hashes unchanged; release pin/manifest consistency checks passed. CI/release workflows unchanged. No local full Playwright or Rust duplication, because existing CI covers them.

## Remaining boundaries

No Mac native/Tauri/AppKit, signed/unsigned app, installer or packaged-runtime acceptance. Rust CI placeholder resources do not validate packaging. Production build is separate from Playwright, which invokes npm run web / development mode. This dedicated draft PR does not authorize main merge; a later explicit user approval for this PR is still required.
