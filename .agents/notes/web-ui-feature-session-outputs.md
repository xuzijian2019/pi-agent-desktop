# Web UI feature: right-panel session Outputs shelf

Status: implemented; original acceptance specification retained below. See implementation update for final integration and user-directed polish.
Source review: 2026-09-18, current working tree; reconcile with final web-ui batches 1–3 before implementation.

## Outcome

Find and open a session's useful deliverables without searching the transcript or filesystem tree. Add an Outputs mode to the right panel under the shared contract in [Activity](web-ui-feature-activity-view.md).

## Existing foundations

`FileViewer.tsx` already previews source, diffs, Markdown, images, audio, PDF, and DOCX. The files API provides metadata/downloads and applies allowed-root and session-reference checks. `lib/session-file-references*.ts` already recognizes session-linked paths. Reuse these capabilities; do not implement a second preview or broad filesystem scanner.

## What qualifies as an output

- Default scope is the currently selected session's displayed branch/leaf. Label this explicitly. With no selected session show an empty state, not all project files.
- Automatically list existing local file links explicitly presented in assistant text, plus files successfully created through a recognized write tool when they are known document/media/output formats. Normalize both native and normalized tool-call shapes using existing helpers.
- A tool call alone is not success: pair toolCallId with its result and omit failed writes. Merely reading a file does not make it an output. Source edits and Git dirty files belong in Diff, unless explicitly linked or pinned as deliverables.
- Add Pin to outputs to the file viewer and to resolvable local file links in messages. Any supported local file can be manually pinned, including source code. No automatic inference from arbitrary Bash text, no extension-based recursive directory scan, and no claim that every artifact can be discovered.
- A custom tool without recognized structured file metadata is not guessed to be a producer. It can still expose an assistant file link or be pinned manually.
- Normalize paths against the producing session's cwd; deduplicate by canonical local path within the current session. Preserve multiple source entry references. Do not deduplicate by basename.

## Shelf behavior

- Header: session title, Refresh, and All / Documents / Images / Audio / Other filter. Search filenames/labels locally. Pinned items first; other items in most-recent-source order.
- Each item: filename, optional user label, relative path, kind, current file size, source turn, and availability. Thumbnail only for supported images; otherwise use existing icons.
- Actions: Open preview, Download, Go to message (when provenance exists), Pin/Unpin, Rename label, and Hide from shelf. Hiding/unpinning never deletes the file. Offer Show hidden and Restore for hidden entries.
- Open switches the right panel to the existing Files preview, retaining shelf scope/selection and a Back to outputs action. Download uses the existing server checks and browser/Tauri behavior.
- Go to message expands lazy/collapsed content and scrolls to the stable entry ID. Automatic discoveries outside the selected branch are not shown. Explicit pins from another leaf are shown with an Other branch badge; Go to message explicitly navigates to their source leaf.
- Missing/deleted/moved or inaccessible files remain identifiable but disable Open/Download and show why. Do not search the entire machine to find a moved file.
- Show `Current file` for every item: this is a pointer to live disk content, not a versioned snapshot of what the agent originally produced. If mtime differs from the recorded discovery/pin metadata, show Changed since added, without claiming who changed it.
- Streaming can add successful outputs after their source event; refresh after logical run settlement and file changes. A late response from another session/leaf must never populate the current shelf.

## Data and API design

- Add `GET /api/sessions/[id]/outputs?leafId=...` to derive candidates from session entries/live state and merge user shelf metadata. Do not instantiate an agent just to read outputs. Validate leaf ownership against the requested session.
- Record: stable itemId, canonical path, display label, kind, source entry IDs/leaf information, discovery reason, pinned/hidden flags, addedAt, optional observed file size/mtime, and current availability. Auto IDs derive deterministically from session ID and normalized path, not array index.
- Manual pins and label/hide overrides live under `<configured Pi agent directory>/web-ui/outputs/<sessionId>.json`; validate UUIDs before constructing paths. Atomic writes, per-session lock, revision checks for conflicting edits. Never rewrite Pi transcript entries.
- Use POST/PATCH/DELETE endpoints under the session's outputs route for metadata operations. DELETE removes the pin/override record only; define unpin separately from hide so automatic candidates do not mysteriously reappear as pinned.
- Pin validates the path through existing file authorization. Being stored in shelf metadata is not authorization. Revalidate on every metadata/read/download operation, including symlinks and paths after worktree deletion.
- Paginate derived output results (50 per page), bound label/pin payloads, and cache by session content revision + leaf + shelf revision. File availability is refreshed separately; do not cache permission success indefinitely.

## Acceptance checks

- Successful document write and assistant-linked image appear; failed write, read-only tool call, unrelated dirty file, and arbitrary output-looking Bash text do not.
- Manual source-file pin, duplicate paths, same basename in different folders, rename label, hide/restore, and unpin behave distinctly and survive reload.
- Branch changes show correct candidates; cross-branch pins are labeled and navigate correctly. Unflushed live sessions work.
- Missing files, modifications after discovery, symlink escapes, unauthorized pins, and deleted worktrees are handled without broadening access.
- Preview/download reuse existing viewers; Go to message handles collapsed and lazy history. A delayed session A request cannot overwrite session B's shelf.
- No generated-file snapshots or file deletions occur from shelf operations.

## Boundaries and validation

No cloud uploads, automatic publishing, filesystem cleanup, versioned artifact storage, or AI-generated artifact classification. Test with synthetic session files and sandbox files; run unit suite, typecheck, lint, relevant E2E, and ownership checks. No paid requests, real session mutation, or development `next build`.


## Implementation update (2026-09-18)

Implemented in OutputsPanel, lib/session-outputs.ts and /api/sessions/[id]/outputs. Successful document/media writes and local Markdown links generate canonical deduplicated candidates. Per-session revisions persist labels, pins and hidden state without deleting files. Current file availability/change indicators, preview/download and source-message navigation are connected. The file read gate accepts canonical paths within authorized roots, including macOS /var aliases, while retaining resolved-path checks. More actions contains metadata operations.


## Delivery validation and platform scope

The product target is desktop web, per the user’s final clarification. No native shell feature or separate mobile design is introduced. Compact CSS only prevents overlap in a narrow browser window. Validation: all 542 unit tests and all 18 Chrome browser tests pass; TypeScript and lint pass. The final review also reran the transcript-search browser test after disabling historical-preview message mutations. Browser coverage includes server recovery, draft conflicts, navigation, saved tasks, context snapshots, output metadata, branch creation, inline diffs and exact transcript jumps. Tests use sandbox data without model calls. No packaged native-app validation was performed.
