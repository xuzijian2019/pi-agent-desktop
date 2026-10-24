# Temporary recap

`/recap` generates one replaceable, UI-only summary card. It dispatches locally before ordinary prompts, follow-ups and steering, even while the parent is running. Images are rejected. The fork's side-conversation feature and its follow-up/heartbeat endpoints have been removed.

The parent remains mounted with its SSE subscription, identity, draft and scroll container. Recap has a cancel button, snapshot/generation times, and preserves the previous successful card on failure. Navigation or refresh discards temporary state.

## SDK isolation

`lib/ephemeral-session.ts` snapshots the live manager if available, otherwise the existing session file. `getSnapshotSource()` is a read-only manager/model accessor; no parent startup, branch, prompt or abort is needed.

The UI sends a leaf only for deliberately selected history. Ordinary live snapshots use the manager's current branch, including completed unflushed user turns. Entries are deep-copied before asynchronous SDK initialization. Incomplete assistant/tool groups are omitted. The SDK retains compaction and branch-summary semantics.

Each recap uses a fresh `SessionManager.inMemory()` and nonpersisting `SettingsManager`, no tools and SDK-clamped low thinking. Extensions, skills, prompt templates and themes are disabled; chat-derived recaps also disable context files. The parent's model identity is resolved through standard runtime/models.json; extension-only models are rejected rather than silently replaced.

A hidden recap boundary is inserted before startup and appended to the system prompt so it survives compaction. Recap accepts only a new, nonempty successful assistant entry after complete SDK prompt/idle settlement; inherited answers cannot masquerade as a result.

## Narrow API

All mutations retain existing request-security checks. JSON operations reject unknown keys, removed kinds and arbitrary agent commands/tool selections.

- `POST /api/ephemeral`: `{id?, ownerId, parentId, kind: "recap", leafId?}`. Completes generation and returns `{data: {answer, messages, parentId, snapshotAt}}`, then disposes in `finally`.
- `DELETE /api/ephemeral/:id?ownerId=...`: idempotent abort/dispose, including pending creation.

The page generates owner and operation IDs in memory before POST. Ownership is reserved synchronously before initialization, so overlapping recap creation is rejected. DELETE may arrive before POST or its response; a bounded in-memory cancellation marker prevents an orphan.

## Cleanup and verification

Each model operation has a two-minute deadline covering prompt and idle settlement. Idle records and cancellation markers expire after five minutes. Recap cancel, navigation and pagehide close requests and abort fetches. Closing aborts generation, waits for the pending SDK operation, disposes the child and removes its registry entry. Failure, timeout and completion share this path. No child JSONL files, disk registry, normal session entries or completion notifications are created.

The recap browser fixture uses Next API, real Pi SDK and a loopback provider with isolated data, no credentials and no paid model calls. Unit coverage preserves protocol-safe snapshots, live unflushed context, historical compaction, ownership, cancellation races, timeout/disposal, failed-result rejection and chat context/tool isolation. Deterministic fixtures do not establish real-model summary quality or every provider's retry behavior.
