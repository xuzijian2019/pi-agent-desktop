# Web UI feature: right-panel Saved Tasks

Status: implemented; original acceptance specification retained below. See implementation update for final integration and user-directed polish.
Source review: 2026-09-18, current working tree. Build after web-ui batches 1–3 and recheck their final draft/navigation APIs.

## Outcome

Create reusable named task setups combining a starting prompt, model, effort, and tool preset. Applying a saved task prepares a new conversation draft; it never runs immediately. This is a template library, not a scheduler or a list of past sessions.

Use the shared panel contract in [Activity](web-ui-feature-activity-view.md). Add Saved Tasks as a right-panel mode, with a shortcut from the empty new-conversation state.

## Existing foundations

- `ChatInput.tsx` already lists built-in, extension, prompt, and skill slash commands. `rpc-manager.ts` discovers Pi prompt templates through `get_commands`.
- Model/effort/tool selection and atomic session startup already exist. Draft persistence is being changed in batch 1; use that final API.
- `lib/startup-preferences.ts` persists explicit startup choices globally. Applying a task setup must not accidentally change global defaults.

## Library and editor

- Header: search by name/description and All / Global / This project scope. List names, brief descriptions, and model/tool badges; offer New, Edit, Duplicate, Delete, and Use.
- Project-scoped records are keyed by canonical `projectRoot`, so they work across worktrees. Global records are available in every project. No saved record contains a fixed worktree path, Git branch, credential, or live session ID.
- Editor fields: required name (1–80 characters), optional description (up to 500), prompt body (up to 128 KiB UTF-8), scope, model (`inherit` or provider/modelId), effort (`inherit`, `auto`, or a supported level), tools (`inherit`, `none`, `default`, `full`). Use explicit labels explaining inherit versus auto.
- `inherit` uses the new composer's current selection or normal defaults. `auto` explicitly clears a thinking override and delegates to Pi's default/clamping behavior. For model-dependent effort, display the effective clamped value returned at session creation.
- Provide Save current setup from a new draft, and Save as task on a user message. Both open the editor first. Copy textual prompt only; warn about and strip unresolved attachment/paste/session-reference placeholders unless their actual text is deliberately included. Never capture image payloads or expanded past transcripts invisibly.
- Preview shows the prompt and effective settings. Unknown/deleted/unauthenticated/out-of-scope models are visibly invalid; require a replacement or Inherit before Use. Do not silently select an unrelated model.
- Deleting a saved task deletes only its template record, never sessions created from it. Duplicate gets a new stable ID.

## Applying a setup

1. Use on an empty new composer fills its prompt and applies the effective settings; leave focus in the composer. No AgentSession or model request is needed just to browse/apply.
2. If a new draft already has content, show Keep current draft / Replace draft / Append task prompt. Replace and Append change nothing until selected. Both apply the setup's explicitly selected settings and show the resulting values; Append inserts two newlines between nonempty prompt bodies.
3. From an existing session, Use opens a new draft in that session's selected checkout through the standard navigation mechanism, preserving the existing session and draft. If the target new-draft slot is occupied, use the same conflict choice. Do not change model/tools on the existing session.
4. If no project is selected, require project selection before preparing the draft. Project-only templates are unavailable outside their project.
5. Once applied, users can freely edit text/settings; no live binding back to the template. Later template edits do not alter drafts or running sessions.
6. Persist applied text and settings together so reload cannot restore the prompt with unrelated settings. A failed draft save stays visible under batch 1's rules.
7. Mark settings originating from the setup as per-draft overrides. Pass them atomically to session construction but do not write them to global Pi defaults or global last-picked preferences. Manual toolbar choices keep their established behavior. Add an explicit provenance flag/typed structure, not timing-dependent setter replay.

## Persistence and API

- Store versioned records server-side at `<configured Pi agent directory>/web-ui/saved-tasks.json`, using a dedicated helper, atomic replacement, and a file lock. Do not edit auth.json/settings.json or Pi session JSONL for this feature.
- Record shape: id, revision, name, description, prompt, scope (`global` or canonical projectRoot), model selection, effort selection, tools selection, createdAt, updatedAt. Collection responses include the revisions needed for safe edits.
- Add `/api/saved-tasks` GET/POST and `/api/saved-tasks/[id]` PATCH/DELETE. PATCH/DELETE require the expected revision; stale edits return 409 and offer Reload or Save as copy. Validate field and collection size limits (maximum 500 records), scope access, and request origin server-side.
- Reload on mode open/window focus; after mutations notify other browser tabs to refetch. Do not rely on a stale whole-collection client write.
- Reuse existing Pi prompt templates as an import source: Import from Pi prompt opens an editable copy in this library, with attribution to its source path. It must not overwrite the original Markdown file. No arbitrary argument/variable engine in v1; Pi template argument syntax must be shown as literal text and flagged for editing before import if unresolved.

## Acceptance checks

- Create/edit/duplicate/delete across global and project scopes; linked worktrees share project tasks, unrelated projects do not.
- Apply from empty/new/occupied/existing sessions without sending a request or losing another draft. Reload restores text and all applied settings together.
- Unsupported models and clamped effort are handled visibly; inherited versus explicit settings behave as defined.
- Starting a saved task uses its model/tools/effort, emits no duplicate startup setters, and leaves global defaults unchanged.
- Concurrent edits return a recoverable conflict; storage errors do not report success; deleting a template does not affect existing drafts/sessions.
- Import reads Pi templates without modifying them; invalid payloads and unauthorized project scopes are rejected.

## Boundaries and validation

No recurring tasks, automatic submission, Git checkout on Use, custom tool-permission framework, or prompt-variable language. Branch choice remains explicit through [Git branches](web-ui-feature-git-branches.md).

Test helpers/API behavior and sandbox browser flows; run unit suite, typecheck, lint, relevant E2E. No real credentials, paid requests, or development `next build`. Preserve ownership sentinels and update the ownership manifest for new integration boundaries.


## Implementation update (2026-09-18)

Implemented in SavedTasksPanel, lib/saved-tasks.ts and /api/saved-tasks. Global/project scope, optimistic revisions, create/edit/duplicate/delete, Pi prompt import, and draft-only Use/Replace/Append are connected. Setup overrides travel with the draft and suppress global startup preference writes. Capturing a template strips attached reference snapshots and images; pasted prompt text is retained. More actions contains capture/import and duplicate/delete.


## Delivery validation and platform scope

The product target is desktop web, per the user’s final clarification. No native shell feature or separate mobile design is introduced. Compact CSS only prevents overlap in a narrow browser window. Validation: all 542 unit tests and all 18 Chrome browser tests pass; TypeScript and lint pass. The final review also reran the transcript-search browser test after disabling historical-preview message mutations. Browser coverage includes server recovery, draft conflicts, navigation, saved tasks, context snapshots, output metadata, branch creation, inline diffs and exact transcript jumps. Tests use sandbox data without model calls. No packaged native-app validation was performed.
