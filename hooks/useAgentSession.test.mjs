import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const jitiSource = async (url) => (await readFile(url, "utf8")).replace(/\r\n/g, "\n");
const source = await jitiSource(new URL("./useAgentSession.ts", import.meta.url));
const chatWindowSource = await jitiSource(new URL("../components/ChatWindow.tsx", import.meta.url));
const chatInputSource = await jitiSource(new URL("../components/ChatInput.tsx", import.meta.url));
const appShellSource = await jitiSource(new URL("../components/AppShell.tsx", import.meta.url));

test("keeps the session event stream open through the idle grace window", () => {
  const finishSource = source.slice(
    source.indexOf("const finishPromptWithoutStream"),
    source.indexOf("const waitForPromptSettlement"),
  );
  const graceSource = source.slice(
    source.indexOf("const scheduleEventStreamClose"),
    source.indexOf("const finishPromptWithoutStream"),
  );
  const agentEndSource = source.slice(
    source.indexOf('case "agent_end"'),
    source.indexOf('case "agent_settled"'),
  );
  const agentStartSource = source.slice(
    source.indexOf('case "agent_start"'),
    source.indexOf('case "agent_end"'),
  );
  const agentSettledSource = source.slice(
    source.indexOf('case "agent_settled"'),
    source.indexOf('case "prompt_done"'),
  );
  const promptDoneSource = source.slice(
    source.indexOf('case "prompt_done"'),
    source.indexOf('case "prompt_error"'),
  );
  const sendSource = source.slice(
    source.indexOf("  const handleSend = useCallback"),
    source.indexOf("  const executeBash = useCallback"),
  );

  assert.match(source, /const EVENT_STREAM_IDLE_GRACE_MS = 30_000/);
  assert.match(graceSource, /setTimeout\(\(\) => void checkServerIdle\(\), EVENT_STREAM_IDLE_GRACE_MS\)/);
  assert.match(graceSource, /fetch\(`\/api\/agent\/\$\{encodeURIComponent\(sid\)\}`\)/);
  assert.match(graceSource, /closeEvents\(\)/);
  assert.match(finishSource, /scheduleEventStreamClose\(sid\)/);
  assert.doesNotMatch(finishSource, /closeEvents\(\)/);
  assert.doesNotMatch(agentEndSource, /closeEvents\(\)/);
  assert.match(agentStartSource, /cancelEventStreamGrace\(\)/);
  assert.match(agentSettledSource, /scheduleEventStreamClose\(sid\)/);
  assert.match(agentSettledSource, /onAgentEnd\?\.\(\)/);
  assert.match(promptDoneSource, /notifyPromptStage\(runId\)/);
  assert.match(promptDoneSource, /scheduleEventStreamClose\(sid\)/);
  assert.match(sendSource, /const definitivelyRejected = !promptRequestStarted/);
  assert.match(sendSource, /if \(!definitivelyRejected && sentSessionId\) \{[\s\S]*?waitForPromptSettlement/);
  assert.match(sendSource, /restoreSubmission\(message, images, composerDraftKey\);[\s\S]*?if \(sentSessionId\) \{[\s\S]*?reconcileAgentState\(sentSessionId\);[\s\S]*?return;[\s\S]*?\}[\s\S]*?closeEvents\(\)/);
  assert.doesNotMatch(
    sendSource,
    /rpcPromptPendingRef\.current = false;\s*agentRunningRef\.current = false;\s*closeEvents\(\)/,
  );
});

test("a rejected submission preserves a different run reported by the server", () => {
  const reconcileSource = source.slice(
    source.indexOf("  const reconcileAgentState = useCallback"),
    source.indexOf("  // Recovery net for missed SSE events"),
  );

  assert.match(reconcileSource, /sessionIdRef\.current !== sid/);
  assert.match(reconcileSource, /if \(busy\) \{[\s\S]*?sdkAgentActiveRef\.current = Boolean\(state\.isStreaming\)/);
  assert.match(reconcileSource, /rpcPromptPendingRef\.current = Boolean\(state\.isPromptRunning\)/);
  assert.match(reconcileSource, /if \(!agentRunningRef\.current\) return;[\s\S]*?finishPromptWithoutStream/);
});

test("opening System or Tools lazily starts a dormant session without sending a prompt", () => {
  const loadSystemInfoSource = source.slice(
    source.indexOf("  const loadSystemInfo = useCallback"),
    source.indexOf("  const loadSlashCommands = useCallback"),
  );
  const loaderEffectSource = source.slice(
    source.indexOf("  useEffect(() => {\n    onSystemInfoLoaderChange"),
    source.indexOf("  useEffect(() => {\n    if (!onBranchDataChange) return;"),
  );

  assert.match(loadSystemInfoSource, /sessionIdRef\.current \?\? await ensureNewSession\(\)/);
  assert.doesNotMatch(loadSystemInfoSource, /promoteNewSession\(\)/);
  assert.match(loadSystemInfoSource, /sendAgentCommand<AgentStateResponse>\(sid, \{ type: "get_state" \}\)/);
  assert.match(loadSystemInfoSource, /loadTools\(sid\)/);
  assert.doesNotMatch(loadSystemInfoSource, /type: "prompt"/);
  assert.match(loadSystemInfoSource, /setSystemPrompt\(state\.systemPrompt \?\? ""\)/);
  assert.match(loaderEffectSource, /onSystemInfoLoaderChange\?\.\(loadSystemInfo\)/);
  assert.match(loaderEffectSource, /onSystemInfoLoaderChange\?\.\(null\)/);
});

test("new-session promotion rekeys drafts before publishing the real session", () => {
  const promoteSource = source.slice(
    source.indexOf("  const promoteNewSession = useCallback"),
    source.indexOf("  const ensureNewSession = useCallback"),
  );

  assert.match(promoteSource, /draftKeyAliasesRef\.current\.set\(provisionalDraftKey, sid\)/);
  assert.match(promoteSource, /input\.rekeyDraft\(provisionalDraftKey, sid\)/);
  assert.ok(
    promoteSource.indexOf("input.rekeyDraft(provisionalDraftKey, sid)")
      < promoteSource.indexOf("onSessionCreated?.({"),
  );
  assert.match(promoteSource, /}, provisionalDraftKey\)/);
  assert.match(chatWindowSource, /draftKey=\{session\?\.id \?\? newSessionDraftKey \?\? undefined\}/);
});

test("fresh sessions use the preference while persisted and live sessions restore their selection", () => {
  const preferenceSource = source.slice(
    source.indexOf("  const existingSessionId = session?.id;"),
    source.indexOf("  const scrollToBottom"),
  );
  const loadToolsSource = source.slice(
    source.indexOf("  const loadTools = useCallback"),
    source.indexOf("  const promoteNewSession"),
  );
  const changeSource = source.slice(
    source.indexOf("  const handleToolPresetChange = useCallback"),
    source.indexOf("  const scrollUserMsgToTop"),
  );

  assert.match(source, /isNew \? loadStoredToolPreset\(\) : CONFIGURED_TOOL_PRESET/);
  assert.match(
    preferenceSource,
    /useLayoutEffect\(\(\) => \{\s*if \(!existingSessionId && \(!isNew \|\| sessionIdRef\.current\)\) return;\s*setToolPresetState\(getPreferredToolPreset\(\)\)/,
  );
  assert.match(source, /if \(agentState\?\.running\) \{\s*loadTools\(session\.id\)/);
  assert.match(source, /d\.toolNames !== undefined \? getPresetFromToolNames\(d\.toolNames\) : CONFIGURED_TOOL_PRESET/);
  assert.match(changeSource, /setPreferredToolPreset\(preset\)/);
  assert.match(changeSource, /type: "set_tools",\s*\.\.\.\(toolNames !== undefined \? \{ toolNames \} : \{\}\),/);
  assert.match(changeSource, /activeSessionId !== sid \|\| result\?\.recreated/);
  assert.match(changeSource, /result\?\.recreated[\s\S]*?maintainEventsConnected\(activeSessionId\)/);
  assert.match(changeSource, /sessionIdRef\.current = activeSessionId/);
  assert.doesNotMatch(loadToolsSource, /setPreferredToolPreset/);
});

test("sessions the user never overrode follow pi's configured defaultTools (#700)", () => {
  const ensureSource = source.slice(
    source.indexOf("  const ensureNewSession = useCallback"),
    source.indexOf("  const loadSystemInfo = useCallback"),
  );
  const loadToolsSource = source.slice(
    source.indexOf("  const loadTools = useCallback"),
    source.indexOf("  const promoteNewSession"),
  );

  // A new session must omit toolNames entirely rather than pin pi-web's own preset.
  assert.match(ensureSource, /\.\.\.\(toolNames !== undefined \? \{ toolNames \} : \{\}\),/);
  assert.doesNotMatch(ensureSource, /^ +toolNames,$/m);
  assert.match(ensureSource, /sessionToolsPinnedRef\.current = toolNames !== undefined/);

  // An unpinned session keeps saying "configured" instead of borrowing whichever
  // preset its resolved tools happen to match.
  assert.match(
    loadToolsSource,
    /setToolPresetState\(sessionToolsPinnedRef\.current \? getPresetFromTools\(tools\) : CONFIGURED_TOOL_PRESET\)/,
  );
});

test("only the session-mount load probes disk for external appends", () => {
  const loadSessionSource = source.slice(
    source.indexOf("  const loadSession = useCallback"),
    source.indexOf("  const loadContext = useCallback"),
  );
  const mountSource = source.slice(
    source.indexOf("// Load session on mount"),
    source.indexOf("sessionHookMountedRef.current = false"),
  );
  assert.match(loadSessionSource, /options\?: \{ force\?: boolean \}/);
  assert.match(loadSessionSource, /if \(options\?\.force\) params\.set\("force", "1"\)/);
  assert.match(loadSessionSource, /d\.wrapperRebuilt[\s\S]*?eventConnectionRef\.current\?\.close\(\)[\s\S]*?maintain\(sid\)/);
  assert.match(mountSource, /loadSession\(session\.id, !cached, true, \{ force: true \}\)/);
  assert.match(source, /await loadSession\(sid\)/);
  assert.equal([...source.matchAll(/\{ force: true \}/g)].length, 1);
});

test("first user messages expose both branch actions and edit before their own entry", async () => {
  assert.match(chatWindowSource, /onFork=\{isNew \? undefined : stableHandleFork\}/);
  assert.match(chatWindowSource, /if \(sessionBusyRef.current\) return/);
  assert.match(chatWindowSource, /onNavigate=\{stableHandleNavigate\}/);
});

test("an empty persisted session displays the model it will use on first send", () => {
  assert.match(
    source,
    /currentModel \?\? \(data\?\.context\.messages\.length === 0 \? newSessionDefaultModel : null\)/,
  );
  assert.match(source, /setNewSessionDefaultModel\(displayDefaultModel/);
});

test("the selector prefers the live wrapper model over persisted response metadata", () => {
  assert.match(source, /model\?: \{ provider: string; id: string \}/);
  assert.match(source, /const currentModel = currentModelOverride \?\? liveModel \?\? data\?\.context\.model \?\? pendingModel \?\? null/);
  assert.match(source, /syncLiveModel\(liveState\)/);
  assert.match(source, /syncLiveModel\(state\);[\s\S]*?const busy = data\.running/);
});

test("existing-session prompts rely on the persisted tool selection", () => {
  const sendSource = source.slice(
    source.indexOf("  const handleSend = useCallback"),
    source.indexOf("  const executeBash = useCallback"),
  );
  const existingSessionPrompt = sendSource.slice(sendSource.indexOf("} else if (session)"));

  assert.match(existingSessionPrompt, /type: "prompt",\s*message,/);
  assert.doesNotMatch(existingSessionPrompt, /toolNames:/);
  assert.doesNotMatch(sendSource, /restoreSubmission, toolPreset\]\);/);
});

test("submission recovery updates live refs before a possible session rekey", () => {
  const restoreMethod = chatInputSource.slice(
    chatInputSource.indexOf("    restoreSubmission(text:"),
    chatInputSource.indexOf("    insertText(text:"),
  );

  assert.ok(
    restoreMethod.indexOf("valueRef.current = restoredDraft.value")
      < restoreMethod.indexOf("setValue((current) =>"),
  );
  assert.ok(
    restoreMethod.indexOf("attachedImagesRef.current = restoredImages")
      < restoreMethod.indexOf("setAttachedImages((current) =>"),
  );
});

test("stale fresh-session completion cannot replace the active composer", () => {
  const cwdChangeSource = appShellSource.slice(
    appShellSource.indexOf("  const handleCwdChange = useCallback"),
    appShellSource.indexOf("  const handleSelectSession = useCallback"),
  );
  const newSessionSource = appShellSource.slice(
    appShellSource.indexOf("  const handleNewSession = useCallback"),
    appShellSource.indexOf("  // Global keyboard shortcuts"),
  );
  const createdSource = appShellSource.slice(
    appShellSource.indexOf("  const handleSessionCreated = useCallback"),
    appShellSource.indexOf("  const handleAgentEnd = useCallback"),
  );

  assert.match(newSessionSource, /activeNewSessionDraftKeyRef.current = `new:\$\{cwd\}`/);
  assert.match(newSessionSource, /invalidateWorkspaceRestore\(\)/);
  assert.match(createdSource, /activeNewSessionDraftKeyRef\.current !== sourceDraftKey/);
  assert.match(cwdChangeSource, /const currentFreshCwd = newSessionCwd \?\? activeCwd/);
  assert.match(
    cwdChangeSource,
    /currentProject === newProject\s*&& \(selectedSession !== null \|\| currentFreshCwd === cwd\)/,
  );
  assert.match(cwdChangeSource, /if \(currentProject !== newProject\) \{[\s\S]*?setFileTabs\(\[\]\)/);
  assert.match(
    appShellSource,
    /useLayoutEffect\(\(\) => \{\s*activeNewSessionDraftKeyRef\.current = newSessionDraftKey;/,
  );
  assert.ok(
    createdSource.indexOf("activeNewSessionDraftKeyRef.current !== sourceDraftKey")
      < createdSource.indexOf("setSelectedSession(session)"),
  );
});

test("navigation preserves unsent drafts and rejects stale submission recovery", async () => {
  assert.doesNotMatch(source, /clearDraft\(abandonedDraftKey\)/);
  assert.match(source, /!sessionHookMountedRef\.current[\s\S]*?!newSessionPromotedRef\.current/);
  assert.match(chatWindowSource, /draftKey=\{session\?\.id \?\? newSessionDraftKey \?\? undefined\}/);
});

test("streaming submissions cannot be stranded in an idle direct queue", () => {
  const queueSource = source.slice(
    source.indexOf("  // Let AgentSession.prompt decide atomically"),
    source.indexOf("  const handleAbortCompaction"),
  );

  assert.match(queueSource, /type: "prompt"/);
  assert.match(queueSource, /streamingBehavior: behavior/);
  assert.match(queueSource, /if \(isPromptRejectedError\(e\)\) restore\(\)/);
  assert.doesNotMatch(queueSource, /type: "steer"/);
  assert.doesNotMatch(queueSource, /type: "follow_up"/);
});

test("built-in clone switches to the independent child session", () => {
  const builtinSource = source.slice(
    source.indexOf("  const handleBuiltinSlashCommand"),
    source.indexOf("  // Let AgentSession.prompt decide atomically"),
  );

  assert.match(builtinSource, /case "clone"/);
  assert.match(builtinSource, /type: "clone",\s+leafId: activeLeafId/);
  assert.match(builtinSource, /agentRunningRef\.current \|\| bashRunningRef\.current/);
  assert.match(builtinSource, /onSessionForked\?\.\(result\.newSessionId\)/);
});

test("post-accept prompt errors do not duplicate the user submission", () => {
  const promptErrorSource = source.slice(
    source.indexOf('case "prompt_error"'),
    source.indexOf('case "extension_error"'),
  );

  assert.match(promptErrorSource, /addNotice/);
  assert.doesNotMatch(promptErrorSource, /restoreSubmission/);
});

test("delegates event stream readiness and hides an empty agent phase", () => {
  const ensureSource = source.slice(
    source.indexOf("const ensureEventsConnected"),
    source.indexOf("const respondToExtensionUi"),
  );

  assert.match(source, /new AgentEventConnection\(\{/);
  assert.match(source, /shouldMaintain: \(sid\)[\s\S]*?sessionIdRef\.current === sid/);
  assert.match(ensureSource, /eventConnectionRef\.current!\.ensureConnected\(sid\)/);
  assert.match(ensureSource, /eventConnectionRef\.current!\.maintain\(sid\)/);
  assert.match(chatWindowSource, /const hasStreamingContent = Boolean\(streamState\.streamingMessage\?\.content\.length\)/);
  assert.match(chatWindowSource, /streamState\.isStreaming && hasStreamingContent && streamState\.streamingMessage/);
  assert.match(chatWindowSource, /agentRunning && !hasStreamingContent && agentPhase/);
  assert.match(chatWindowSource, /return null;/);
});

test("does not play completion sounds — the feature was removed", () => {
  assert.doesNotMatch(chatWindowSource, /playDoneSound|soundedExtensionDialog|useAudio/);
});

test("uses one absolute agent-readiness deadline instead of a five-second transport deadline", () => {
  assert.match(source, /EVENT_STREAM_READY_TIMEOUT_MS = 60_000/);
  assert.doesNotMatch(source, /EVENT_STREAM_OPEN_TIMEOUT_MS/);
});

test("uses server pagination state instead of guessing from rendered rows", () => {
  const loadContextSource = source.slice(
    source.indexOf("const loadContext = useCallback"),
    source.indexOf("const loadTools = useCallback"),
  );
  assert.match(source, /const \[hasEarlierMessages, setHasEarlierMessages\] = useState\(false\)/);
  assert.match(source, /setHasEarlierMessages\(d\.context\.hasMore\)/);
  assert.match(source, /setHistoryCursor\(d\.context\.oldestEntryId\)/);
  assert.match(loadContextSource, /setData\(\(prev\) => \{[\s\S]*messages: \[\.\.\.d\.context\.messages, \.\.\.prev\.context\.messages\]/);
  assert.match(chatWindowSource, /const oldestId = historyCursor/);
  assert.doesNotMatch(chatWindowSource, /const oldestId = entryIds\[0\]/);
  assert.match(chatWindowSource, /if \(!hasEarlierMessages\) return/);
  assert.match(chatWindowSource, /const hasMore = startIndex > 0 \|\| hasEarlierMessages/);
  assert.doesNotMatch(chatWindowSource, /rendered\.length >= visibleCount/);
});

test("keeps the selected session warm while idle and renews its lease", () => {
  assert.match(source, /sessionRunning\?: boolean/);
  assert.match(
    source,
    /const sid = session\?\.id;[\s\S]*?if \(!sid\) return;[\s\S]*?maintainEventsConnected\(sid\)/,
  );
  assert.match(source, /sessionPropIdRef\.current === sid/);
  assert.match(source, /SESSION_LEASE_RENEW_INTERVAL_MS = 30_000/);
  assert.match(source, /fetch\(`\/api\/agent\/\$\{encodeURIComponent\(sid\)\}\/lease`/);
  assert.match(source, /setInterval\(\(\) => void renewLease\(\), SESSION_LEASE_RENEW_INTERVAL_MS\)/);
  assert.match(source, /result\.renewed === 0[\s\S]*?closeEvents\(\)[\s\S]*?maintainEventsConnected\(sid\)/);
  assert.match(source, /if \(sessionPropIdRef\.current === sid\) \{[\s\S]*?cancelEventStreamGrace\(\);[\s\S]*?return;/);
  assert.match(source, /maintainEventsConnected\(sid\)/);
  assert.doesNotMatch(source, /void connectEvents\(/);
  assert.match(chatWindowSource, /sessionRunning\?: boolean/);
  assert.match(chatWindowSource, /session, sessionRunning, newSessionCwd/);
  assert.match(appShellSource, /runningSessionIds\.has\(selectedSession\.id\)/);
  assert.match(appShellSource, /onRunningSessionIdsChange=\{handleRunningSessionIdsChange\}/);
});

test("opens the selected session's event stream even when Strict Mode re-runs effects", () => {
  // Strict Mode re-runs effects in declaration order after a simulated
  // unmount. The mount-only effect's cleanup flips sessionHookMountedRef to
  // false and only restores it when it re-runs, which happens after the
  // warm-session effect. That effect must therefore re-assert the ref itself
  // or shouldMaintain() refuses to open the stream on mount and on every
  // switch back to a running session.
  const warmSource = source.slice(
    source.indexOf("  // Keep the selected session warm even while its agent is idle."),
    source.indexOf("    const renewLease = async () => {"),
  );
  assert.match(warmSource, /sessionHookMountedRef\.current = true;\s*maintainEventsConnected\(sid\);/);
  assert.ok(
    warmSource.indexOf("sessionHookMountedRef.current = true;")
      < warmSource.indexOf("maintainEventsConnected(sid);"),
  );
  const mountSource = source.slice(
    source.indexOf("  useEffect(() => {\n    sessionHookMountedRef.current = true;"),
    source.indexOf("  useEffect(() => {\n    onSystemPromptChange?.(systemPrompt);"),
  );
  assert.match(mountSource, /return \(\) => \{\s*sessionHookMountedRef\.current = false;/);
  // The fork triggers the load effect per session identity (AppShell keeps the
  // hook mounted across switches); upstream's mount-only [] deps would never
  // reload here. Strict Mode still works because the warm-session effect,
  // declared earlier, re-asserts the ref before this effect re-runs.
  assert.match(mountSource, /closeEvents\(\);\s*\};/);
  assert.match(mountSource, /\/\/ eslint-disable-next-line react-hooks\/exhaustive-deps\s*\}, \[sessionIdentity\]\);/);
});

test("keeps one reducer-owned assistant partial and consumes Pi JSON deltas", () => {
  const connectedSource = source.slice(
    source.indexOf('case "connected"'),
    source.indexOf('case "agent_start"'),
  );
  const streamSource = source.slice(
    source.indexOf('case "message_start"'),
    source.indexOf('case "message_end"'),
  );
  const messageEndSource = source.slice(
    source.indexOf('case "message_end"'),
    source.indexOf('case "tool_execution_start"'),
  );

  assert.match(source, /streamReducer,[\s\S]*type ClientAssistantMessageEvent/);
  assert.doesNotMatch(source, /streamingMessageRef/);
  assert.match(connectedSource, /dispatch\(\{ type: "end" \}\)/);
  assert.match(connectedSource, /event\.isStreaming === true/);
  assert.match(connectedSource, /agentRunningRef\.current = true/);
  assert.match(streamSource, /msg\?\.role === "assistant"[\s\S]*dispatch\(\{ type: "snapshot", message: msg \}\)/);
  assert.match(streamSource, /event\.assistantMessageEvent as ClientAssistantMessageEvent/);
  assert.match(streamSource, /dispatch\(\{ type: "delta", event: delta \}\)/);
  assert.match(streamSource, /delta\.type !== "toolcall_start" && delta\.type !== "toolcall_delta"/);
  assert.doesNotMatch(streamSource, /case "message_delta"/);
  assert.match(messageEndSource, /const completed = event\.message as AgentMessage/);
  // Transcript system messages (Pi >= 0.86 prompt and tool loadout) never enter the chat.
  assert.match(streamSource, /if \(isSystemMessageEvent\(event\)\) break;/);
  assert.match(messageEndSource, /if \(isSystemMessageEvent\(event\)\) break;/);
  assert.match(messageEndSource, /normalizeToolCalls\(completed\)/);
  assert.match(messageEndSource, /dispatch\(\{ type: "end" \}\)/);
  assert.doesNotMatch(messageEndSource, /streamState\.streamingMessage/);
});

test("restoring a running session does not clear an SSE snapshot", () => {
  const mountSource = source.slice(
    source.indexOf("// Load session on mount"),
    source.indexOf("useEffect(() => {\n    onSystemPromptChange"),
  );

  assert.match(mountSource, /dispatch\(\{ type: "resume" \}\)/);
  assert.doesNotMatch(mountSource, /dispatch\(\{ type: "start" \}\)/);
});

test("shows the latest streamed tool execution progress in the running phase", () => {
  const updateSource = source.slice(
    source.indexOf('case "tool_execution_update"'),
    source.indexOf('case "tool_execution_end"'),
  );

  assert.match(updateSource, /getToolExecutionProgress\(event\.partialResult\)/);
  assert.match(updateSource, /tools: \[\.\.\.tools\.filter\([\s\S]*?, updated\]/);
  assert.match(chatWindowSource, /if \(latest\?\.progress\)/);
  assert.match(chatWindowSource, /chat\.runningNamedTool[\s\S]*latest\.progress/);
});

test("reconnects active shell output to its streaming tool call", () => {
  const updateSource = source.slice(
    source.indexOf('case "tool_execution_update"'),
    source.indexOf('case "tool_execution_end"'),
  );
  const endSource = source.slice(
    source.indexOf('case "tool_execution_end"'),
    source.indexOf('case "queue_update"'),
  );

  assert.match(updateSource, /name === "bash" \|\| name === "powershell"/);
  assert.match(updateSource, /setActiveToolResults/);
  assert.match(updateSource, /content,/);
  assert.match(endSource, /setActiveToolResults[\s\S]*next\.delete\(id\)/);
  assert.match(chatWindowSource, /const map = new Map\(activeToolResults\)/);
  assert.match(chatWindowSource, /<MessageView[^>]*message=\{streamState\.streamingMessage as AgentMessage\} toolResults=\{toolResultsMap\}/);
});

test("extension dialogs preserve the fork silent-completion preference", async () => {
  assert.doesNotMatch(chatWindowSource, /playDoneSound|useAudio/);
  assert.match(chatWindowSource, /<ExtensionDialog key=\{extensionDialog.id\}/);
});

test("suppresses sounds and browser attention for the active subagent session", async () => {
  assert.doesNotMatch(chatWindowSource, /playDoneSound|useAudio/);
  assert.match(appShellSource, /selectedSession\?\.relation\?\.kind === "subagent"\) return/);
  assert.match(appShellSource, /claimExtensionAttentionNotification/);
});

test("routes blocking extension requests through deduplicated browser attention notifications", () => {
  const completionSource = appShellSource.slice(
    appShellSource.indexOf("  const handleAgentEnd = useCallback"),
    appShellSource.indexOf("  const handleAttentionNeeded = useCallback"),
  );
  const extensionRequestSource = source.slice(
    source.indexOf("  const handleExtensionUiRequest = useCallback"),
    source.indexOf("  const settleUiStage = useCallback"),
  );
  const attentionSource = appShellSource.slice(
    appShellSource.indexOf("  const handleAttentionNeeded = useCallback"),
    appShellSource.indexOf("  const handleAutoName = useCallback"),
  );

  assert.match(
    extensionRequestSource,
    /isBlockingExtensionUiRequest\(request\)[\s\S]*?onAttentionNeeded\?\.\(request\)/,
  );
  assert.match(chatWindowSource, /onAttentionNeeded[\s\S]*?onSessionCreated/);
  assert.match(completionSource, /if \(!shouldShowBrowserNotification\(\)\) return/);
  assert.doesNotMatch(completionSource, /pushActive/);
  assert.match(completionSource, /tag: targetSession \? `pi-session-complete:\$\{targetSession\.id\}`/);
  assert.doesNotMatch(completionSource, /document\.visibilityState === "visible"/);
  assert.match(attentionSource, /shouldShowBrowserNotification\(\)/);
  assert.match(attentionSource, /claimExtensionAttentionNotification\(request, notifiedAttentionRequestIdsRef\.current\)/);
  assert.match(attentionSource, /tag: `pi-extension-ui:\$\{request\.id\}`/);
  assert.match(appShellSource, /onAttentionNeeded=\{handleAttentionNeeded\}/);
});

test("refreshes context usage between model calls without letting stale responses overwrite it", () => {
  const reconcileSource = source.slice(
    source.indexOf("const reconcileAgentState"),
    source.indexOf("// Recovery net for missed SSE events"),
  );
  const messageEndSource = source.slice(
    source.indexOf('case "message_end"'),
    source.indexOf('case "tool_execution_start"'),
  );

  assert.match(messageEndSource, /completed\.role === "assistant"[\s\S]*?refreshContextUsage\(sid\)/);
  assert.match(reconcileSource, /applyContextUsage\(state, sid, sessionGeneration, runId, usageRequestId\)/);
  assert.ok(reconcileSource.indexOf("applyContextUsage(state") < reconcileSource.indexOf("if (busy)"));
  assert.match(source, /requestId !== contextUsageRequestIdRef\.current/);
  assert.match(source, /sessionGenerationRef\.current !== generation/);
  assert.match(source, /promptRunIdRef\.current !== runId/);
});

test("follows committed streaming content until the user scrolls away", () => {
  const streamUpdateSource = source.slice(
    source.indexOf('case "message_start"'),
    source.indexOf('case "message_end"'),
  );
  const scrollHandlerSource = source.slice(
    source.indexOf("const handleScrollPositionChange"),
    source.indexOf("// Load session on mount"),
  );
  const scrollToBottomSource = source.slice(
    source.indexOf("const scrollToBottom"),
    source.indexOf("const currentModel"),
  );

  assert.doesNotMatch(streamUpdateSource, /requestAnimationFrame/);
  assert.doesNotMatch(scrollToBottomSource, /scrollIntoView/);
  assert.match(scrollToBottomSource, /container\.scrollTo\(\{ top: container\.scrollHeight, behavior \}\)/);
  assert.match(scrollHandlerSource, /userScrollIntentUntilRef\.current/);
  assert.match(source, /userScrollIntentUntilRef\.current = Date\.now\(\) \+ USER_SCROLL_INTENT_MS;\s*ignoreProgrammaticScrollUntilRef\.current = 0/);
  assert.match(scrollHandlerSource, /isNearBottomRef\.current =/);
  assert.match(chatWindowSource, /new ResizeObserver\(followTail\)/);
});

test("starts each prompt at the tail without pinning the user message", () => {
  assert.match(source, /isNearBottomRef\.current = true;\s*setMessages\(\(prev\) => \[\.\.\.prev, userMsg\]\)/);
  assert.doesNotMatch(source, /pendingScrollToUserRef|scrollUserMsgToTop|promptAnchorActive/);
  assert.doesNotMatch(chatWindowSource, /promptAnchorSpacerHeight|chatColumnRef|lastUserMsgRef/);
});

test("restores an in-page session viewport without the default tail jump", () => {
  assert.match(source, /const initialScrollDoneRef = useRef\(Boolean\(opts\.deferInitialScroll\)\)/);
  assert.match(source, /const scrollToMessage = useCallback\(\(element: HTMLElement, viewportOffset = 16\)/);
  assert.match(source, /container\.scrollTop\s+- viewportOffset/);
  assert.match(chatWindowSource, /deferInitialScroll: Boolean\(pendingScrollRestore\)/);
  assert.match(chatWindowSource, /isScrollAtTail\(container\.scrollTop, container\.clientHeight, container\.scrollHeight\)/);
  assert.match(chatWindowSource, /findChatScrollAnchor\(/);
  assert.match(chatWindowSource, /while \(hasMore && before && !controller\.signal\.aborted\)/);
  assert.match(chatWindowSource, /context\.oldestEntryId === position\.oldestEntryId/);
  assert.match(chatWindowSource, /if \(!context\) \{\s*scrollToBottom\("instant"\);\s*setPendingScrollRestore\(null\);/);
  assert.match(chatWindowSource, /scrollToMessage\(element, position\.anchorOffset\)/);
  assert.match(chatWindowSource, /visibility: pendingScrollRestore && !loading \? "hidden" : undefined/);
});

test("pages older chat messages without flashing the restored viewport", () => {
  const observerSource = chatWindowSource.slice(
    chatWindowSource.indexOf("IntersectionObserver on the sentinel"),
    chatWindowSource.indexOf("Push session stats up to AppShell"),
  );
  assert.match(observerSource, /if \(!container \|\| loading\) return/);
  assert.match(observerSource, /setSentinelNode/);
  assert.match(observerSource, /useLayoutEffect\(\(\) => \{/);
  assert.match(observerSource, /restoreScrollTop\(container\.scrollHeight, prevScrollDistanceRef\.current\)/);
  assert.doesNotMatch(observerSource, /\[visibleCount, messages\.length, scrollContainerRef\]/);
  assert.match(chatWindowSource, /ref=\{setSentinelNode\}/);
});

test("scrolls the chat container directly instead of using scrollIntoView", async () => {
  const start = source.indexOf("const scrollToBottom = useCallback");
  const block = source.slice(start, source.indexOf("}, []);", start));
  assert.match(block, /scrollContainerRef.current/);
  assert.match(block, /container.scrollTo\(/);
  assert.doesNotMatch(block, /\.scrollIntoView\(/);
});

test("hands off live messages to completed messages without an empty phase", () => {
  const messageEndSource = source.slice(
    source.indexOf('case "message_end"'),
    source.indexOf('case "tool_execution_start"'),
  );
  assert.match(chatWindowSource, /key="streaming-live"/);
  assert.match(messageEndSource, /setMessages\(/);
  assert.match(messageEndSource, /dispatch\(\{ type: "end" \}\)/);
  assert.match(messageEndSource, /setAgentPhase\(\{ kind: "waiting_model" \}\)/);
});

test("fork tail-follow observes layout instead of pinning the user prompt", async () => {
  assert.doesNotMatch(chatWindowSource, /promptAnchorSpacer/);
  assert.match(chatWindowSource, /new ResizeObserver\(followTail\)/);
  assert.match(chatWindowSource, /observer\?\.disconnect\(\)/);
});

test("trailing spacer follows the fork overlay composer height", async () => {
  assert.match(chatWindowSource, /style=\{\{ height: bottomComposerHeight \}\}/);
  assert.match(chatWindowSource, /new ResizeObserver\(updateBottomComposerHeight\)/);
  assert.doesNotMatch(chatWindowSource, /promptAnchorSpacer/);
});

test("keeps a detached viewport in place when streaming completes", () => {
  const scrollEffectSource = source.slice(
    source.indexOf("useLayoutEffect(() => {\n    if (messages.length > 0)"),
    source.indexOf("// Load model list"),
  );

  assert.match(scrollEffectSource, /!agentRunningRef\.current && isNearBottomRef\.current[\s\S]*?scrollToBottom\("auto"\)/);
  assert.doesNotMatch(scrollEffectSource, /\|\|/);
  assert.match(source, /addEventListener\("scroll", handleScrollPositionChange/);
});

test("carries the last tool preset and effort level into new sessions", async () => {
  assert.match(source, /function loadStoredToolPreset\(\): ToolPreset \{ return getPreferredToolPreset\(\)/);
  assert.match(source, /asConcreteThinkingLevel\(getPref\(APP_PREF_KEYS.thinkingLevel\)\)/);
  assert.match(source, /isNew \? loadStoredToolPreset\(\) : CONFIGURED_TOOL_PRESET/);
  assert.match(source, /isNew \? loadStoredThinkingLevel\(\) : null/);
  assert.match(source, /const selectedThinkingLevel = thinkingLevelOverrideRef.current/);
  assert.match(source, /removePref\(APP_PREF_KEYS.thinkingLevel\)/);
  assert.match(source, /setPref\(APP_PREF_KEYS.thinkingLevel, level\)/);
});

test("auto-compact slash command toggles session auto-compaction", () => {
  const commandSource = source.slice(
    source.indexOf('case "auto-compact"'),
    source.indexOf('case "reload"'),
  );
  assert.ok(commandSource.length > 0, "auto-compact case not found before reload case");
  assert.match(commandSource, /sendAgentCommand<AgentStateResponse>\(sid, \{\s*type: "get_state"\s*\}\)/);
  assert.match(commandSource, /!\(liveState\?\.autoCompactionEnabled \?\? true\)/);
  assert.match(commandSource, /sendAgentCommand\(sid, \{\s*type: "set_auto_compaction",\s*enabled: nextEnabled,\s*\}\)/);
  assert.match(commandSource, /setAutoCompactionEnabled\(nextEnabled\)/);
  assert.doesNotMatch(commandSource, /!autoCompactionEnabled/);
  // State mirrors the wrapper so the toggle reflects server-side changes too.
  assert.match(source, /setAutoCompactionEnabled\(state\?\.autoCompactionEnabled \?\? true\)/);
  assert.match(source, /setAutoCompactionEnabled\(liveState\.autoCompactionEnabled \?\? true\)/);
});
