# Pi Web - Development Notes

## Quick Start

```bash
npm run dev   # port 30141
```

Typecheck: `node_modules/.bin/tsc --noEmit`  
Lint: `npm run lint`  
Unit tests: `npm test`  
Browser E2E: `npm run test:e2e` (see below)  
**Never run `next build` during dev** — pollutes `.next/` and breaks `npm run dev`.

### Browser E2E (`npm run test:e2e`)

Plain Playwright CLI — no editor or MCP integration required, so any agent (or CI)
verifies the same way it runs unit tests.

- Starts its own dev server on port 30142 with `distDir: .next-e2e`, so a `npm run dev`
  already running on 30141 is untouched.
- Sandboxed: `HOME`, `PI_CODING_AGENT_DIR` and the session cwd all live under
  `/tmp/pi-web-e2e` (`tests/e2e/sandbox.ts`), wiped at the start of each run.
  `PI_OFFLINE=1`, no credentials, no tokens spent.
- `tests/e2e/bash-session.spec.ts` covers the bash-only loop: `?cwd=` → `!command`
  in the composer → UI output → `/api/sessions` → JSONL on disk → reopen via `?session=`.
- Failure artifacts for any agent to read: `test-results/<test>/error-context.md`
  (ARIA snapshot), screenshot, video, `trace.zip`; HTML report in `playwright-report/`.
- Browser: bundled Chromium (`npx playwright install chromium`). `PW_CHANNEL=chrome`
  reuses a locally installed Chrome instead.

---

## Architecture

```
Browser                Next.js Server              AgentSession (in-process)
  │                        │                               │
  ├─ GET /api/sessions ────▶ reads ~/.pi/agent/sessions/   │
  ├─ GET /api/sessions/[id] reads .jsonl file directly     │
  ├─ GET /api/agent/running ───────▶ running id snapshot   │
  │                        │                               │
  ├─ send message ─────────▶ POST /api/agent/[id]          │
  │                        │   startRpcSession() ─────────▶│ createAgentSession()
  │                        │   session.send(cmd) ─────────▶│ session.prompt()
  │                        │                               │
  ├─ SSE connect ──────────▶ GET /api/agent/[id]/events    │
  │                        │   session.onEvent() ◀─────────│ session.subscribe()
  │◀── data: {...} ─────────│                               │
```

**Session browsing** (read-only): reads `.jsonl` files through SDK `SessionManager` helpers and `lib/session-reader.ts` — no AgentSession created.  
**Sending a message**: `startRpcSession()` in `lib/rpc-manager.ts` creates an AgentSession in-process.

---

## File Map

```
app/api/
  sessions/route.ts               GET  list all sessions
  sessions/[id]/route.ts          GET/PATCH/DELETE session
  sessions/[id]/context/route.ts  GET ?leafId= — context for a specific leaf
  sessions/[id]/export/route.ts   GET exported HTML for a session
  agent/new/route.ts              POST { cwd, message, toolNames?, provider?, modelId? }
  agent/[id]/route.ts             GET state | POST any command
  agent/[id]/events/route.ts      GET SSE stream
  agent/running/route.ts          GET currently-running session ids
  agent/running/events/route.ts   GET SSE stream of currently-running session ids
  auth/all-providers/route.ts     GET API-key provider list
  auth/api-key/[provider]/route.ts GET/POST/DELETE provider API key status/storage
  auth/login/[provider]/route.ts  GET OAuth/device-code SSE | POST manual code
  auth/logout/[provider]/route.ts POST OAuth logout
  auth/providers/route.ts         GET OAuth provider list
  cwd/validate/route.ts           POST validate/select a cwd
  default-cwd/route.ts            POST create ~/pi-cwd-YYYYMMDD
  files/[...path]/route.ts        GET file contents for viewer
  home/route.ts                   GET user home directory
  models/route.ts                 GET { models, modelList, defaultModel }
  models-config/route.ts          GET/PUT — read/write ~/.pi/agent/models.json
  models-config/catalog/route.ts  GET models.dev pricing presets
  models-config/discover/route.ts POST fetch a configured provider's upstream model list
  models-config/test/route.ts     POST test a configured model/provider
  plugins/route.ts                GET/POST package plugin management
  skills/route.ts                 GET/PATCH loaded skills and disable-model-invocation
  skills/install/route.ts         POST install skills through npx skills add
  skills/search/route.ts          GET/POST skills.sh search
  worktrees/route.ts              GET list / POST create / PUT switch branch / DELETE git worktrees
  worktrees/fetch/route.ts        POST git fetch --prune + fresh branch lists
  desktop/read-images/route.ts    POST read natively-picked images into attachment payloads
  desktop/save/route.ts           POST copy a file to, or write bytes at, a natively-picked path

lib/
  agent-client.ts      typed fetch helper for /api/agent commands
  app-prefs.ts         APP_PREF_KEYS + typed localStorage accessors (SSR/private-mode safe)
  desktop-connection.ts useDesktopConnection() — local server health probe for the reconnect banner
  desktop-native.ts    native dialogs, open/reveal path, external links, save/import, window lifecycle
  desktop-notify.ts    native completion notifications (skipped while the window is focused)
  draft-store.ts       local draft persistence helpers
  file-access.ts       allowed file roots for /api/files and worktrees
  file-paths.ts        client/server path encoding helpers
  markdown.ts          shared markdown helpers
  npx.ts               npx runner used by skill install
  pi-types.ts          local structural types for pi SDK objects
  rpc-manager.ts      AgentSessionWrapper + registry + startRpcSession
  session-reader.ts   SessionManager wrappers + path cache + buildSessionContext adapter
  tool-presets.ts     PRESET_NONE/DEFAULT/FULL + getPresetFromTools()
  types.ts            shared TypeScript types
  normalize.ts        normalizeToolCalls() — field name mismatch between file format and our types
  workspace-state.ts  persisted session/cwd/file-tab restore for desktop cold starts
  worktree.ts         project/worktree resolution and git worktree operations

components/
  AppShell.tsx        layout + URL state + tab management
  SessionSidebar.tsx  session tree + FileExplorer
  ChatWindow.tsx      chat composition + completion sound wrapper
  ChatInput.tsx       input bar + model/thinking/tools/compact controls
  MessageView.tsx     renders one message (user/assistant/toolCall/toolResult)
  BranchNavigator.tsx in-session branch switcher
  MarkdownBody.tsx    markdown renderer
  ModelsConfig.tsx    modal for editing models.json (opened from sidebar bottom)
  PluginsConfig.tsx   modal for installed package plugins
  SkillsConfig.tsx    modal for loaded/search/installable skills
  FileExplorer.tsx    file tree inside sidebar
  FileIcons.tsx       file icon helpers
  FileViewer.tsx      file content in a tab
  TabBar.tsx          tab bar (Chat + open file tabs)

hooks/
  useAgentSession.ts  messages + streaming + SSE + fork/navigate/reconciliation logic
  useDragDrop.ts      shared drag/drop state
  useIsMobile.ts      responsive breakpoint hook
  useTheme.ts         theme state
```

---

## Key Design Decisions & Traps

### AgentSession lifecycle (`lib/rpc-manager.ts`)
- One `AgentSessionWrapper` per session id, keyed in `globalThis.__piSessions`
- `globalThis` survives Next.js hot-reload; plain module-level Map does not
- Idle timeout: 10 minutes. Concurrent `startRpcSession()` calls share a single start Promise (`globalThis.__piStartLocks`)

### Fork must destroy the wrapper immediately
`AgentSession.fork()` **mutates the wrapper's inner state in-place** — after fork, `inner.sessionId` is the *new* session's id. If the wrapper stays alive in the registry under the old id, the next request gets the already-forked state and subsequent forks produce a corrupt `parentSession` chain.

**Fix**: `send("fork")` captures `newSessionId`, then calls `this.destroy()` before returning. The next request for the original session reloads a clean AgentSession from the original file.

### Two kinds of branching — don't confuse them
- **Fork** (Fork button on user message): creates a new independent `.jsonl` file. Shown as a child in the sidebar tree via `parentSession` header field.
- **In-session branch** (Continue button / BranchNavigator): calls `navigate_tree` within the same file. Multiple entries share the same `parentId`. Switching between them calls `/api/sessions/[id]/context?leafId=`.

### Session files can be fully rewritten
`parentSession` in the header is **display metadata only** — has zero effect on chat content. Safe to `writeFileSync` the entire file (pi does this itself during migrations). Used when cascade-reparenting children on delete.

### A new session has no file until pi flushes it
Pi delays the first flush of a new session until an assistant message exists, so a run that just started is invisible to the disk scan behind `/api/sessions`. The sidebar list is derived purely from `.jsonl` files, so without help the session the user is actively watching cannot be found in the list until the turn ends.
- `/api/sessions` merges live runtime rows via `getRpcSessionInfos()` (`lib/rpc-manager.ts`) with `mergeSessionLists()` (`lib/session-reader.ts`); the disk row wins for a persisted id, and a runtime row is suppressed until a user message exists (otherwise an untouched "new chat" runtime renders a row that later vanishes). `ensure_session`-created idle runtimes are also suppressed.
- Sessions created by subagents carry a `relation: { kind: "subagent", ... }`; sidebar rows for subagents are hidden and their state aggregates into the parent row (`listSessionFamilies` in `lib/session-family.ts`).
- The disk scan behind the list is the fork's incremental scanner (`lib/session-scan.ts`), cached per file keyed on mtime+size, so post-turn refreshes only re-parse the session that changed. `invalidateScannedSession(path)` drops one file's cache entry; `invalidateSessionListCache()` drops the list itself. Include symlinked project directories when touching the directory walk.
- `GET /api/sessions` returns a `sessionListVersion` counter; the sidebar's SSE handler refetches the list (reusing the invalidated server cache, no forced scan) whenever the version moves — that is how edits from another window/process appear.
- The sidebar refetches the list once per running id it has no row for, because a session can start running between list fetches.

### Event pipeline: SDK → wire → client (`lib/agent-event-stream.ts`, `lib/agent-event-wire.ts`)
- Per-agent SSE goes through `createAgentEventStream(req, id, sessionPromise)`: the session starts **asynchronously** (the route never `await`s `startRpcSession`), the stream filters events through `toClientAgentEvent()` and forwards them with one shared `TextEncoder`. Cancellation is `cancelStream(closeController)`; closing with `false` keeps the session's own listeners alive.
- The sidebar's running-id stream (`/api/agent/running/events`) keeps the older inline `dispose` pattern and must stay registered in `app/api/agent/events-route.test.mjs`.
- `subscribeRunningSessions()`/`notifyRunningChange()` in `rpc-manager.ts` broadcast the running-id set; `SessionSidebar` treats the stream as authoritative for running state (`sseAuthoritativeRef`) once connected, and a `sessionListVersion` bump on any SSE frame triggers a cache-reusing list refetch.

### Session listing: incremental scanner vs upstream catalogue
- `lib/session-scan.ts` replaces `SessionManager.listAll()`: same per-file info minus `allMessagesText`, cached per file keyed on mtime+size (`globalThis.__piSessionScanCache`). Only files whose mtime/size changed are re-parsed. `invalidateScannedSession(path)` forces one file's reparse; `invalidateSessionListCache()` drops the merged list cache. Symlinked project dirs are included.
- `resolveSessionPath()` tries a targeted header read (bounded to 4 KiB) before falling back to a full scan; `readSessionHeader()` never parses the whole file.
- Never reintroduce a literal `homedir()` into an fs call in these paths — route it through `userHome()` or the scanner walks the whole user profile at build time and Windows releases fail.

### Client session hook: guards you must keep when merging upstream (`hooks/useAgentSession.ts`)
- **Monotonic request ids**: `contextLoadIdRef`/`toolsLoadIdRef`/`sessionGenerationRef` — checking only the session id is not enough when the user switches A→B→A before a request settles. `loadContext`/`loadTools`/the `agent_end` refresh all capture and re-verify identity.
- **Session-load deadline**: `loadSession` fetches through `fetchWithRetry` (one retry with a longer deadline); a hung first attempt must not leave "loading session" forever.
- **Streaming seed**: `seedStreamingSnapshot()` re-hydrates the streaming bubble from `get_state.streamingMessage` on reconnect paths (page refresh mid-run).
- **Render-phase scroll save**: the departing session's scroll position is saved inside the `sessionIdentity !== appliedIdentity` render block, not in an effect cleanup — the browser clamps scrollTop to 0 before cleanup runs. `pendingInitialScrollTopRef` is consumed by the first-messages layout effect; upstream's `pendingScrollRestore` visibility gate hides the container until an in-page viewport restore lands.

### Thinking-level state model (post-0.9.1)
Four states, not one: `newSessionThinkingLevel` (composer pre-send), `newSessionDefaultThinkingLevel` (from `/api/models` pins + `defaultThinkingLevel`), `currentThinkingOverride` (explicit user choice), `liveThinkingLevel` (wrapper-reported). `thinkingLevel` returned to the UI is `displayThinkingLevel ?? "auto"`. "auto" clears all overrides and leaves pi's setting untouched. The selector prefers the live wrapper model/thinking over persisted response metadata.

### Security posture from the upstream main merge
- `PI_WEB_PASSWORD` (off by default) enables browser password login with `pi_web_session` cookie (SameSite=Lax) and global backoff throttling (`lib/auth-throttle.ts`). When disabled, loopback/desktop-token paths behave exactly as before — desktop token auth is independent.
- Manual-code OAuth handshake tokens are `crypto.randomUUID()`; never revert to Math.random.
- Inline SVG previews opened as documents get a CSP that blocks script execution (`HTML_PREVIEW_CSP` in the files route).

### ToolCall field normalization
Pi stores toolCall blocks as `{type:"toolCall", id, name, arguments}` but `ToolCallContent` uses `{toolCallId, toolName, input}`. `normalizeToolCalls()` in `lib/normalize.ts` handles this — called in both `session-reader.ts` (file load) and `ChatWindow.handleAgentEvent()` (streaming).

### New session tool preset
Tool names are passed at session creation (`POST /api/agent/new` → `toolNames[]`). For existing sessions, the active preset is inferred on mount via `get_tools` → `getPresetFromTools()`. When tools are fully disabled (`toolNames = []`), `rpc-manager.ts` passes an empty tool allow-list and applies the exact system prompt after startup/reload/resource discovery. Opening an existing conversation must not append tool-selection metadata.

### pi ≥ 0.86: `state.systemPrompt` is read-only — project, never assign
`AgentState.systemPrompt` became a getter replayed from the transcript's system messages; assigning it throws at runtime (tsc only catches this in code typed against the real SDK — `rpc-manager.ts` goes through the structural `AgentSessionLike`, where it is invisible). `AgentSessionWrapper.applyExactSystemPrompt()` therefore installs an `agent.transformContext` projection that collapses each outgoing request's head system message to the exact prompt (the same mechanism pi itself uses for `before_agent_start` forced prompts); `get_state` reports `exactSystemPrompt()` directly so the UI's tools-disabled gate keeps working. Stream functions take a `TranscriptContext` now — fold a `Context` with `normalizeContext()` before calling one (see `lib/session-title.ts`). The session-list scanner replicates 0.86 `listAll()` ordering: modified descending, ties by stat mtime then basename descending.

### Model defaults for new sessions
`GET /api/models` returns `defaultModel` read from `~/.pi/agent/settings.json`. `ChatWindow` pre-selects this on mount for new sessions. Explicit browser model/thinking selections are applied atomically during AgentSession construction, then `lib/startup-preferences.ts` persists their effective values without replaying `set_model`/`set_thinking_level`; implicit `enabledModels` fallbacks and thinking pins are not persisted.

### Effort and tool presets carry across sessions
The last explicitly picked effort (thinking) level and tool preset persist in `localStorage` (`APP_PREF_KEYS.thinkingLevel` / `.toolPreset`). New sessions seed their toolbar from them and `ensureNewSession` sends both at creation, so pi clamps a stored effort level the model lacks to the same-or-next-higher supported level (`clampThinkingLevel` in pi-ai) and returns the effective value, which the UI adopts. Existing sessions keep their own saved values until the user changes something. Picking "auto" clears the stored effort; pi's `defaultThinkingLevel` from settings.json then applies again.

### `enabledModels` scoping
The `enabledModels` setting uses pi's `--models` syntax: minimatch globs against `provider/modelId` or a bare `modelId`, fuzzy matching for non-glob patterns, and an optional `:thinkingLevel` suffix. Never compare those patterns as literal strings — `lib/model-scope.ts` delegates to the SDK's `resolveModelScopeWithDiagnostics()` so pi-web and the TUI agree on the visible model list, and falls back to all available models when patterns resolve to nothing. `startRpcSession()` resolves that scope before creating an AgentSession and passes the selected initial model, thinking pin, and SDK-native `scopedModels` atomically; `GET /api/models` reuses the helper only for selector data, `thinkingLevelPins`, and `modelScopeWarnings` display.

### SSE reconnect on page refresh mid-stream
On `ChatWindow` mount, `GET /api/agent/[id]` is called. If `state.isStreaming === true`, SSE is reconnected automatically. `thinkingLevel` and `isCompacting` are also synced from this response.

### Compaction & summarization-retry SSE events
pi 0.86 emits `compaction_start`/`compaction_end` (the legacy `auto_compaction_*` names are gone — do not re-add their cases) plus `summarization_retry_scheduled/attempt_start/finished` when summary generation enters backoff. `handleAgentEvent` keeps `isCompacting` in sync and mirrors the retry counter into `summarizationRetry`, shown as "Compacting… (retry n/m)" on the compact control. `compaction_end.willRetry` deliberately leaves the counter in place so the countdown stays visible between compaction passes. Manual compact is a blocking POST — the button stays disabled until the response returns. The compact block renders whenever `onCompact && (!isStreaming || isCompacting)`: an auto-compaction mid-run must stay visible and abortable, which is exactly when `isStreaming && isCompacting`.

### 0.86 event surface — the wire forwards everything, the client switch must keep up
`agent-event-wire.ts` whitelists by omission (only `turn_start/turn_end` dropped), so any new SDK event reaches the browser and is silently ignored unless `handleAgentEvent` has a case. Currently handled beyond the message lifecycle: `bash_execution_update` (live `!command` output, tail-capped by `PENDING_BASH_OUTPUT_CAP`), `thinking_level_changed` (immediate selector sync), `session_info_changed` (server invalidates the list cache), `entry_appended` (throttled idle-only transcript refresh — the SDK fires it for extension custom entries and cache warming, never for normal streaming). `executeBash` must `ensureEventsConnected(sid)` *before* dispatching the bash command, or the chunks have no stream to arrive on.

### `isRunning()` must consult the SDK's `isIdle`
pi ≥ 0.86 `isIdle` stays false through auto-retry backoff, branch summaries, and queued continuations — states where `isStreaming/isCompacting/isBashRunning` are all false between events. `AgentSessionWrapper.isRunning()` therefore ORs `inner.isIdle === false` into the flag check; dropping it re-introduces mid-retry wrapper eviction (`evictIfDiskAhead`) and premature idle shutdown. `IDLE_RESET_EVENT_TYPES` includes the retry-backoff events for the same reason.

### Running-state and cross-window propagation
`notifyRunningChange()` fires on `agent_start` as well as `agent_end` (idle → running was never pushed, so other windows' sidebars missed starts), and every `/api/agent/running/events` frame carries `sessionListVersion` — the sidebar refetches the list when the version moves. `session_info_changed` (renames from any window/extension) invalidates the list cache *and* broadcasts a running frame, because that frame is the version's only delivery channel; the running set itself is unchanged.

### Session automation surface (0.86)
`get_state` reports `autoCompactionEnabled`, `autoRetryEnabled`, `steeringMode`, `followUpMode`; the composer's gear popover toggles them through `set_auto_compaction` / `set_auto_retry` / `set_steering_mode` / `set_follow_up_mode`, and `abort_retry` backs the "Cancel retry" link in the retry banner. `useAgentSession.automation` mirrors the four values inside `syncLiveModel` — every get_state path updates them automatically; a new session shows no gear until a wrapper exists (values null). Thinking levels come from `getSupportedThinkingLevels` per model; do not reintroduce a manual DeepSeek xhigh clamp — 0.86 `setThinkingLevel` clamps to `getAvailableThinkingLevels()` itself and a manual `state.thinkingLevel` write bypasses the append/emit path.

### Composer send path is single-shot and guarded
`ChatInput.handleSend` routes slash commands through `runBuiltinCommand` (the pending-guard wrapper) and sends exactly one `onSend` with the `#session`-mention-resolved text. A merge once left a second raw `onSend(msg, …)` behind it: the first send flips `agentRunningRef`, the second hits the running guard and *restores the just-sent text back into the composer* — every message appeared to "stick". `components/ChatInput.test.mjs` runs the extracted handler in a VM to pin one-send semantics.

### `!command` output renders live, then collapses
The pending bash bubble accumulates `bash_execution_update` deltas into `pendingBash.output` and renders them through `BashExecutionView` as a synthesized partial result, default-expanded while running (`ToolCallBlock defaultExpanded`). When the run finishes the persisted message mounts collapsed like any other tool call — live-watched, then folded, is intentional.

### Stats count standalone usage entries
pi 0.86 cache warming appends `type:"usage"` entries (`kind: "cache_warm"`); `lib/session-stats.ts` folds them in exactly like the SDK's `getSessionStats()`. Skipping them under-reported tokens/cost against the TUI.

### Touch affordances
Session rows render the "…" action menu when `(hovered || touchMode)` — `touchMode` is a post-mount `matchMedia("(hover: none)")` check, so hover styling is untouched on desktop and rename/delete stay reachable on touch. On narrow screens a compact Stop button renders *outside* the collapsed "More controls" row while a run is active. Rename/delete failures surface a fixed-position toast (`sidebar.renameFailed` / `sidebar.deleteFailed`) instead of being swallowed.

### Running state polling + reconciliation
- The sidebar uses `/api/agent/running/events` for running status. Its heartbeat carries the session-list version so external Pi writes also refresh the catalog. Fork-owned running/activity streams register with the shared shutdown drain; the session-list response remains the initial fallback.
- `useAgentSession` treats per-session SSE as primary for chat events and opens it before each prompt. `prompt_done` completes the current UI stage and notification immediately, but the idle SSE stays open for a 30-second grace window and is reused by the next prompt. `agent_start` cancels that close timer; `agent_settled` finishes extension-injected runs that have no wrapper-level `prompt_done` and starts a fresh grace window. Do not close on the first `agent_end`: retries, compaction, and extension-queued messages can continue the same logical prompt.
- While a run is active, `useAgentSession` periodically calls `GET /api/agent/[id]` and also reconciles on `visibilitychange`/`online`. This fixes missed terminal events from background tabs or half-open connections.
- Prompt runs use a monotonic run id; late SSE or slow reconciliation responses from an old run must be ignored so they cannot resurrect stale streaming bubbles.

### Per-session scroll restore must be saved before the render-phase reset
Switching sessions resets chat state *during render* (`sessionIdentity !== appliedIdentity` in `useAgentSession`), so the message list is emptied in the same commit — the browser clamps the container's `scrollTop` to 0 before any effect cleanup runs. Saving the position from an effect cleanup therefore records 0 for every switch (which restores as "top of the chat"). The save lives inside the render-phase reset block; an unmount-only cleanup covers ChatWindow remounts (there the DOM is still intact when cleanup runs). Positions and the lazy-load `visibleCount` are cached per session in module-level LRUs (`lib/scroll-memory.ts`): `scrollTop` is a pixel offset into the render window that existed at save time, so `visibleCount` must be restored with it or the offset lands on the wrong message. A viewport at the bottom is deliberately not saved — the restore path then falls back to scroll-to-bottom so users following the tail keep following it.

### The session load must have a deadline
Switching chats does **not** remount `ChatWindow` — `AppShell.handleSelectSession` deliberately keeps `sessionKey` stable so the input dock does not flash. That makes the single `GET /api/sessions/[id]` in `loadSession()` the only thing that ever clears `loading`, and the retry button only appears once the load *fails*. A bare `fetch` there is a hang away from leaving "loading session" on screen permanently, which is exactly what desktop users hit on the first switches after a cold start. It goes through `fetchWithRetry()` (`lib/fetch-timeout.ts`): a hung first attempt is abandoned, then retried once with a longer deadline — the server finishes its cold-start work regardless of the client giving up, so the retry usually lands warm.

### Worktrees and project grouping
- `lib/worktree.ts` resolves linked worktree top-levels back to the main repo `projectRoot`; `listAllSessions()` attaches that to each `SessionInfo` so all worktrees for one repo are grouped together in the sidebar.
- Worktree operations are served by `/api/worktrees` and guarded by the same allowed-root rules as `/api/files`.
- New worktrees are created under `<repoRoot>-worktrees/<sanitized-branch>`. Existing branches are reused; otherwise `git worktree add -b` creates the branch.
- Removing a dirty worktree returns `409` with `{ dirty: true }` so the UI can ask before retrying with `force`.
- Sessions whose cwd points at a removed worktree are inferred back into the main project instead of becoming a phantom project row.
- The switcher also switches the *current* checkout's branch in place: `PUT /api/worktrees { cwd, branch }` → `switchBranch()` (local branch, or `checkout -b --track` when the name exists on exactly one remote). Branch names are validated to not start with `-` — they are passed as git argv, never through a shell. `POST /api/worktrees/fetch` runs `git fetch --prune` (with `GIT_TERMINAL_PROMPT=0` so it fails fast instead of hanging on a credential prompt) and returns fresh local/remote-only branch lists.
- The sidebar worktree state is event-driven by nature (agent end, cwd switch) — branches checked out *outside* pi would go stale. `SessionSidebar` therefore polls `/api/worktrees` every 10 s while the tab is visible, on window focus, and when the dropdown opens; the `checkedWorktreeCwdsRef` guard keeps those background refetches silent.
- A branch already checked out in another worktree cannot be checked out again (git refuses); clicking it in the switcher jumps to that worktree instead.

### File access allow-list
- `/api/files` is intentionally not a general filesystem browser. Allowed roots come from session cwds, their resolved project roots, `~/pi-cwd-*`, and roots explicitly added with `allowFileRoot()`.
- `/api/cwd/validate`, `/api/default-cwd`, and `/api/worktrees` call `allowFileRoot()` when they make a new location browsable.

### Plugins and skills
- `/api/plugins` uses pi's `SettingsManager` + `DefaultPackageManager` for global/project package install, remove, update, enable, and disable. Disabling writes empty `extensions/skills/prompts/themes` arrays for that package entry.
- `/api/skills` uses `DefaultResourceLoader` so settings paths, package skills, and project `.agents/skills` are listed the same way the runtime sees them.
- Skill toggling edits only the `disable-model-invocation` frontmatter key on the target `SKILL.md`; keep that surgical so user formatting survives.
- `/api/skills/install` shells through `npx skills add ... --agent pi`; project installs run with the selected cwd.

### Auth and model config
- `ModelsConfig` combines models from `~/.pi/agent/models.json` with provider auth status from pi's `AuthStorage`/`ModelRegistry`.
- Provider listing is capability-driven, never id-driven: `lib/provider-listing.ts` decides membership from `auth.apiKey.login` / `auth.oauth` plus the stored credential type, so dual-auth providers (anthropic and github-copilot today — which providers declare both changes between SDK releases, so never assume it from an id) appear exactly once and never fall through both lists (#309). `lib/provider-listing-runtime.ts` adapts `ModelRuntime` to those pure helpers.
- auth.json holds **one** credential per provider and `ModelRuntime.logout()` deletes whichever it is. The delete routes therefore use `removeStoredCredentialIfType()` to compare and delete under the same file lock used by pi's auth storage. `ModelsConfig` also refreshes *both* provider lists after any auth change — refreshing one leaves a dual-auth provider rendered twice.
- OAuth/device-code/manual-code flows are streamed by `GET /api/auth/login/[provider]`; manual code responses POST back with a short-lived token stored in `globalThis.__piLoginCallbacks`.
- API-key routes store and remove keys through `AuthStorage`. Status endpoints must never return the raw key.
- The model test route is `app/api/models-config/test/route.ts`; `app/api/models/test/` is not a real route.

### Completion sound
- Removed (`hooks/useAudio.ts` deleted): completion sounds were never used. `APP_PREF_KEYS.soundEnabled` remains only as a dead localStorage key.

### Exported session HTML
- `/api/sessions/[id]/export` delegates to pi's export helper, then patches recursive tree helpers in the generated HTML to iterative versions so very deep linear sessions do not overflow the browser call stack.

### Desktop shell (Tauri)
- `lib/desktop-native.ts` is the only place the UI touches Tauri APIs; every entry point checks `isTauriDesktop()` and degrades to a web equivalent. Tauri commands are declared in `src-tauri/src/lib.rs`, their permissions in `src-tauri/permissions/desktop-shell.toml`, and both must be listed in `src-tauri/capabilities/desktop-dialog.json` or the call fails at runtime only.
- `/api/desktop/read-images`, `/api/desktop/save`, and `/api/files?...type=import` deliberately accept absolute paths selected by native dialogs, so the normal `lib/file-access.ts` source/destination allow-list cannot cover them (`save` still allow-lists its *source*). They require a loopback Host, normal request-security checks, and the per-process desktop token from `lib/desktop-api-auth.ts`. The Tauri shell passes the token to the packaged server and exposes it to the trusted WebView through the capability-scoped `get_desktop_api_token` command. Never fall back to a static token or User-Agent detection.
- `read-images` caps the file count at `MAX_ATTACHED_IMAGES` from `lib/image-attachments.ts`. Keep it derived from that constant; a separate literal silently 400s selections the composer considered valid.
- Open a local path with `explorer.exe` on Windows, never `cmd.exe /C start` — Rust's argument escaping does not apply to the cmd parser, so a legal path like `C:\src\R&D\x.txt` would split into commands.
- `lib/app-prefs.ts` owns every `localStorage` key. Theme is additionally mirrored into the app config dir via the `set_ui_theme` command, because the packaged server's port (and therefore the WebView origin, and therefore `localStorage`) can change between cold starts.
- `lib/workspace-state.ts` restores the last session/cwd/file tabs on cold start. URL params always win over the persisted workspace.
- `useDesktopConnection` polls `/api/home` only in Tauri to drive the offline banner. Its cleanup must stop in-flight probes from rescheduling, otherwise an unmount leaves a timer nobody owns and it pings forever.

### Workspace terminals & node-pty staging
- Terminal tabs load `node-pty` through a runtime-computed path (`prebuilds/${platform}-${arch}/*.node`), which Next's file tracer cannot follow — a bare standalone build ships only `lib/` and breaks at runtime. `prepare-desktop.mjs` copies the whole `prebuilds/` tree and chmods `spawn-helper` for **both** darwin variants (macOS strips the bit in published prebuilds; `bin/prepare-terminal.js` fixes the same thing at npm-install time). If terminal tabs 500 or hang in a packaged app, check that `resources/server/node_modules/node-pty/prebuilds/` exists with executable helpers first.

### Upstream merge sentinels (not the same "fork" as session fork)
This repo is a fork of `agegr/pi-web` and periodically merges upstream. `components/fork-extractions.test.mjs` guards the failure mode that a clean merge can still be wrong: code this fork *moved* to another file reappears at its origin, or a fork change is silently reverted. Git does not track cross-file moves, so neither shows up in `tsc`, eslint, or the upstream suite.

When one of those assertions fails, the default is to restore the behaviour, not to delete the assertion. A failure saying a marker is "absent from the origin but also from the extraction targets — it looks deleted, not moved" means the feature is probably gone: that is exactly how the project-picker filter box was found missing after a restyle had left every project past the 7-row cap unreachable. Risk levels live in `scripts/fork-ownership.json`; the reasoning is in `docs/ownership-boundaries.md`.

### Topbar, chat column, and right panel — who contains whom
Upstream segment D (0e36743) restructured `AppShell.tsx`'s main region in ways this fork's layout cannot survive; all three are pinned by `components/AppShell.right-panel-row.test.mjs`:

1. The "Center: chat" column must contain BOTH the topbar's chat content AND the chat wrapper. A merge variant closed the column right after the topbar, making the chat wrapper a second `flex: 1` row child — the viewport split 50/50 between an empty topbar-only column and the chat ("huge blank middle column, chat clipped at the right edge").
2. The right-panel toggle/backdrop/resizer/panel block must be inside the row, not after its close: as flex-**column** children of `.app-shell` the closed panel's content height still stole vertical space (`height: 432px` at `width: 0`), floating the composer.
3. The topbar block sits directly under `.app-shell` (full width, above the row) — NOT inside the center column. Inside the column, the right panel's tab strip rose to `y=0` beside the header (overlapping the window buttons) and the topbar shrank to leftover width.

The topbar renders exactly ONE toolbar group (`app-topbar-actions`: history/branches/more + `renderSessionStatsButton`). Segment D also left a second desktop group (`renderChatToolbarActions(false)` — history/generate-title/system/tools) next to it; the duplicate is removed, its unique entries (Sub-agents, Tools) live in the More menu via `handleSystemInfoToggle` (keeping the lazy dormant-session start), and its generate-title guards (persisted-stats counting + `selectedSession.transient` check) were merged into the group-A button — pinned by `AppShell.auto-name.test.mjs`. JSX indentation in AppShell.tsx is unreliable; verify structure with the TS AST or the DOM, not by counting whitespace. `fileContentBlock()` in `AppShell.file-viewer-state.test.mjs` slices source by the panel's closing-div sequence — keep in sync.

### Segment E merge (1eb5e66) — what was adopted and what was declined
Merged upstream 974c8bb..1eb5e66 on top of v0.10.0. Adopted: scroll-to-latest button (with upstream's empty-session branding header, rebranded to PRODUCT_NAME and stripped of the NEXT_PUBLIC version badge per fork branding policy), streaming first-chunk dedup, PDF `#page=` fragments (MarkdownBody's link context + widened onOpenFile signatures), selection-toolbar z-index, subagent/provider fixes. Declined: upstream's sidebar explorer + resizable session/explorer panes (ed50d88) — this fork keeps the project-tree sidebar and the FileExplorer in the right panel; `SessionSidebar.test.mjs` pins that decision, so a future merge that re-adds `data-resize-handle="sidebar-sections"` should be treated as the merge re-introducing declined UI, not as a test to satisfy. Upstream's `/auto-compact` command is superseded by the composer automation gear.

## Pi Session File Format

Location: `~/.pi/agent/sessions/<encoded-cwd>/<timestamp>_<uuid>.jsonl`

```jsonl
{"type":"session","version":3,"id":"<uuid>","timestamp":"...","cwd":"/path","parentSession":"/abs/path/to/parent.jsonl"}
{"type":"model_change","id":"<8hex>","parentId":null,"provider":"zenmux","modelId":"claude-sonnet-4-6","timestamp":"..."}
{"type":"message","id":"<8hex>","parentId":"<8hex>","message":{"role":"user","content":"..."}}
{"type":"message","id":"<8hex>","parentId":"<8hex>","message":{"role":"assistant","content":[...],...}}
{"type":"message","id":"<8hex>","parentId":"<8hex>","message":{"role":"toolResult","toolCallId":"...","content":[...]}}
{"type":"compaction","id":"<8hex>","parentId":"<8hex>","summary":"...","firstKeptEntryId":"<8hex>","tokensBefore":N}
{"type":"session_info","id":"...","parentId":"...","name":"user-defined name"}
```

`entryIds[]` in `SessionContext` is a parallel array to `messages[]` — maps each displayed message back to its `.jsonl` entry id, used for fork and navigate_tree calls.

---

## CSS Variables (`app/globals.css`)

```
--bg --bg-panel --bg-hover --bg-selected --border
--text --text-muted --text-dim
--accent --user-bg --tool-bg
--font-mono
```

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
