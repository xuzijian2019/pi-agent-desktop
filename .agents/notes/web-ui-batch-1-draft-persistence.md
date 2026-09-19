# Web UI batch 1: reliable draft persistence

Status: implemented under the user's 2026-09-18 request; original review retained below.
Review baseline: `bb7eb66`, 2026-09-18, Chrome on macOS 27.0.
Priority: first, because these failures can lose unsent work.

## Outcome

Draft text, pasted-text contents, and attached images survive reloads and concurrent browser tabs. A failed save must be visible, and a placeholder without its contents must never be silently sent as the user's intended prompt.

## Confirmed findings

The review exercised the actual TypeScript draft-store implementation in isolated JavaScript contexts with shared simulated localStorage; it did not modify real browser drafts.

1. **Cross-tab overwrite.** Each tab hydrates a module-local map once. Every persistence operation replaces the entire `pi-chat-drafts-v1` object. Reproduction: initialize tabs A and B; save draft A in tab A; save draft B in tab B; reload A. Storage contains only B, and `getDraft("A")` returns null. Different session keys do not prevent this.
2. **Silent attachment loss.** Persistence filters out images larger than approximately 400,000 decoded bytes and pasted text longer than 131,072 characters. Reproduction with an image just above the limit and a 131,073-character paste restored the composer token but zero images and zero pasted-text records. The placeholder survives independently of its contents.
3. **Persistence failures are swallowed.** The preference helpers catch quota/storage errors without returning save status. The 250 ms persistence debounce also has no explicit page-exit flush. These are source findings; the review did not simulate a real browser crash or full storage quota.

## Implementation scope

- Inspect `lib/draft-store.ts`, `lib/app-prefs.ts`, `lib/pasted-text.ts`, and draft restoration/clearing in `components/ChatInput.tsx`; draft keys are supplied by `components/ChatWindow.tsx`.
- Prefer transactional IndexedDB records per draft, including attachment payloads, over rewriting one localStorage object. Keep the store API small and make any asynchronous hydration explicit in the composer.
- Add revision/conflict handling and cross-tab notifications. Independent drafts must not overwrite each other; editing the same draft in two tabs must have a defined policy that does not silently replace active input.
- Migrate existing localStorage drafts without deleting the old data before the new write succeeds. Handle blocked/unavailable storage and migration failure explicitly.
- Expose pending/saved/failed persistence state where useful. Avoid promising that a save completed before its transaction commits.
- Validate restored paste references and attachments. Recover missing content when possible; otherwise show an actionable error and block an orphaned paste token from being sent unnoticed.
- Preserve current session-switch behavior, draft clearing after successful submission, image previews, and pasted-text expansion into fenced blocks.

## Acceptance checks

- Two tabs editing different sessions retain both drafts after either tab reloads, closes, or saves again.
- Concurrent same-session edits follow the documented conflict policy; another tab's save does not overwrite the current editor unexpectedly.
- Images above the old 400 KB cap and text above the old 131,072-character cap survive reload with identical contents within the new supported limits.
- Migration, storage denial/quota failure, quick reload, attachment-only drafts, and draft deletion are covered with behavior tests.
- Orphaned paste tokens cannot silently pass through submission. Successful submission does not resurrect a previously cleared draft in another tab.
- Browser tests use isolated profiles/storage and sandbox sessions, never the user's real drafts or credentials.

Run targeted tests, then `npm test`, `node_modules/.bin/tsc --noEmit`, `npm run lint`, and relevant browser E2E. Follow the isolation conventions in [web-playwright-pilot.md](web-playwright-pilot.md). Do not run `next build` during development.

## Boundaries

Do not add cloud synchronization, change Pi JSONL files, or redesign the composer. This note does not authorize implementation, committing, or publishing; it records the proposed work. Continue with [batch 2](web-ui-batch-2-session-selection-and-search.md) after draft safety is verified.

## Implementation and verification (2026-09-18)

- Replaced the shared localStorage object with per-key IndexedDB records and revision-checked transactions. Writes start immediately; saved status follows transaction commit. Existing image limits (10 images, 10 MB each) still apply; pasted text has no separate persistence truncation cap. Storage quota remains browser-managed.
- Conflicts keep the local editor intact and block submission until the user chooses Save my version or Load saved version. Tombstones prevent deleted drafts from being migrated or automatically saved again by a stale tab.
- Legacy data remains intact; blocked storage, migration errors and quota failures expose a failed status. Failed/conflicted local input survives session switches. Missing paste payloads and invalid restored images block sending with recovery instructions.
- Browser coverage exercises real IndexedDB, two tabs, full payloads, migration, deletion, image-only drafts, quota failures, blocked migration, and quick composer reloads. Existing pasted-text unit tests continue to cover fenced expansion.

Verification passed: `npm test` (528 tests), `node_modules/.bin/tsc --noEmit`, `npm run lint`, and `PW_CHANNEL=chrome npm run test:e2e` (8 tests). The focused composer/reconnect E2E also passed after the final retry adjustment. Tests use sandbox sessions and browser contexts; no model requests, commits, publishing, or development-time production build.

### Follow-up: typing flicker

The original pending-status row appeared 23 times during a 23-character browser reproduction. Quick saves now stay visually quiet; a save/loading indicator appears only after 600 ms and is positioned outside document flow so it cannot resize the composer. Failure/conflict feedback remains immediate, and persistence itself is not delayed. Two browser regressions verify rapid typing, stable composer height during slow saves, and reload restoration; typecheck, lint, and the 528-test unit suite pass.

### Follow-up: returning to an unsent new chat

The New Session handler explicitly cleared `new:<cwd>` before remounting, so opening an existing session and returning through that button destroyed the saved new-chat draft. It now reopens the project's unsent draft while resetting only the temporary runtime. Successful submission still clears the draft. The new browser regression reproduces the original failure and now passes with a 180,000-character paste, verifies the complete persisted payload and reload restoration, and checks that submission leaves the next new chat empty. The related keyboard/navigation browser checks, 528 unit tests, typecheck, and lint also pass.
