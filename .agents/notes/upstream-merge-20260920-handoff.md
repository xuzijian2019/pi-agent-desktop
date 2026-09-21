# Upstream merge record — 2026-09-20

Two-parent merge of abcwyc/pi-agent-desktop `upstream/main` (82c8aaf) into this
fork's `main` (7680898). No history rewrite, no force push. Backup branch:
`backup/pre-upstream-merge-20260920`. Common ancestor 2f24195 (129 local-only
and 281 incoming commits). `pi-web-upstream` is the separate agegr/pi-web
remote; the shared-file drift manifest is still measured against pi-web 974c8bb.

## What was kept from the fork

Workbench, saved tasks, activity view, side/recap conversations, IndexedDB
drafts, project ordering, tail-follow scrolling, the simplified composer, silent
completion, the removed Full-history and send-preview UI, and Pi 0.86.1 (upstream
shipped 0.85.1).

## What was integrated from upstream

Subagents, workspace terminals (node-pty), file pagination, model state,
provider usage, settings pages, web auth and request security, and the SSE
lifecycle fixes.

## Notable resolutions

- Pi 0.86 `systemPrompt` is read-only; `lib/exact-system-prompt.ts` updates the
  transcript system message while preserving tools. Used by rpc-manager and the
  subagent runtime. Session title streaming uses `normalizeContext`.
- Existing sessions do not acquire tool metadata from browsing or side
  questions: `saveSessionToolNames` at startup only runs for sessions without
  messages. Opening a session no longer boots the agent runtime (upstream's
  lazy init); the composer's tool preset for existing sessions comes from the
  session detail response.
- Draft storage keeps IndexedDB, pasted text, task settings and references,
  combined with upstream's recovery/rekey helpers.
- Automatic merge had duplicated JSX and nested the chat beside its header
  instead of below it; `tests/e2e/upstream-merge.spec.ts` now asserts the
  geometry, a real terminal, terminal reconnect after reload, and large-file
  pagination.
- Workspace hydration no longer overrides a terminal tab restored from
  sessionStorage with the first file tab.
- `components/TabBar.tsx` keeps the fork's class-based markup and adds
  upstream's terminal tabs. Upstream's own TabBar renders each label twice and
  dropped the `file-tab` class, so the fork version is the working one.
- Running SSE heartbeat carries `sessionListVersion` and notification
  suppression; Node signal registration lives in `lib/stream-shutdown.ts`.
- `hasForks` handles upstream's first-message and multiple-root branches.
- Restored `chat.currentProject` / `chat.switchProject` strings and the
  `chat.modelScopeDismiss` call site that the merge had replaced with a
  nonexistent key. zh-TW falls back to English for fork-only strings.
- Removed merge leftovers that lint flagged: unused session-copy state and
  worktree import, the composer's unused file input and slash-menu height
  state, media-viewer toolbar remnants, a duplicated phase reset in the
  streaming handler, and stale hook dependency arrays. ChatWindow now passes
  extension statuses to the composer, which the merged tree had dropped.
- Remaining ESLint warnings (40) all exist verbatim in upstream/main; the
  fork's HEAD had none. They are upstream's unused sidebar/search state and
  were left alone to limit drift.

## Verification at commit time

- `npm test`: 1,365 passed, 0 failed.
- `tsc --noEmit`: clean.
- `npm run lint`: 0 errors, 40 warnings (all inherited from upstream).
- `PW_CHANNEL=chrome npm run test:e2e`: 46 passed, 0 failed (full suite,
  after the last source edit).
- `node scripts/measure-fork-drift.mjs 974c8bb`: manifest agrees;
  `scripts/fork-ownership.test.mjs` passes. TabBar moved to medium and
  MessageView to high on this merge.
- `git diff --check`: clean. No conflict markers.

Tests updated for current behaviour: textbox accessible name "Message",
theme button "Theme: Dark", first-question branch preview, search label,
session detail load instead of `get_tools` at startup, and a `.first()` on
the nested `data-entry-id` locator (upstream sets it on both the entry
wrapper and the message).

No `next build` was run in this dev checkout.
