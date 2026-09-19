# Web UI feature: right-panel Activity view

Status: implemented; original acceptance specification retained below. See implementation update for final integration and user-directed polish.
Source review: 2026-09-18, current working tree, with web-ui batches 1–3 being implemented concurrently. Re-read the final merged code before implementation.

## Outcome and shared right-panel contract

Supervise multiple Pi sessions without leaving the current conversation. Add Activity, Saved Tasks, Outputs, and Context modes to the existing right-side panel while retaining Files, Browser, and Diff.

This section is the shared shell contract for all four feature notes:

- Extract a small typed panel-mode controller and mode selector rather than duplicating panel state in each feature. Keep integration into `components/AppShell.tsx` narrow.
- At roomy widths use accessible mode tabs; when they do not fit, use a labeled mode dropdown. Seven modes must not squeeze into unreadable icon-only buttons. Preserve the existing panel resize behavior.
- Selecting a mode opens the panel and preserves the current conversation, composer draft, scroll position, open file tabs, and each mode's filter/selection. Changing modes must not send prompts or change cwd.
- Persist panel mode and open state through the existing workspace-state mechanism. Restore Activity/Saved Tasks/Outputs/Context even when no file tabs exist; current restoration ties opening to file tabs. Validate old persisted data and fall back to Files for unknown modes. URL-selected session/cwd still wins.
- Activity spans all projects; Saved Tasks has global/project scope; Outputs follows the selected session and leaf; Context follows the current composer. Each mode shows its scope in its header.
- On compact screens reuse the existing panel overlay, with a visible close action. Escape closes the topmost interaction, never an agent run underneath. Hidden modes must not retain interactive focus.
- Opening an output in Files preserves the Outputs selection and exposes a return action. Panel navigation must not add fake session-history entries.
- All visible labels/errors use the existing English and Simplified Chinese i18n system. Do not introduce hardcoded English notices.

Related specifications: [Saved Tasks](web-ui-feature-saved-tasks.md), [Outputs](web-ui-feature-session-outputs.md), [Context](web-ui-feature-context-preview.md), and [Git branches](web-ui-feature-git-branches.md).

## Existing foundations

- `app/api/agent/running/route.ts` exposes running IDs; the running-events endpoint supplies sidebar feedback.
- `lib/rpc-manager.ts` owns wrappers, prompt lifecycle, run IDs, queue state, and extension UI requests. `hooks/useAgentSession.ts` tracks phases for the selected session.
- Batch 3 owns notifications and browser feedback. Activity must consume the same lifecycle source, not implement another notification system.

## User-visible behavior

1. Header: All projects / selected project scope; Running / Needs attention / Recent / All filters; counts. Default is All projects + All.
2. Rows: session title, project, checkout path or short worktree label, current branch, status, elapsed time, latest activity, and queued-message count. Truncate previews, not the accessible label; full paths are available on demand.
3. Statuses: Running, Waiting for input, Completed, Failed, Stopped, and Interrupted (server restart). Running detail may say waiting for model, executing a named tool, retrying, compacting, or running a shell command. Waiting for input requires an outstanding actionable extension request; do not infer it from elapsed silence.
4. Active rows first; waiting rows before other active rows; recent terminal rows ordered by completion time. Retain the newest 100 terminal run records server-side; initially show 20 with Show more. One row per session shows its latest run; terminal statuses must not overwrite a newer run.
5. Open selects the session through the existing navigation handler. Waiting rows offer Open request; route to the session's existing extension UI rather than rendering a second response form.
6. Stop targets that row's session and run ID; disable while pending and show failures inline. A stale stop returns 409 and refreshes rather than stopping a newer run. Follow-up opens that session and focuses its composer; it does not send text automatically.
7. When two active sessions use the same canonical checkout, show a shared-checkout indicator with the other session titles. Worktrees of one repo are not automatically the same checkout.
8. Empty, loading, disconnected, and partial-error states are distinct. Loss of connectivity never turns all active rows into Completed.

## Data and API contract

- Add `GET /api/agent/activity` for a bounded snapshot and `GET /api/agent/activity/events` for snapshot/delta SSE. Use one Activity subscription while the view is visible; no per-row SSE or per-row polling. Hidden Activity stops its subscription. Existing sidebar lifecycle remains independent.
- A run record contains `sessionId`, `runId`, title, cwd/projectRoot, status, phase, startedAt, updatedAt, optional finishedAt, optional bounded error summary, pendingInput flag, and queue count. Refresh branch information per distinct checkout with a cache; do not spawn Git for every event.
- Derive state server-side from wrapper events. Retrying/compaction/extension-continued execution must remain active until logical settlement. Never classify the first `agent_end` as completion. Audit Bash exit codes, `prompt_error`, explicit abort, and extension-only runs separately.
- Sequence/version every snapshot/update. Reconnect loads a fresh snapshot and ignores older deltas. Persist bounded lifecycle metadata in the configured Pi agent directory under `web-ui/`, via atomic writes and a lock; do not persist transcript bodies, raw tool output, or credentials there. Mark persisted active records Interrupted on process startup; do not pretend to resume execution.
- Put lifecycle recording in a dedicated helper, with minimal rpc-manager hooks. Batch 3 and Activity must agree on run identity and settlement. Keep existing consumers of running IDs compatible.
- Server validates the expected run ID immediately before Stop under the lifecycle guard; a client-side check alone is insufficient. All mutations keep existing request-security checks.

## Acceptance checks

- Two isolated sessions in different projects appear without opening either transcript; phase/status changes reach Activity once and in order.
- Waiting input, retry, compaction, extension continuation, prompt failure, Bash failure, abort, and normal completion receive correct statuses. Reconnect does not duplicate or resurrect terminal runs.
- A stop for run A cannot stop newer run B. Follow-up targets the chosen session and preserves the previous session's draft.
- Restart classifies formerly active runs as Interrupted. Recent history is bounded and survives reload/restart.
- Shared checkout is identified; distinct worktrees are not mislabeled. Closing/hiding the panel cleans up subscriptions.
- Restore each non-file mode with zero file tabs; test session switches, keyboard navigation, and a compact viewport.

## Boundaries and validation

No scheduler, autonomous session creation, automatic retries of completed tasks, or subagent orchestration. Activity observes existing work and exposes explicit actions.

Use behavior tests with synthetic lifecycle events and isolated browser fixtures, then unit suite, typecheck, lint, and relevant E2E. Follow `web-playwright-pilot.md`; no paid model requests, real session mutation, or `next build`. Update fork ownership declarations/sentinels where the integration changes ownership; never remove a sentinel merely to pass tests.

## Implementation update (2026-09-18)

Implemented in `components/workbench/ActivityPanel.tsx`, `lib/activity.ts`, the runtime lifecycle hooks, and `/api/agent/activity`. One visible SSE subscription receives sequenced snapshots; run history is bounded and persisted, with interrupted recovery after server restart. The stop endpoint compares the live run id under the checkout guard. Project/checkout details refresh when new runs arrive. State coverage includes Bash, prompt settlement, retry/compaction, queued input and extension requests.

The shared panel now uses `lib/panel-modes.ts`, `PanelModeSelector`, and `app/workbench.css`. Browser hydration restores modes only after mount, even without file tabs. Following user review, Tasks and Context entry buttons were removed from the composer; Git shares the project/model metadata row. Visual direction is rounded, quiet surfaces, one header and secondary actions in dismissible overflow menus. Non-Git folders omit the branch control.


## Delivery validation and platform scope

The product target is desktop web, per the user’s final clarification. No native shell feature or separate mobile design is introduced. Compact CSS only prevents overlap in a narrow browser window. Validation: all 542 unit tests and all 18 Chrome browser tests pass; TypeScript and lint pass. The final review also reran the transcript-search browser test after disabling historical-preview message mutations. Browser coverage includes server recovery, draft conflicts, navigation, saved tasks, context snapshots, output metadata, branch creation, inline diffs and exact transcript jumps. Tests use sandbox data without model calls. No packaged native-app validation was performed.

## Diff simplification (2026-09-18)

Desktop-web Diff mode now presents one working-changes summary and expandable filename rows. Clicking a row loads its patch underneath; multiple files can stay expanded. Counts appear beside loaded files, and refresh updates open patches. The extra branch control, status-letter legend, file tabs and file-viewer metadata are absent from this review surface. File explorer diff actions and the file viewer's Diff button both route to the same inline review and select the requested file. Validated with real Git changes in the browser, including collapse and refresh; typecheck/lint and the unit suite passed.
