# Web UI batch 2: session selection, search, and cache correctness

Status: implemented under the user's 2026-09-18 request; original review retained below.
Review baseline: `bb7eb66`, 2026-09-18, Chrome on macOS 27.0.
Priority: second, after [draft persistence](web-ui-batch-1-draft-persistence.md).

## Outcome

The latest navigation action always wins. Session selection stays recoverable when reads are slow or fail. Searching the sidebar does not alter the available project inventory, and browsing many conversations does not retain an unbounded cache.

## Confirmed findings

1. **An old click overrides New Session.** `SessionSidebar.handleSelectSessionFromList()` increments a selection counter and waits for prefetch before selecting. `handleNewSession()` does not invalidate that counter. An isolated execution of the production callbacks produced `new session` followed by `selected:older-click` when the earlier prefetch resolved. This was a deterministic callback reproduction, not a timed manual browser race.
2. **Prefetch has no deadline.** `lib/session-data-cache.ts` uses a bare fetch and retains pending promises. A hung prefetch can block selection before `useAgentSession.loadSession()` reaches its existing timeout/retry handling. This is established by the source path; the review did not deliberately hang the live server.
3. **Search changes unrelated project controls.** In the live UI, searching for `setup-remote-llama-server-pc` returned no sessions despite the project being present. Matching only considers session name and first message. The filtered project groups also feed `onProjectsChange`, so an empty search result disables the composer's project picker.
4. **Cache expiry is not eviction.** Cached payloads are removed for age only when the same session is accessed again. There is no entry/byte cap or sweep, so distinct visited sessions can remain retained indefinitely. This is a source-confirmed retention path, not a measured memory-pressure incident.

## Implementation scope

- Review `components/SessionSidebar.tsx`, `lib/session-data-cache.ts`, `components/AppShell.tsx`, and `hooks/useAgentSession.ts` together.
- Use one navigation generation/cancellation mechanism covering session picks, New Session, project/worktree changes, and unmount. Every asynchronous completion must check ownership before changing selection.
- Give prefetch a bounded lifetime and ensure failed or abandoned requests leave the pending map. Keep prefetch optional: selecting a conversation must eventually reach a visible loading/error/retry state even if warming fails.
- Preserve warmed-session rendering and the existing scroll/visible-count restoration. Avoid reintroducing loading flashes or resetting the composer unnecessarily.
- Derive the full active project inventory before applying the sidebar session query. Filtering the displayed list must not modify composer project choices.
- Match project names and paths as well as existing session fields. Full transcript search is a separate feature, not part of this fix.
- Bound cached payload retention with an explicit eviction policy. Review invalidation after delete, branch navigation, and session updates, and prevent stale in-flight reads from repopulating invalidated entries.

## Acceptance checks

- Hold a session read, choose New Session, then release the read: the new composer remains selected. Repeat with a project change and unmount.
- For A then B selections, release responses in either order: B remains selected.
- Failed, aborted, and stalled prefetches yield recoverable UI within a documented bound and permit retry; no permanently shared pending promise remains.
- Searching a project name finds its sessions even when their titles do not contain that name. Empty results leave the composer project picker usable with its full inventory.
- Cache size stays bounded after many distinct reads; expired/deleted/invalidated data is not reintroduced by a late response.
- Existing scroll restoration, live/unflushed session browsing, and rapid switching remain correct.

Use controlled deferred responses in focused tests to exercise races. Add browser coverage for the user-visible selection outcome rather than asserting only source strings. Keep the normal E2E server on its isolated port/distDir; do not stall the user's running server. Run `npm test`, typecheck, lint, and relevant E2E; never `next build` during development.

## Boundaries

Do not change session JSONL format, execute paid model requests for these tests, or weaken fork-extraction sentinels. Browser history and new-tab behavior belong to [batch 3](web-ui-batch-3-browser-navigation-and-feedback.md). This note records proposed work, not authorization to implement or publish it.

## Implementation and verification (2026-09-18)

- Sidebar selection is synchronous: prefetch never owns a deferred navigation callback. Optional warming expires after 3 seconds. Session reads check session generation and read ownership, including unmount and branch navigation.
- Project inventory is derived before search; search also matches project/cwd paths. Cached payloads use LRU eviction with 20 entries, approximately 32 MiB of serialized UTF-16 data, and a 10-second TTL swept on access/write. Oversized entries are not cached. Invalidating or superseding a prefetch prevents late cache writes.
- Focused tests cover stalled/failed prefetch retry, invalidation races, expiry and capacity. Browser tests cover held reads followed by New Session, history navigation with draft restoration, native session links, and project search with an intact composer picker.

Verification passed: `npm test` (528 tests), `node_modules/.bin/tsc --noEmit`, `npm run lint`, and `PW_CHANNEL=chrome npm run test:e2e` (8 tests). The focused composer/reconnect E2E also passed after the final retry adjustment. Tests use sandbox sessions and browser contexts; no model requests, commits, publishing, or development-time production build.
