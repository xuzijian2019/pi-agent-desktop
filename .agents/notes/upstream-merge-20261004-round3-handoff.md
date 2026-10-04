# Upstream merge record — 2026-10-04, round 3 of 3

Two-parent merge of abcwyc/pi-agent-desktop `f66ba13` (`upstream/main` tip,
confirmed by fetch) into round 2's `9bb3a4b`.
Work branch: `merge/upstream-round3-f66ba13`.
Local backup: `backup/pre-upstream-round3-20261004`.
Origin main was `60ee9db` at preflight; no rebase or force push.
Round 2: `.agents/notes/upstream-merge-20261004-round2-handoff.md`.

15 incoming first-parent commits from `c5a70eb` through `f66ba13`:
PR #70's branch/cost/model/extension features, SDK 1.0.2 and packaged Code
mode asset staging (#71), desktop 0.5.0/0.5.1, ancestry bookkeeping and the
pi-web drift baseline move to `6fcd7d4`.

15 conflicted files: app/native-theme.css, bin/pi-web.js,
components/AppShell.tsx, ChatInput.tsx, ChatWindow.tsx, MessageView.tsx,
SessionSidebar.tsx, hooks/useAgentSession.test.mjs, useAgentSession.ts,
lib/i18n/messages/en.ts, zh-CN.ts, package-lock.json, package.json,
scripts/fork-ownership.json, release-component-pins.json.

Resolution rule remains the user's round 2 instruction: large incompatible
changes follow upstream; keep fork changes where both can coexist. This
round's new logic fits the fork's existing structures.

## Integrated from upstream

- BranchNavigator offers opt-in "Summarize & switch" with custom instructions.
  The server generates the summary before changing the view; the hook locks
  navigation and submissions until it settles and offers Stop. Summary entries
  render as summary cards and group anchors, rather than editable user bubbles.
- Virtual-model routing: the wrapper reports the physical model and reasoning;
  the composer shows the routed-model hint beside its model/effort selectors.
- Per-model cost accounting and cache-warming status (`usage-breakdown`,
  `cache-warming-display`, wrapper snapshots and file/stream stats).
- Extension `ctx.ui.setStatus` is handled, restored from get_state snapshots,
  and displayed through ExtensionStatusLine in the fork composer's existing
  status slot (the older ExtensionStatusBar is no longer mounted). Extension session actions
  (`newSession`, `fork`, `switchSession`, `navigateTree`, withSession and
  cancellation hooks) now work; `session_replaced` follows the target session.
- No-op compaction is an informational notice; compact errors/notices expire.
- Settings › Models lists classifier/image models and links their Code mode
  notice to Settings › MCP. Tool-result images have a Save action.
- Project context menu offers native reveal or the server's available file
  manager, with platform-specific labels and errors left in the menu.
- LAN launch warnings, Rust shell/audit CI, desktop release 0.5.1, Pi SDK 1.0.2,
  js-yaml 5.4.2 and complete QuickJS/jiti staging. The packaged-server check
  uses the bundled Node and confirms the Code mode sandbox self-test.

## Kept from the fork

- Project-tree sidebar, full-height shell layout, fork composer/menu tiers,
  git branch chip, side/recap, persisted drafts and stable message-list callbacks.
- The previously removed topbar More menu and Tools/System/Session panels stay
  unmounted. `/session` remains the fork's ChatCommandDialog.
- Single guarded prepare/send path, fork test:e2e Playwright CLI and web launcher.
- Session-scoped model choices/default stars, userHome routing, monotonic request
  guards, render-phase scroll and session resets, session-level tool selections.

## Notable resolutions and semantic review

- AppShell only needs LeafChangeOptions; upstream's added Session panel effects
  and rendering were not restored. Cost-by-model/cache-warming sections instead
  live in ChatCommandDialog. The dialog re-reads GET /api/agent/[id] on opening;
  that GET does not start a dormant wrapper. CostRouting wiring assertions were
  adapted to this destination.
- The fork's `publishBranchData` wrapper previously dropped all options and
  pinned snapshotLeaf immediately. It now forwards summary/customInstructions,
  clearing snapshotLeaf for a summarized switch so loadSession shows the leaf
  pi actually wrote. A VM regression test drives both plain and summarized
  callback paths, asserting parameter preservation and snapshot behavior.
- useAgentSession retains the fork's earlier render-phase reset rather than
  resurrecting upstream's second reset block. The existing reset clears new
  routedModel/cacheWarming/compactNotice state and liveModel as well as the
  extension UI queues/slash-command generation that round 2 added.
- ChatInput's model and effort menus retain their default stars; the routed hint
  is inserted in that toolbar. New progress/notice banners use the fork's
  existing composer status classes. No upstream compact/automation controls or
  alternate send path were resurrected.
- MessageView keeps its existing CollapsibleUserText and class-based summary
  card styling; branch-summary kind/title/description were added to that card.
- Sidebar keeps the fork's path tooltip and terminal/archive menu. Only the new
  file-manager action was added; upstream's older branch submenu stays replaced
  by the fork's composer BranchControl.
- Extension status semantic collision: the fork already mounted ExtensionStatusBar
  inside ChatInput, so adding upstream's shelf would duplicate every status.
  Replaced that old mount with upstream ExtensionStatusLine, keeping the existing
  composer slot. Sentinels prevent both a second mount and restoration of the old
  bar. The real extension-command browser fixture asserts one visible status.
- Draft-saving feedback regression found by the full browser suite: the old
  indicator's 600ms timer spanned a continuous stream of queued keystrokes,
  flashing "Saving draft…" while typing. Its key now includes draft id and text
  so text edits restart that delay. The textarea and IndexedDB queue are unchanged;
  a slow save still appears after input pauses. Existing fast-typing and slow-save
  browser tests both passed with their original assertions, without a timing retry
  or relaxed threshold.
- Browser /session fixture has usage from two response models and asserts both
  cost breakdown rows. Model/thinking state API probes use Playwright's maxRetries: 2
  for ECONNRESET, preserving the existing state assertions and timeout.
- Clean merges reviewed against upstream intent: workflows/readmes, ProjectPicker,
  SettingsPanel, message grouping, structural SDK types, session-reader/stats,
  rpc-manager and locale changes. rpc-manager keeps the fork's session-level
  tool pin on navigation while adding upstream's summary/session-action logic.
- Lock regenerated with npm install starting from round 2's exact lock, preserving
  Tauri npm/crate pairings. All bundled Pi packages are 1.0.2; release pins and
  component manifest match. Pins cite this handoff, not upstream-owned AGENTS.md.
- Drift re-measured against `6fcd7d4` for every registered file. FileExplorer
  remains medium (108 structural, unlike upstream desktop's 19); directory-browser
  returns to low (25), file-access is medium (31), BranchNavigator medium (93),
  rpc-manager high (499). globals.css/settings.css were untouched this round;
  their already-correct 6fcd7d4 baseline hashes remain valid.

## Known pre-existing issues and environment

- Round 2's deferred server-recovery e2e failed again in the complete run:
  39 passed, 1 failed. The trace showed startup models/trust/worktree requests
  still in flight at shutdown; their errors triggered a Next dev overlay lazy
  chunk that could no longer load, replacing AppShell with the global error
  page and unmounting the health probe. The test now waits for successful
  model/trust responses and completion of finite startup requests before
  stopping the server, excluding SSE streams. The real outage, offline banner,
  restart and draft assertions are unchanged. desktop-connection.ts is unchanged;
  no historical product bisect was done. Final results are recorded below.
- Previous root-only read-denied directory unit failure does not occur here:
  this environment runs as uid 1000.
- Initial unit attempt was discarded: this managed environment's default
  /home/agent/.pi/agent is not writable, and its PID 1 does not reap detached
  children, causing SDK directory errors and two exited-process assertions.
  The complete final run used PI_CODING_AGENT_DIR=/tmp/pi-round3-unit-agent and
  a temporary Python Linux child-subreaper wrapper (prctl PR_SET_CHILD_SUBREAPER)
  that reaps orphaned fixture processes. No product/test assertions were weakened.
  Wrapper: /tmp/pi-round3-test-runner.py (environment-only, not committed).
- npm cache: /tmp/pi-round3-npm-cache. Browsers: bundled Playwright Chromium
  1243 installed under /tmp/pi-round3-pw; no mismatched-browser override needed.

## Verification

- Typecheck clean on the final tree (also passed in desktop production preparation).
- Lint: 0 errors, 26 warnings (round 2 had 27; upstream removed ProjectPicker's
  unnecessary callback dependency).
- Unit: **2,685 passed, 0 failed**, including the summary callback regression.
- Desktop preparation: complete standalone build/staging in `.next-desktop`;
  ordinary `.next` untouched. Build reports upstream dynamic-dependency warnings.
- `npm run desktop:verify`: **passed**, sandbox `{ state: "available" }`, no
  module resolution errors in the packaged server's log.
- Release pins / component manifest valid: pi 1.0.2, pi-web 0.10.0, desktop 0.5.1.
  Drift risk labels match 6fcd7d4; CSS baseline tests pass; no conflict markers.
- Targeted Playwright slash-menu suite: **6 passed**, including actual extension
  status cardinality and /session cost breakdown assertions.
- Initial full browser attempt was stopped after a model-state probe hit
  ECONNRESET (all other completed tests passed, including server-recovery).
  Then the duplicate extension-status mount found in semantic review was removed
  and the state probe's network retry enabled before the final full run.
- Native Rust/Tauri compilation was not run locally (no Rust toolchain here);
  the incoming macOS Reopen change is upstream's equivalent guarded match arm.
  Upstream's new Rust test/clippy CI job is included.
- Targeted server-recovery after startup-readiness adjustment: **1 passed**;
  original offline/restart/draft assertions retained.
- The next complete run passed server-recovery but caught the draft-saving
  feedback bug (39 passed, 1 failed); isolated repeats confirmed it. Startup-only
  waiting did not fix it and that attempted typing-fixture change was discarded.
  After the indicator fix, targeted fast-typing/slow-save tests: **2 passed**.
- Full Playwright on the final tree: **40 passed, 0 failed (8.5m)**, no retries.
  Includes both server-recovery and unchanged fast-typing/slow-save assertions.
  Log: /tmp/round3-e2e-final.log.

## Continue

The work branch includes all three two-parent merge rounds. Origin main remains
`60ee9db`; this round publishes only the work branch. Fast-forwarding main to this
result can preserve the complete fork/merge ancestry.
