# Upstream merge record — 2026-10-04, round 1 of 3

Two-parent merge of abcwyc/pi-agent-desktop `26eb188` (an intermediate commit
on `upstream/main`, not its tip) into this fork's `main` `60ee9db`. Backup
branch: `backup/pre-upstream-merge-20261004`. Work branch:
`merge/upstream-round1-26eb188`.

`upstream/main` (`f66ba13`) is 715 commits ahead, but most of that is ancestry
bookkeeping: `3c3bbb7` (pr-35, 559 commits, empty tree diff) and `9d65248`
(`-s ours` record of pi-web 6fcd7d4, 109 commits). The real content was split
into three rounds at first-parent commits:

1. `26eb188` — this merge: pi SDK 0.87.1 → 1.0.0 on the desktop side, MCP
   status panel, native macOS menu, running-state broadcasts, small fixes.
2. `c5a70eb` — pi-web v0.10.0: MCP + Code mode (ADR 0006), 289 files.
3. `f66ba13` — PR #70, cost/branch/model features, pi SDK 1.0.2, desktop
   0.5.0/0.5.1.

17 first-parent commits since `73bc9f1`. 9 files conflicted: app/native-theme.css,
components/AppShell.tsx, AppShell.workspace-memory.test.mjs,
ChatInput.test.mjs, ChatWindow.composer-alignment.test.mjs, ChatWindow.tsx,
lib/rpc-manager.ts, package-lock.json, scripts/release-component-pins.json.

## Integrated from upstream

- Bundled pi SDK 1.0.0 (`^1.0.0` ranges, lock pinned to 1.0.0 like
  upstream's lock; transitive `@earendil-works/pi-telemetry` resolved to
  1.0.2 instead of upstream's 1.0.0). `preflightResult` now takes a
  disposition and `steer`/`followUp` return one (`lib/pi-types.ts`).
- Built-in MCP sessions: `createMcpExtension()` in the resource loader;
  extension tools are added only when their `exposure` is `direct`.
- Running-state broadcasts on prompt admission/settle, `agent_settled`,
  compaction, bash, wrapper start and destroy (sidebar spinner stops after a
  run finishes, upstream 534b7ef).
- `wholeTurns` paging is opt-in; chat-view loads ask for it, the API `tail`
  stays an exact cap (bf684cb). Manual compact reloads with state so the
  context ring updates (PR #38).
- Upward composer menus clamp below the app topbar (`getTopbarBoundary`, #63).
- MCP OAuth input dialogs show an "Open authorization page" link.
- Native macOS app menu (`hooks/useNativeAppMenu.ts`, `src-tauri/src/lib.rs`):
  New session and Settings → General / Models.
- MCP config API (`lib/mcp-config.ts`), `lib/mcp-status.ts`, McpPanel
  component, en/zh-CN/zh-TW strings, jiti staging in the desktop bundle,
  desktop 0.4.9 bookkeeping.

## Kept from the fork

- Topbar without the More menu, Tools / System prompt / Session stats panels
  (pinned by "Topbar Tools button and More menu" in
  `fork-extractions.test.mjs`). Upstream's new MCP entry lives only in that
  More menu, so `McpPanel` is not mounted: MCP server status has no UI
  in this round. Round 2 (`c5a70eb`) deletes McpPanel upstream and moves MCP
  management into Settings, which the fork's structure can take.
- Draft keys stay `new:${cwd}` (upstream moved to `new:initial:${cwd}`).
- Fork composer markup (`.chat-composer textarea`, not
  `.chat-input-textarea`).

## Notable resolutions

- AppShell: took the fork file and ported only the native menu. Its
  "New session" goes through `sidebarActionsRef.current?.newSession`, like the
  fork's keyboard shortcut, so a missing project folder is redirected; the
  `setTopMoreOpen` call was dropped (no More menu).
- Upstream's WebKitGTK placeholder fix (#64) targeted `.chat-input-textarea`
  with line-height 1.6; retargeted to `.chat-composer textarea::placeholder`
  with the fork's 1.55.
- Added `chat-scroll-container` to the fork's message scroller, which
  upstream's `e2e/run.mjs` uses as a hook; existing fork selectors still match.
- rpc-manager: fork and upstream both added `notifyRunningChange()` in
  `finishPrompt`; kept one (upstream's, with its comment).
- `components/McpPanel.test.mjs`: the "reachable from the More menu" case
  asserted the declined menu; it now asserts AppShell does not mount the panel
  and keeps every McpPanel source assertion.
- `lib/rpc-manager-running-state.test.mjs` (new upstream test): its fake
  session manager gained `getSessionName`/`getEntries`, which the fork's
  auto-naming reads on every prompt.
- `tests/e2e/slash-menu.spec.ts`: the slash menu now lists 41 commands, not
  40, because the built-in MCP extension registers `/mcp`.
- Release pin `pi` → 1.0.0 citing this merge; component manifest matches.
- Drift against pi-web 96966e5: `lib/rpc-manager.ts` 215 → 269 structural
  (upstream desktop-side running-state + MCP code), risk medium → high in
  `scripts/fork-ownership.json`. Round 3 brings upstream's own move of the
  baseline to 6fcd7d4 (d790b34).

## Known pre-existing issues

- `app/api/cwd/browse/route.test.mjs` "read-denied directory" fails when the
  suite runs as root (chmod does not deny root). It fails identically on the
  pre-merge backup branch in this container.
- 26 lint warnings, identical (rule + message per file) to the pre-merge tree.

## Verification

Typecheck clean; lint 0 errors (26 warnings, the same set as before the
merge); unit 1,674 tests, 1,673 passed, 1 failed (the root-only
`cwd/browse` case above). Release pins/manifest valid, drift labels match
(`scripts/fork-ownership.test.mjs` passes), no conflict markers.

Browser: full Playwright suite **40 passed** (7.5m, 1 worker) on the final
tree. The container's Chromium is revision 1194 while Playwright 1.63 expects
1243, so the runs used a throwaway config that extends `playwright.config.ts`
with `launchOptions.executablePath: /opt/pw-browsers/chromium` (not
committed). Earlier run that did not count:
- First full run: 38 passed, 2 failed. `slash-menu` expected 40 options and
  got 41 (the `/mcp` command, fixed in the spec above).
  `server-recovery` did not see the offline alert within 35s after stopping
  its owned `next dev`. Nothing in this round touches the connection banner
  or `lib/desktop-connection.ts`. It passed when rerun alone and again in the
  final full run (its one rerun). If it fails again, treat it as a real
  failure.
