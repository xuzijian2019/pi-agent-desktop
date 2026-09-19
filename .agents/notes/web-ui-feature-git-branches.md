# Web UI feature: select and add Git branches

Status: implemented; original acceptance specification retained below. See implementation update for final integration and user-directed polish.
Source review: 2026-09-18, current working tree. Coordinate with batch 2 navigation ownership and the new right-panel features.

## Outcome

Make Git branch selection and creation explicit and discoverable for the selected project. Support existing local/remote branches and creating a branch from a chosen base, either in the current checkout or in a new worktree. This concerns Git branches, not Pi conversation branches.

## Existing behavior to retain

- The sidebar already has worktree switching, branch filtering, fetch, and in-place checkout through `/api/worktrees` PUT. POST creates a worktree and creates the branch at HEAD if missing.
- `lib/worktree.ts` provides branch/worktree listing, remote matching, `switchBranch`, `addWorktree`, and project resolution.
- Selecting a branch checked out elsewhere already navigates to that worktree. Preserve that behavior instead of attempting a second checkout of the same branch.
- Existing helpers strip remote prefixes for some display/listing purposes. Explicit remote selection needs full ref identity; do not guess between origin/foo and upstream/foo.

## Entry point and selector

- Put a visible branch control alongside the selected project/cwd in the composer project area. Also expose the same control in the right-panel Diff header. Both use one component/controller and one fresh branch inventory, not separate implementations.
- Display branch name, short worktree label when linked, and detached HEAD with short commit ID when applicable. For non-Git directories show `Not a Git repository`; do not offer implicit Git initialization.
- Dropdown contains search, current checkout, other worktrees, local branches, full remote-qualified branches, Fetch, and Create branch. Distinguish `Switch here` from `Open worktree` in each actionable row.
- Fetch is explicit and keeps existing noninteractive credentials/deadline behavior. Opening the selector refreshes local metadata without automatically doing a network fetch. Keep existing focus/visible-tab refresh behavior for external Git changes.
- Current branch is selected and has no redundant switch action. Existing branches in other worktrees offer Open worktree; route through standard cwd/session navigation so drafts are preserved.

## Create branch form

Fields:

1. Branch name, required and validated using Git's ref-name rules. Preserve the user's exact valid name; do not sanitize the Git ref. Directory sanitization is separate.
2. Base: default `Current HEAD`, displaying its branch and short SHA. User may select an existing local branch or full remote ref. Resolve to a commit SHA for the reviewed operation; do not silently use a moving ref at execution time.
3. Location: `Current checkout` (default) or `New worktree`. Show the exact affected checkout path, or planned worktree path before creation. If active work blocks switching here, explain and let the user choose New worktree.
4. Primary action label is `Create and switch` or `Create worktree`. No automatic prompt submission, commit, push, stash, or reset follows.

If the name exists, do not reinterpret Create as Switch or overwrite the branch. Show a name conflict with an explicit Select existing action. For remote tracking, explicitly choosing origin/foo creates/tracks that ref only when an appropriate local branch does not already exist; a local collision requires selecting the existing local branch or a different local name.

## Mutation safeguards and races

- In-place branch switch/create is blocked with 409 if a known live Pi run uses the same canonical checkout, even when another session is selected. Different worktrees remain usable. Client disabling is informative; the server must enforce the check.
- Serialize in-place mutations and prompt/Bash startup under a shared checkout guard so a run cannot start between checking activity and switching. Include new-session startup and existing-session prompt, steer/follow-up, extension continuation paths in the lifecycle audit; document the actual protection boundary. External CLI processes cannot be locked out by this application.
- Dirty checkout: show tracked/untracked counts and explain that local changes remain and Git may refuse conflicts. Require a second explicit `Switch keeping changes` action for an existing-branch switch. For create-from-current-HEAD, show that changes remain on the new branch and allow the clearly labeled creation action. Never force checkout, auto-stash, or discard changes.
- Dirty creation from a different base uses the same explicit keep-changes choice. Git refusal preserves files/branch and shows an actionable error. No repeated prompts after the user has accepted the same concrete operation; changed HEAD/status requires a refreshed review.
- Preview returns an operation token bound to canonical cwd, expected HEAD/ref, status fingerprint, target branch/base SHA, and location. Execution revalidates under the checkout guard; stale state returns 409 without mutation. Use bounded, short-lived tokens and retain request-security checks.
- New worktree uses the existing sibling directory convention, with collision detection for sanitized names. Never reuse an unrelated existing directory. Any cleanup after failure may remove only resources created by that attempt and only when verified unchanged; report partial success rather than deleting uncertain data.
- Late completion must not navigate over a newer user choice. Refresh affected Git state globally, but only change selected cwd/branch when the initiating navigation generation still owns selection.

## API and state changes

- Extend existing worktree listing with structured branch identities: full ref, display name, local/remote kind, remote name, commit SHA, checked-out worktree path, and current/detached metadata. Preserve existing response fields for current callers.
- Add `/api/git/branches/preview` POST and `/api/git/branches` POST for the reviewed `switch` / `create` operations; use dedicated branch-operation helpers built on `lib/worktree.ts`. Upgrade existing PUT/POST worktree mutation paths to the same guard/revalidation behavior so older UI paths cannot bypass it; preserve worktree deletion behavior separately.
- Every route validates allowed cwd, request origin, branch names, full target identity, and input size. Use `execFile` argument arrays and Git ref verification, never shell interpolation; reject option-like names and ambiguous refs.
- On success invalidate project-resolution caches, refresh branch/status/file views and Activity checkout labels. Do not rewrite historical session cwd or pretend that its saved conversation moved. Opening another worktree starts/selects a draft there through the existing navigation path.
- Integrate narrowly into ChatInput/ProjectPicker/DiffPanel; leave the conversation BranchNavigator unchanged.

## Acceptance checks

- Local switch, explicit remote tracking with two remotes sharing a branch name, existing branch in another worktree, detached HEAD, non-Git directory, and explicit fetch.
- Create from current HEAD/local/remote base into current checkout and a new worktree; verify actual branch tip, tracking configuration, and path after each operation.
- Duplicate/invalid/option-like names, sanitized directory collisions, stale HEAD/status/token, and partial worktree failures preserve unrelated data.
- Clean/dirty/conflicting checkout cases follow the stated prompts without stash/reset. Known active runs block in-place mutations server-side, including a concurrent run-start race.
- Navigation away during a delayed operation is not overridden. Existing drafts and file tabs survive; all branch labels update after success and external Git changes.

## Boundaries and validation

No branch deletion, merging, rebasing, committing, pushing, automatic task launch, or conversation-branch changes. Use temporary Git repositories with local bare remotes and synthetic live-run fixtures, never this working checkout for mutation tests. Run focused Git tests, unit suite, typecheck, lint, relevant sandbox E2E, and ownership checks. Never development `next build`.


## Implementation update (2026-09-18)

Implemented in BranchControl, lib/git-branches.ts and /api/git/branches including preview tokens. Local/remote full refs, alternate local tracking names, base choice, existing-worktree navigation and current/new-worktree creation are connected. In-place mutations share checkout admission with wrapper-managed starts and validate HEAD, dirty bytes and selected refs. No stash/reset/force action is added. Git sits between project and model; non-Git folders omit it. Empty repositories show their current branch but require an initial commit for mutations.


## Delivery validation and platform scope

The product target is desktop web, per the user’s final clarification. No native shell feature or separate mobile design is introduced. Compact CSS only prevents overlap in a narrow browser window. Validation: all 542 unit tests and all 18 Chrome browser tests pass; TypeScript and lint pass. The final review also reran the transcript-search browser test after disabling historical-preview message mutations. Browser coverage includes server recovery, draft conflicts, navigation, saved tasks, context snapshots, output metadata, branch creation, inline diffs and exact transcript jumps. Tests use sandbox data without model calls. No packaged native-app validation was performed.

The branch picker is now a compact anchored popover above the composer Git button, matching model-picker placement. It stays within the composer's horizontal bounds, scrolls when space above is limited, and follows window resize/scroll. The centered dialog position is removed. Browser checks verify its position and exercise branch creation; typecheck and lint pass.
