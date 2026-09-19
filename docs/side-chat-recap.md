# Side chat and recap

`/side <question>` and `/btw <question>` open one temporary read-only conversation over the current chat. `/recap` generates one replaceable, UI-only summary card. Both commands dispatch locally before ordinary prompts, follow-ups and steering, even while the parent is running. Images are rejected. Side follow-ups reject slash and shell commands.

The parent remains mounted with its SSE subscription, identity, draft and scroll container. Return, Stop or Escape in side mode closes only the child. Parent header actions are disabled during side mode; normal session navigation remains available. Recap has a cancel button, snapshot/generation times, and preserves the previous successful card on failure. Navigation or refresh discards temporary state.

## SDK isolation

`lib/ephemeral-session.ts` snapshots the live manager if available, otherwise the existing session file. The only `rpc-manager.ts` addition is `getSnapshotSource()`, a read-only manager/model accessor. No parent startup, branch, prompt or abort is needed to take a snapshot.

The UI sends a leaf only for deliberately selected history. Ordinary live snapshots use the manager's current branch, including completed unflushed user turns. Entries are deep-copied before asynchronous SDK initialization. Incomplete assistant/tool groups are omitted. The SDK retains compaction and branch-summary semantics.

Each child uses a fresh `SessionManager.inMemory()` and nonpersisting `SettingsManager`. Side tools are exactly `read`, `grep`, `find`, `ls`; recap tools are empty, with SDK-clamped low thinking. Extensions, skills, prompt templates and themes are disabled. The parent's current model identity is resolved through the standard runtime/models.json; models available only through extensions are rejected rather than silently replaced.

A hidden context boundary is inserted before child startup and also appended to the child's system prompt so the instruction survives compaction. The side transcript filters out inherited entry IDs, independently of display flags and compaction. Recap accepts only a new, nonempty successful assistant entry after the complete SDK prompt/idle settlement.

## Narrow API

All mutations retain the existing request-security checks. JSON operations reject unknown keys; the API never forwards arbitrary agent commands or tool selections.

- `POST /api/ephemeral`: `{id?, ownerId, parentId, kind: "side" | "recap", leafId?}`. Side returns `{data: {id, parentId, snapshotLeaf, snapshotAt}}`. Recap completes generation and returns `{data: {answer, messages, parentId, snapshotAt}}`, then disposes in `finally`.
- `POST /api/ephemeral/:id`: `{ownerId, message}` submits a side follow-up. Recap IDs cannot accept follow-ups.
- `PATCH /api/ephemeral/:id`: `{ownerId}` renews the connection lease.
- `DELETE /api/ephemeral/:id?ownerId=...`: idempotent abort/dispose, including pending creation.

A page generates its owner and operation IDs in memory before POST. Ownership is reserved synchronously before initialization, so overlapping creation of the same kind is rejected. DELETE can arrive before POST or before its response; a bounded, in-memory cancellation marker prevents the late operation from creating an orphan. A normal parent ID is never accepted by child prompt operations.

## Cleanup and reconnects

The side page renews its lease every **30 seconds**. **Five minutes** without a successful renewal or accepted prompt expires the child. Brief network failures do not immediately close it. Each model operation has a **two-minute** deadline covering prompt and idle settlement. Cancellation markers also expire after five minutes.

Return, Stop, recap cancel, navigation and pagehide send explicit close requests and abort fetches. Closing aborts generation, waits for the pending SDK operation, disposes the child and removes its registry entry. Failure, timeout and recap completion use the same path. The registry and cancellation markers live only in `globalThis` for Next hot reload; there are no child JSONL files, disk registry, normal session-discovery entries, Activity records or completion notifications.

To observe cleanup without a debugging API, capture the temporary ID in browser Network and verify a follow-up returns 409 after closing. Check `/api/sessions`, running sessions, Activity and the parent's JSONL for absence of the temporary ID/content.

## Local checks and limits

`tests/e2e/side-recap.local.spec.ts` exercises Chrome → Next API → real Pi SDK → a loopback HTTP provider fixture, including the SDK read tool. It covers running parent dispatch, cancellation, failed recap preservation, pending creation/navigation races, refresh, brief offline/reconnect heartbeat, historical compacted context and scroll preservation. `lib/ephemeral-session.local.test.mjs` covers reservation, disposal and accelerated expiry/deadline behavior, with narrow method substitution for model settlement cases.

Use `PW_CHANNEL=chrome npm run test:e2e -- tests/e2e/side-recap.local.spec.ts`; the existing fixture isolates HOME, PI_CODING_AGENT_DIR, cwd and port 30142. No production build, real credentials or paid model calls are needed.

Side responses are delivered after each prompt settles, not token by token. Snapshots are immediate, so unfinished parent output/tool groups are intentionally absent. Deterministic local provider responses validate the transport and SDK path, not real-model summary quality, every provider's retry behavior, or a real five-minute browser outage. Server expiry is checked with the test clock.
