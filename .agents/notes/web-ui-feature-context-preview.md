# Web UI feature: right-panel Context preview

Status: implemented; original acceptance specification retained below. See implementation update for final integration and user-directed polish.
Source review: 2026-09-18, current working tree; depends on batch 1's completed draft/attachment persistence contract.

## Outcome and accuracy promise

Before sending, inspect the outgoing user message after the WebUI expands pasted text and selected session references, with an attachment inventory and clear size/truncation indicators. Add a Context right-panel mode and a Preview context action by the composer.

This is an outgoing-message preview, not an exact provider-request inspector. Pi can subsequently expand slash commands, load instructions, inject extension messages, and compact history. Label these limits in the product: `Outgoing message — Pi may add instructions or expand commands when sent`. Show existing history/system-prompt/context-usage information in a separate read-only section when available, never imply that it is part of the exact preview snapshot.

Use the shared shell contract in [Activity](web-ui-feature-activity-view.md). Opening preview never starts an AgentSession or makes a model request.

## Existing foundations

- `lib/session-reference.ts` expands selected/quoted session mentions and bounds reference text at 120,000 characters; its existing failure behavior can leave tokens unresolved.
- `/api/sessions/[id]/reference` formats the selected session leaf. `lib/pasted-text.ts`, `lib/image-attachments.ts`, and ChatInput submit handling assemble other input.
- System prompt and aggregate context usage already exist. Preserve their meaning; do not present a fabricated exact token count or a promise that every local file mention embeds its bytes.

## Preview UI

- Header shows which draft/session is being previewed and Fresh / Preparing / Out of date / Error state. Offer Refresh and Return to composer. Normal Send remains in the composer; preview is optional.
- Sections: Typed text, Pasted text, Referenced sessions, Images, and Final outgoing text. Show character/UTF-8 byte counts separately, image count/decoded byte sizes, and total outgoing text size.
- Each paste/reference shows its source label, expandable actual text, included length, and any truncation. Reference titles are labels; stable session IDs and source leaf/revision identify content.
- Final outgoing text is selectable/copyable and exactly matches the prepared text for that draft revision. Images are separate payload blocks shown as thumbnails, dimensions when available, MIME type, and decoded size; never dump base64 into the text preview.
- Token estimate is optional. If implemented, label it Estimated text tokens and name the method; exclude image/provider overhead explicitly. Do not infer an exact request cost from this preview.
- Plain file/line mentions remain path references unless existing send logic embeds content. Display `Path reference — file contents not attached` where applicable.
- Slash commands show the literal outgoing command and `Expanded by Pi at execution`; shell `!` input shows a Command preview with the existing shell expansion rules, not a fake model-context preview.

## Inclusion controls

- Each referenced session defaults to its selected leaf's current formatted reference under the existing size limit. Allow selecting a contiguous range of displayed messages using stable entry IDs, with All messages as the default. Show selected range and any size-limit truncation.
- Do not include history from another branch accidentally. Add optional leaf/range parameters to the reference endpoint and validate them server-side. Keep old callers compatible.
- Remove paste/reference/image updates the actual draft and its placeholder/selection metadata atomically; no preview-only exclusion that silently disagrees with the composer. Removing a reference removes its token, while unrelated literal `#` text remains unchanged.
- Persist reference IDs/ranges and include/remove decisions with the draft. Never resolve by session title when a selected stable ID exists; renaming or duplicate names must not change the target.
- Missing paste payloads, failed selected-reference loads, and invalid images are blocking preparation errors with retry/remove actions. Do not send a selected-but-unresolved placeholder as if preparation succeeded. Ordinary unselected bare `#tokens` keep existing literal behavior.

## One preparation path for preview and Send

- Extract a typed asynchronous `prepareOutgoingMessage` helper used by normal send, steer, follow-up, and preview. Input includes immutable draft revision/text, paste records, image records, selected reference IDs/ranges, and submission mode. Preserve current shell-specific exclusions.
- Output includes exact outgoing text/images, per-source inclusion metadata and warnings, source revisions, and blocking errors. No network/model side effects beyond authorized reference reads.
- Preparation is cancellable and bounded by deadlines. Session switch/draft change invalidates ownership; old responses cannot update the new preview or submit a different draft.
- After preview is prepared, Send uses that prepared snapshot only if draft and settings revisions still match. Reuse already resolved reference bytes; do not silently re-expand a referenced session that changed after preview. Refresh explicitly rebuilds it. Show the reference snapshot time. If the user edits anything, mark preview Out of date immediately and prepare the new revision before sending.
- During send preparation, capture the submitted draft revision. Editing afterward must not change the captured outgoing payload; successful send clears only that captured revision, preserving newer typing. Integrate with batch 1's draft conflict/deletion behavior.
- Optional preview must not be mandatory for every send, but all sends use the same validation/preparation path. Respect existing attachment limits rather than inventing separate preview limits.

## Acceptance checks

- Capture the API POST in sandbox browser tests and compare its text/images to the prepared preview for normal send, steer, and follow-up. Verify shell commands retain existing semantics.
- Large paste/reference truncation is visible; image counts/bytes agree with payload. Empty images, orphan paste tokens, reference failure, and deadline expiry prevent silent partial submission.
- Duplicate/renamed session titles resolve by stable ID; branch/range selection includes only intended entries and persists across reload.
- Change source session after preview: sending the unchanged draft uses the displayed snapshot. Refresh includes the new source revision. Change the draft: preview becomes stale and cannot be reused.
- Rapid switching, concurrent preview requests, typing during send preparation, and newer draft edits after successful send preserve ownership and content.
- No credentials appear in preview metadata; no model calls or agent creation occur merely from opening Context. Visible limitations distinguish the outgoing message from the final provider request.

## Boundaries and validation

No editing historical context/system instructions, provider wire dumps, exact token/cost promises, or automatic summarization calls. Test pure preparation, route range validation, and sandbox E2E; run unit suite, typecheck, lint, relevant E2E, and ownership checks. Never `next build` during dev.


## Implementation update (2026-09-18)

Implemented in ContextPanel and lib/prepare-outgoing.ts. Preview, send and queue preparation share reference, paste and image validation. Prepared snapshots are reused only for matching drafts/settings; source changes appear on explicit Refresh. Reference range metadata persists in drafts. Context remains an outgoing-message preview, not a provider wire dump or exact token estimate. It is opened from the right-panel selector, not a composer button.


## Delivery validation and platform scope

The product target is desktop web, per the user’s final clarification. No native shell feature or separate mobile design is introduced. Compact CSS only prevents overlap in a narrow browser window. Validation: all 542 unit tests and all 18 Chrome browser tests pass; TypeScript and lint pass. The final review also reran the transcript-search browser test after disabling historical-preview message mutations. Browser coverage includes server recovery, draft conflicts, navigation, saved tasks, context snapshots, output metadata, branch creation, inline diffs and exact transcript jumps. Tests use sandbox data without model calls. No packaged native-app validation was performed.
