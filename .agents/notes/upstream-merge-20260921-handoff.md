# Upstream merge record — 2026-09-21

Two-parent merge of abcwyc/pi-agent-desktop `upstream/main` (9ccd8fa) into this
fork's `main` (cf45857). No history rewrite, no force push. Backup branch:
`backup/pre-upstream-merge-20260921`. 26 incoming commits: the v0.10.0
pi 0.86.1 batch (c6e4b90), the pi-web segment E merge (scroll-to-latest,
resizable panes, PDF fragments) and the topbar icon fix. 23 files conflicted.

## What was kept from the fork

Workbench, saved tasks, side/recap conversations, IndexedDB drafts, project
ordering, tail-follow scrolling, the sidebar-left layout (upstream moved the
sidebar under a full-width top bar; the auto-merge duplicated the sidebar block
and was reverted), the simplified composer (no compact button, automation gear,
sound toggle or narrow-screen Stop), class-based tool cards, the pin button on
markdown file links, the fork's `/side` and `/recap` commands, the running-SSE
`snapshot()` helper with run ids and notification suppression, and the fork's
`extensionRunActive` / pending-UI-request accounting in `isRunning()`.

## What was integrated from upstream

- pi 0.86 exact system prompt via `agent.transformContext` projection
  (`AgentSessionWrapper.applyExactSystemPrompt`). The fork's transcript
  rewrite helper `lib/exact-system-prompt.ts` and the subagent `preflightResult`
  hook were removed; chat-only subagents get the profile prompt through
  `promptPlan.exactSystemPrompt` as before.
- `isRunning()` consults the SDK's `isIdle`; `notifyRunningChange()` on
  `agent_start`; `abort_retry` and the automation command set.
- Scroll-to-latest button (fork anchors it with `.chat-scroll-to-bottom-anchor`
  above the composer instead of upstream's inline minimap offset).
- Cancel-retry link in the retry banner (`.composer-status-action`).
- PDF `#page=` fragments through `onOpenFile(path, page)` / `initialPage`.
- Tool-result images shown while the card is collapsed, cancelled-tool badge
  (`.msg-tool-cancelled`, `data-status="aborted"`), live `!command` output
  (`defaultExpanded` while running), output-limit truncation notice.
- Instrumentation split into `instrumentation-node.ts`; the fork's
  `lib/stream-shutdown.ts` was dropped in favour of it.
- Session-title streaming comment and test updates for `TranscriptContext`.
- `/auto-compact` i18n key alongside the fork's side/recap strings.

## Notable resolutions

- `package.json`: upstream's 0.10.0 and dependency order, plus the fork's
  `web` and `test:e2e` scripts, `lib/browser-open.js` in `files`, and the
  `@lobehub/icons` / `@playwright/test` dev dependencies. Lockfile regenerated
  with `npm install`.
- `ChatWindow`: `getFinalSplit` now yields an answer slot for provider errors
  and truncation; `handleAbortRetry` and `showScrollToBottom` wired; upstream's
  new-session product header / update link not adopted (fork has
  `emptyStateSlot` and `UpdateReminder`).
- `ChatInput`: automation props/state removed from the destructuring since the
  fork renders no gear; the `Props` fields remain for compatibility.
- Tests adapted to fork behaviour: running-events frame test reads the
  `snapshot()` helper; scroll-to-latest source tests match the CSS anchor and
  `isNew, showScrollToBottom` export order; the handleSend VM test provides the
  fork's draft guards and `prepare()`; cancelled-marker test checks the
  data-status modifier; `ChatInput.compaction.test.mjs` and the gear /
  narrow-Stop / streaming-tool-preset cases in
  `ChatInput.automation.test.mjs` were removed because they exercise composer
  controls the fork does not render.
- `scripts/fork-ownership.json`: `lib/rpc-manager.ts` moved to high.

## Verification at commit time

- `npm test`: 1,432 passed, 0 failed.
- `tsc --noEmit`: clean.
- `npm run lint`: 0 errors, 45 warnings (44 inherited from upstream/main or
  already present on the fork; the new one is upstream's unused
  `autoCompactionEnabled` state in `useAgentSession`).
- `node scripts/measure-fork-drift.mjs 974c8bb`: manifest agrees.
- `git diff --check`: clean.
- `PW_CHANNEL=chrome npm run test:e2e`: 46 passed, 0 failed (full suite, after
  the last source edit).

No `next build` was run in this dev checkout.
