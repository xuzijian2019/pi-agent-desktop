# Upstream merge handoff — 2026-10-05

- Upstream tip: `3325240f8c1def0988afd37af4a4446235cb6e6c` (`abcwyc/pi-agent-desktop/main`).
- Fork tip before merge: `d5ec348fce863c90142187d4fa1e390468e58a48`.
- Backup: `backup/pre-upstream-merge-20261005`.
- Incoming commit: `3325240 fix(chat): refresh context usage during active runs (#75)`.
- Conflicted file: `hooks/useAgentSession.ts` (equivalent session-generation/run guard).

## Integrated from upstream

Adopt #75's existing 15-second active-run reconciliation and immediate `/session` refresh. Synchronize SDK `contextUsage` before the busy return; preserve null/unknown usage semantics and reject responses after a session switch, A→B→A switch or newer prompt. The reconciliation handler matches upstream byte-for-byte. Keep upstream's 14 executable behavioral regressions and sessions documentation.

## Kept from the fork

All unrelated session guards, draft/navigation behavior, streaming/scroll behavior, branch-summary isolation, tool presets and fork UI remain. The existing `agent_end` refresh still updates context usage under its identity guards.

## Notable resolutions

Remove fork-only `contextUsageRequestIdRef`, `applyContextUsage`, `refreshContextUsage` and the extra assistant `message_end` GET. Once the competing per-message request path is gone, prefer upstream's simpler guarded state synchronization. Active usage now follows the existing 15-second poll (plus visibility/online reconciliation), rather than issuing an immediate GET per completed assistant message. `/session` supplies immediate usage when requested. Replace the source-pattern test of the removed implementation with upstream's behavioral suite; do not keep two usage implementations.

Semantic review covered the only overlapping runtime file, `hooks/useAgentSession.ts`. Incoming docs/test files are adopted. Package dependencies and release versions do not change. Release pins/manifest valid: desktop 0.5.2, Pi 1.0.2, pi-web 0.10.0. Drift measured against the actually integrated pi-web baseline `6fcd7d4` (`pi-web-upstream/main`); no risk-class mismatch was reported, so no unrelated manifest rewrite.

## Known pre-existing issues / limitations

The prior handoff recorded incomplete E2E with idle-network and HTML-preview timeouts. Both pass in this run. This run reports different E2E failures; do not infer that they are pre-existing solely because they are outside the patch. Failures and targeted rerun results are recorded below. No remote CI result is claimed.

## Verification

- TypeScript: `node_modules/.bin/tsc --noEmit` passed.
- Lint: 0 errors / 26 warnings.
- Focused hook tests: 62 passed, including all 14 upstream context-usage behavioral tests.
- Full unit suite: 2,708 passed / 0 failed / 0 skipped.
- Release pin/manifest checks all true; conflict-marker and staged diff checks clean.
- Full Playwright: 35 passed / 5 failed (40 executed), reported 1.4h. Several failures include browser-context teardown timeouts and anomalously long durations (e.g. 28.5m in a 180s test). Root cause not established.
- Failed cases: server-recovery; composer reload/orphan/shortcut/server feedback; fast typing; remote saved draft restore; session-reference send settlement.
- Complete full-run failure artifacts preserved at `/tmp/pi-merge-full-e2e-results` and `/tmp/pi-merge-full-playwright-report`; log `/tmp/pi-merge-e2e.log`.
- Targeted rerun of all five failed cases: **5 passed / 0 failed**, 1.4m, no code/test/timeout changes. Thus all 40 cases passed across the full attempt and targeted rerun; this is not a single clean full-suite pass. Log `/tmp/pi-merge-e2e-retry.log`; current `test-results/` and `playwright-report/` describe this successful rerun.

## Contribution triage (second requested task)

Current abcwyc source and live issue/PR status reviewed. Posted authorized judgment comments to fork #3, #8, #10, #12, #15, #29 and a full queue summary to #32:
https://github.com/xuzijian2019/pi-agent-desktop/issues/32#issuecomment-6002412459

Recommend preparing independent abcwyc PRs for #8 (code-background theme transition; pi-web #1060) and #10 (sidebar breakpoint state; pi-web #1059). Directly executed current abcwyc #10 handlers to confirm loss of desktop preference. #12 needs abcwyc-specific reproduction and a focused recovery patch; #15 should evaluate/attribute existing pi-web #1056 before porting. #3 is already covered by abcwyc #75, with pi-web #1058 still open. Remaining issues need new reproduction, are blocked by different implementation premises, or are feature/distribution decisions. No new PR was created and no unrelated upstream discussion was modified.
