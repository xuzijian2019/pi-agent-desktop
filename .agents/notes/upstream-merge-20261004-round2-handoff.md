# Upstream merge record — 2026-10-04, round 2 of 3

Resolution rule for this round (from the user, mid-merge): where upstream and
the fork change the same thing in large, incompatible ways, follow upstream;
keep the fork only where both can coexist. Under it, mobile Enter and fork
during a run moved to upstream's behavior. The composer's model / effort menus
stayed the fork's because upstream's new behavior (the default star) fits
into them; swapping in `ModelSelector` would drop the fork's `/model` menu
opening and composer width tiers, which upstream's widget has no place for.
The topbar UI the fork removed earlier at the user's request (More menu,
Tools / System prompt / Session stats panels) was not part of this round's
upstream change and stays removed.

Two-parent merge of abcwyc/pi-agent-desktop `c5a70eb` (an intermediate commit
on `upstream/main`, not its tip) into round 1's result `855fb1f`
(`merge/upstream-round1-26eb188`; `main` was still at `60ee9db` when this
round started). Work branch: `merge/upstream-round2-c5a70eb`. Plan and round 1:
`.agents/notes/upstream-merge-20261004-handoff.md`.

`c5a70eb` is abcwyc's merge of pi-web main@6fcd7d4 (v0.10.0, pi SDK 1.0.0):
MCP + Code mode (ADR 0006), 289 files. Two first-parent commits since
`26eb188` (`abad019`, `c5a70eb`). 26 files conflicted: AGENTS.md,
app/api/project-trust/route.ts + route.test.mjs, app/api/worktrees/route.ts,
app/native-theme.css, components/AppShell.tsx, ChatInput.tsx,
ChatInput.test.mjs, ChatWindow.tsx, DirectoryPicker.tsx, MarkdownBody.test.mjs,
McpPanel.test.mjs (modify/delete), MessageView.tsx, SettingsPanel.tsx,
SettingsPanel.test.mjs, ToolDefinitionsPanel.test.mjs, restored-wiring.test.mjs,
hooks/useAgentSession.ts, useAgentSession.test.mjs, useKeyboardShortcuts.ts,
lib/api-types.ts, lib/i18n/messages/en.ts, zh-CN.ts,
lib/rpc-manager-shutdown.test.mjs, lib/rpc-manager.ts, scripts/fork-ownership.json.

## Integrated from upstream

- ADR 0006 runtime: `lib/builtin-extensions.ts` (codemode / tool-search / mcp
  built-ins), per-session MCP host, read-only MCP policy, codemode views,
  nested tool events slimmed on the wire. `resolveActiveToolNames()` replaced
  `withExtensionTools()`; `navigateTreeKeepingToolSelection()` re-applies the
  selection after `navigate_tree`.
- Settings › MCP (`McpConfig`, `McpAddServer`, `McpSignIn`, `/api/mcp*`), as a
  new `mcp` section of the fork's settings dialog and its settings-entry menu.
  A bare `/mcp` opens it when pi's built-in MCP extension owns the command
  (`onOpenSettings`, wired AppShell → ChatWindow → useAgentSession). The round 1
  stopgap (`McpPanel`, `lib/mcp-config.ts`) is deleted, as upstream did.
- Project trust: the trust dialog lists the project's MCP servers
  (`GET /api/project-trust` reads `.pi/mcp.json` without running anything);
  cwd validation goes through `validateMcpProject()`.
- upstream #871: browser model picks are session-scoped;
  `lib/startup-preferences.ts` is gone. Saving a default is now its own action,
  the star in the composer's model and reasoning menus (`PUT /api/models/default`).
- In-place history edit: "Edit from here" prefills the composer and marks the
  bubble (`.is-editing`, Cancel action); the branch moves only when the edit is
  sent (`handleNavigateRef` in `handleSend`). It replaces the fork's
  navigate-then-edit, which moved the branch on click.
- Extension dialogs and custom panels queue by request id with "+N waiting"
  counts; queued UI is dropped when `set_tools` rebuilds the wrapper.
- Enter / Ctrl+Enter send mode (Settings › General › Chat) and
  `submitsSlashCommandOnEnter()` (plain Enter completes a slash command in
  Ctrl+Enter mode).
- Thinking level can change while a run is busy (#851): the composer's effort
  button is no longer disabled while streaming.
- Mobile keyboards: Enter inserts a line break, Ctrl/Cmd+Enter sends (the fork
  sent on plain Enter). The fork's queue mapping (Enter follows up,
  Ctrl/Cmd+Enter steers) is unchanged.
- Fork from a user message stays available while the agent runs; only a bash
  command blocks it. Edit still waits for any run. In the fork's memoized list
  this is `bashRunningRef` in `stableHandleFork` plus two CSS hooks
  (`data-bash-running` hides the action group, `data-session-busy` hides only
  `.msg-edit-action`).
- Truncated last answers offer compaction in place (`recoverTruncation`),
  re-keyed process groups when a turn gains or loses its answer, grouping of a
  history page that starts mid-turn.
- Status line names auto-compaction (`lib/chat-phase-label.ts`, replacing
  ChatWindow's local `phaseLabel`). Branch switches are locked while a run,
  bash command or compaction is active (`branchSwitchLocked`).
- DirectoryPicker "New directory" (select mode only), worktree removal with
  submodules (`worktreeRemovalRequiresForce`), Esc handling via
  `handleGlobalEscape()`, keepLineBreaks for user messages, MCP tool labels,
  codemode call lists, `branchesLockedWhileRunning` string in all 3 locales,
  `browserslist` and `@types/mdast` in package.json.

## Kept from the fork

- Topbar without the More menu, Tools / System prompt / Session stats panels,
  and the Full history button. `SystemPromptPanel` / `ToolDefinitionsPanel`
  stay unmounted (`ToolDefinitionsPanel.test.mjs` keeps the fork assertion).
- The fork's composer: its own model and effort menus (not upstream's
  `ModelSelector` / `SelectorRow`), div shell (not upstream's disabled
  fieldset), `dispatchBuiltin` / `prepare()` send path, no composer compact
  control, no completion sounds.
- ChatWindow's memoized message list with stable fork/edit callbacks gated at
  call time, not upstream's prop toggling.
- `fork-ownership.json` baseline stays pi-web 96966e5, as upstream's own
  manifest does until round 3 (`d790b34` moves it to 6fcd7d4).

## Notable resolutions

- **project-trust GET**: kept the fork's "missing folder is a status" answer
  (`{ requiresTrust: false, trusted: false, decision: null, inherited: false,
  cwdMissing: true }`) that AppShell's `activeCwdMissing` relies on, but only
  for a path inside the allowed roots, checked lexically before
  `validateMcpProject()`. A missing path outside the roots now gets upstream's
  403 `cwd-denied`, where the fork used to answer `cwdMissing` for any path.
  POST takes upstream's validation (a missing folder is 403, not a 400 naming
  the path).
- **Default star in fork menus**: `ComposerOptionRow` in ChatInput renders the
  fork's `.composer-option-row` and, when `star` is given, upstream's default
  marker / "use and save as default" button (styles at the end of
  `native-theme.css`, always visible on `hover: none`). Saving also updates
  the draft setup like a normal pick.
- **useAgentSession render-phase reset** (the fork keeps the hook mounted
  across session switches, upstream remounts): the reset now also clears the
  extension UI queues, calls `clearSlashCommands()` (moved above the reset so
  it can be called there; it bumps the request generation, so a stale
  `get_commands` cannot answer a bare `/mcp` in the next session), and
  re-reads the pending history edit for the new session.
- `rpc-manager`: `navigateTreeKeepingToolSelection()` prefers the fork's
  session-level tool mode (`readSessionToolNames`) over upstream's per-branch
  selection, as `startRpcSession()` already does.
- `useKeyboardShortcuts.ts` imports `../lib/desktop-updater.ts` relatively: the
  new upstream tests load the hook under plain node, which cannot resolve `@/`.
- Icon-only mobile send button got `aria-label={t("chat.send")}`.
- Tests adapted to the fork structure (assertions kept, regexes or fakes
  changed): e2e `side-recap.local.spec.ts` narrow-layout `/side test` sends
  with Control+Enter (mobile Enter is a line break now), MobilePwaLayout (template className, div shell), ChatInput /mcp
  handler tests (fork send context), default-star test, process-details key,
  mcp-slash-command (`onSessionStatsPanelOpen: openStats`), useAgentSession
  (two locked BranchNavigators; compaction reported in the status line instead
  of a composer control), rpc-manager-tool-exposure fake gains
  `appendCustomEntry`, restored-wiring bubble lookup.
- Drift: against 96966e5, `lib/directory-browser.ts` (42) and
  `components/BranchNavigator.tsx` (32 structural) rise to medium only because
  they now carry pi-web 6fcd7d4 code; recorded in their reasons.

## Known issues

- `app/api/cwd/browse/route.test.mjs` "read-denied directory" still fails when
  the suite runs as root (pre-existing, see round 1).
- Lint: 0 errors, 27 warnings. Round 1's 26 plus one in upstream code:
  `components/ProjectPicker.tsx` `closeDropdown` is an unneeded `useCallback`
  dependency since upstream's own change there; left as upstream wrote it.
- AGENTS.md is upstream-owned and now carries abcwyc's segment G notes, which
  mention a More menu and a mobile toolbar group this fork does not have.
- The composer star was checked by typecheck and source tests, not in a
  browser: the e2e sandbox has no models, so the menus have no rows.

## Verification

- Typecheck clean.
- Lint 0 errors, 27 warnings (see Known issues; a throwaway e2e config adds
  one more while it exists).
- Unit: 2,639 tests, 2,638 passed, 1 failed (the root-only `cwd/browse` case).
- Release pins / component manifest valid (pi 1.0.0, pi-web 0.10.0); drift
  labels match the 96966e5 baseline; CSS baseline test passes; no conflict
  markers.
- Browser, full Playwright suite (throwaway config with
  `executablePath: /opt/pw-browsers/chromium`, not committed):
  **39 passed, 1 failed** (7.7m).
  - Earlier runs that did not count: one where the e2e dev server died on a
    Turbopack internal panic at test 2 (stale `.next-e2e` cache after I had
    killed a run; cleared, not a code issue), and one with 3 failures:
    side-recap narrow layout (fixed above), slash-menu `/session` (passed
    alone, in its spec file, and in the final full run), server-recovery.

## OPEN: server-recovery e2e fails (not fixed, user asked to defer)

`tests/e2e/server-recovery.spec.ts` fails in the final full run **and alone**:
after the owned `next dev` is stopped, the offline alert never appears within
35s. Round 1's first full run failed the same way, then passed alone and in a
rerun, so this may predate round 2. Not yet bisected.

What the trace shows (`test-results/server-recovery-*/trace.zip`):
- the page's own `/api/home` probes (`lib/desktop-connection.ts`) run at load
  and then **never again** after the server stops. In a browser build the
  healthy interval is 20s, then 2s rechecks, 2 failures → offline, so the
  alert should appear at about 22s. The timer is not firing, or the probe
  returns early (`stoppedRef.current` true without a re-run of the effect).
- requests in flight at the stop (`/api/models`, `/api/project-trust`) end
  with ERR_EMPTY_RESPONSE; `AppShell`'s project-trust effect logs "Failed to
  load project trust: TypeError: Failed to fetch", which the Next dev overlay
  opens as an issue. A lazily loaded dev chunk fails to load after the stop.
- `lib/desktop-connection.ts` itself is unchanged since `60ee9db`.

Next steps:
1. Run the spec alone on `855fb1f` (round 1) and on `60ee9db` (pre-merge) in a
   scratch worktree (`git worktree add --detach <dir> <sha>`, `npm ci`), to
   tell a round-2 regression from an older one.
2. If round 2 caused it, suspects are what changes AppShell / ChatWindow
   effects on load: the `useAgentSession` render-phase reset (now calls
   `clearSlashCommands()` and re-reads the pending edit), and the
   project-trust route (a missing-folder fast path runs before
   `validateMcpProject()`).
3. Instrument `useDesktopConnection` (log schedule / probe / cleanup) and run
   the spec headed or with trace to see whether the timer is armed after the
   stop.

## Next session: how to continue

1. `git fetch origin && git checkout merge/upstream-round2-c5a70eb`
   (branch is pushed; it stacks on `merge/upstream-round1-26eb188`).
   `main` is still `60ee9db`. Fast-forwarding `main` to this branch is the
   user's call; ask first.
2. Settle the OPEN server-recovery item above, or carry it into round 3.
3. Round 3: `git merge --no-ff f66ba13` (= `upstream/main` tip: PR #70
   cost/branch/model features, pi SDK 1.0.2, desktop 0.5.0/0.5.1, and
   `d790b34`, which moves the drift baseline to pi-web 6fcd7d4). Same skill
   (`.claude/skills/upstream-merge/SKILL.md`), with the user's rule from this
   round: large incompatible changes follow upstream, keep the fork only where
   both fit. In round 3:
   - regenerate the lock with `npm install` for pi 1.0.2 and update
     `scripts/release-component-pins.json` + the component manifest;
   - re-measure drift against `6fcd7d4` (`node scripts/measure-fork-drift.mjs
     6fcd7d4`) and refresh `scripts/fork-ownership.json` numbers, including
     the two entries round 2 bumped only because of the stale baseline;
   - run `node scripts/upstream-css-baseline.mjs update <ref>` if upstream
     touched `app/globals.css` / `app/settings.css`.
4. E2E in this container: Playwright 1.63 wants chromium-1243 but only
   `/opt/pw-browsers/chromium` (1194) exists. Create a throwaway
   `.pw-local.config.ts` at the repo root:
   `import base from "./playwright.config"; export default { ...base, use: { ...base.use, launchOptions: { executablePath: "/opt/pw-browsers/chromium" } } };`
   run `npx playwright test -c .pw-local.config.ts`, delete it afterwards.
   If every test fails in milliseconds, check the log for a dev-server crash
   and `rm -rf .next-e2e` (gitignored) before rerunning. Never `pkill -f` a
   pattern that also matches your own shell command.
