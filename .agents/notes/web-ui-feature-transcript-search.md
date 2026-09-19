# Full-transcript search and exact result navigation

## Scope

Desktop web, after batches 1–3. Sidebar metadata search remains unchanged. Add Search to the right-panel selector; no composer buttons. Literal, case-insensitive terms (AND), with quoted phrases; no semantic/embedding service or model calls. Search completed user/assistant text blocks, tool arguments, tool output, and Bash command/output across every stored conversation branch. Images, binary payloads, hidden thinking and arbitrary filesystem contents are excluded.

Filters: all projects or a canonical project root, and all sessions or one session. Results contain session title, project, source kind and a matching snippet. Search is explicit (submit or Enter), cancellable, paginated, and preserves the composer draft. File mtime/size keys invalidate a bounded in-memory transcript cache. Oversized/unreadable files are reported as skipped, never silently presented as exhaustive results.

## Exact jump

Result identity includes session ID, entry ID and source field. Revalidate the result before navigation. Open the conversation read-only at the matching entry using the shared session context builder; an entry on an inactive branch selects that historical path. Ending the view at the matched entry also exposes pre-compaction text. Search must never call navigate_tree or send a prompt. Paired tool results reveal their assistant tool-call container. Expand process groups, tools and long text for the target, scroll to it, and highlight matching text. Use the exact indexed source as an accessible match excerpt when rendered Markdown/tool summaries omit raw syntax. Session switches or newer jumps cancel stale navigation.

## Validation

Pure tests: case-insensitive terms/phrases, snippets, branch entries, tool arguments/results and image exclusion. Sandbox browser test: search an inactive-branch tool result, navigate to its entry, reveal/highlight the content, keep the draft, verify the JSONL branch is unchanged. Check filter/pagination validation and no model startup from search. Run typecheck, lint, unit tests and relevant browser tests.

## Implemented — 2026-09-19

`GET /api/transcript-search` searches known session files and live session entries. The same route revalidates a result and returns historical context when given session, entry ID and field. `lib/transcript-search.ts` owns indexing, snippets, filters, stale-cursor checks and context resolution. `TranscriptSearchPanel` lives in the right panel; `ChatWindow` renders the historical preview with expansion and match highlighting. Return to conversation restores the live view and retained draft.

Each response processes at most 25 sessions, 50 results or six seconds. The panel continues through older sessions until it finds a result page or reaches the end. The cache holds at most 100 files and 32 MiB of indexed text; disk sessions larger than 32 MiB are explicitly reported as skipped. No external indexing service, model calls or persistent search database are used.

Validation: TypeScript and lint pass; all 542 unit tests and all 18 Chrome browser tests pass. Coverage includes pagination, project/session filters, rewritten files, stale results, pre-compaction history and inactive-branch output navigation without session-file changes.

Final review: historical previews also suppress message edit, continue and fork controls. The browser test includes a later user turn and verifies those controls are absent; it waits for normal session startup before comparing the file before and after search. Typecheck, lint and all 542 unit tests pass, and the strengthened search browser test passes.
