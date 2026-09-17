import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./useAgentSession.ts", import.meta.url), "utf8");
const chatWindowSource = await readFile(new URL("../components/ChatWindow.tsx", import.meta.url), "utf8");
const nativeThemeSource = await readFile(new URL("../app/native-theme.css", import.meta.url), "utf8");
const rpcManagerSource = await readFile(new URL("../lib/rpc-manager.ts", import.meta.url), "utf8");

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
  assert.match(sendSource, /if \(promptRequestStarted && sentSessionId\) \{[\s\S]*?waitForPromptSettlement/);
  assert.match(sendSource, /if \(promptRequestStarted && sentSessionId\) \{[\s\S]*?return;[\s\S]*?\}[\s\S]*?closeEvents\(\)/);
  assert.match(sendSource, /opts\.chatInputRef\?\.current\?\.replaceMessage\(userMsg\)/);
  assert.doesNotMatch(sendSource, /if \(e instanceof EventStreamConnectionError\)/);
});

test("reuses an open event stream and hides an empty agent phase", () => {
  const ensureSource = source.slice(
    source.indexOf("const ensureEventsConnected"),
    source.indexOf("const respondToExtensionUi"),
  );

  assert.match(ensureSource, /eventSourceSessionIdRef\.current === sid/);
  assert.match(ensureSource, /current\.readyState === EventSource\.OPEN/);
  assert.match(ensureSource, /attempt\?\.source === current && attempt\.pending/);
  assert.match(chatWindowSource, /agentRunning && !streamState\.streamingMessage && agentPhase/);
  assert.match(chatWindowSource, /return null;/);
});

test("does not play completion sounds — the feature was removed", () => {
  assert.doesNotMatch(chatWindowSource, /playDoneSound|soundedExtensionDialog|useAudio/);
});

test("assembles Pi 0.84 deltas and reseeds the stream after reconnects", () => {
  const updateSource = source.slice(
    source.indexOf('case "message_update"'),
    source.indexOf('case "message_end"'),
  );
  const reconcileSource = source.slice(
    source.indexOf("const reconcileAgentState"),
    source.indexOf("// Recovery net for missed SSE events"),
  );

  assert.match(updateSource, /applyAssistantMessageEvent\(/);
  assert.match(updateSource, /streamingMessageRef\.current/);
  assert.match(updateSource, /event\.assistantMessageEvent as ClientAssistantMessageEvent/);
  assert.match(updateSource, /Compatibility with pre-0\.84 servers/);
  assert.match(reconcileSource, /seedStreamingSnapshot\(state\.streamingMessage\)/);
  assert.match(rpcManagerSource, /streamingMessage: this\.inner\.agent\.state\?\.streamingMessage/);
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
  assert.ok(reconcileSource.indexOf("applyContextUsage(state") < reconcileSource.indexOf("if (busy || !agentRunningRef.current) return"));
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

  assert.doesNotMatch(streamUpdateSource, /requestAnimationFrame/);
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

test("scrolls the chat container directly instead of using scrollIntoView", () => {
  const scrollToBottomSource = source.slice(
    source.indexOf("const scrollToBottom = useCallback"),
    source.indexOf("// Parent switched the active session"),
  );
  assert.doesNotMatch(scrollToBottomSource, /scrollIntoView/);
  assert.match(scrollToBottomSource, /scrollContainerRef\.current/);
  assert.match(scrollToBottomSource, /scrollHeight - container\.clientHeight/);
  assert.match(scrollToBottomSource, /container\.scrollTop = top/);
});

test("hands off live messages to completed messages without an empty phase", () => {
  const messageEndSource = source.slice(
    source.indexOf('case "message_end"'),
    source.indexOf('case "tool_execution_start"'),
  );
  assert.match(chatWindowSource, /key="streaming-live"/);
  assert.match(messageEndSource, /setMessages\(/);
  assert.match(messageEndSource, /dispatch\(\{ type: "reset" \}\)/);
  assert.match(messageEndSource, /setAgentPhase\(null\)/);
  assert.doesNotMatch(messageEndSource, /waiting_model/);
});

test("sizes the message tail from the rendered bottom composer", () => {
  assert.match(chatWindowSource, /const bottomComposerRef = useRef<HTMLDivElement \| null>\(null\)/);
  assert.match(chatWindowSource, /useLayoutEffect\(\(\) => \{/);
  assert.match(chatWindowSource, /new ResizeObserver\(updateBottomComposerHeight\)/);
  assert.match(chatWindowSource, /bottomComposerScrollFrameRef = useRef<number \| null>\(null\)/);
  assert.match(chatWindowSource, /distanceFromBottom <= Math\.abs\(nextHeight - previousHeight\) \+ 1/);
  assert.match(chatWindowSource, /scrollToBottom\("auto"\)/);
  assert.match(chatWindowSource, /ref=\{bottomComposerRef\}[\s\S]*?className="absolute inset-x-0 bottom-0 z-20"/);
  assert.match(chatWindowSource, /height: bottomComposerHeight/);
});

test("keeps the message column and composer on the scrollport axis", () => {
  assert.match(chatWindowSource, /scrollbarGutter: "stable both-edges"/);
  assert.doesNotMatch(chatWindowSource, /--chat-scrollbar-inset/);
  assert.doesNotMatch(nativeThemeSource, /width: calc\(100% - 16px\)/);
});

test("carries the last tool preset and effort level into new sessions", () => {
  // Stored-preference helpers validate the pref values before use.
  assert.match(source, /const TOOL_PRESET_VALUES = new Set\(\["none", "default", "full"\]\)/);
  assert.match(source, /const EXPLICIT_THINKING_LEVELS = new Set\(\["off", "minimal", "low", "medium", "high", "xhigh", "max"\]\)/);
  assert.match(source, /function loadStoredToolPreset\(\)[\s\S]*?TOOL_PRESET_VALUES\.has\(raw\)[\s\S]*?: "default"/);
  assert.match(source, /function loadStoredThinkingLevel\(\)[\s\S]*?EXPLICIT_THINKING_LEVELS\.has\(raw\)[\s\S]*?: null/);

  // Only brand-new sessions seed their toolbar state from the stored prefs;
  // existing sessions must keep showing their own saved values until loaded.
  assert.match(source, /useState<"none" \| "default" \| "full">\(\(\) => \(isNew \? loadStoredToolPreset\(\) : "default"\)\)/);
  assert.match(source, /useState<ThinkingLevelOption>\(\(\) => \(isNew \? loadStoredThinkingLevel\(\) : null\) \?\? "auto"\)/);
  assert.match(source, /useRef<Exclude<ThinkingLevelOption, "auto"> \| null>\(isNew \? loadStoredThinkingLevel\(\) : null\)/);

  // Switching identities back to a new session re-seeds both, including the
  // creation-time override ref so ensureNewSession sends the stored effort.
  const resetSource = source.slice(
    source.indexOf("if (isNew) {\n        // New sessions relaunch"),
    source.indexOf("const currentModel = currentModelOverride"),
  );
  assert.match(resetSource, /const storedThinking = loadStoredThinkingLevel\(\)/);
  assert.match(resetSource, /setToolPreset\(loadStoredToolPreset\(\)\)/);
  assert.match(resetSource, /setThinkingLevel\(storedThinking \?\? "auto"\)/);
  assert.match(resetSource, /thinkingLevelOverrideRef\.current = storedThinking/);

  // Explicit picks persist; "auto" clears the effort preference again.
  const thinkingSource = source.slice(
    source.indexOf("const handleThinkingLevelChange = useCallback"),
    source.indexOf("const handleToolPresetChange = useCallback"),
  );
  assert.match(thinkingSource, /if \(level === "auto"\) removePref\(APP_PREF_KEYS\.thinkingLevel\)/);
  assert.match(thinkingSource, /else setPref\(APP_PREF_KEYS\.thinkingLevel, level\)/);

  const toolSource = source.slice(
    source.indexOf("const handleToolPresetChange = useCallback"),
    source.indexOf("const markUserScrollIntent = useCallback"),
  );
  assert.match(toolSource, /setPref\(APP_PREF_KEYS\.toolPreset, preset\)/);

  // ensureNewSession ships both stored selections so pi applies (and clamps
  // the effort level to the model's supported set) at construction time.
  const ensureSource = source.slice(
    source.indexOf("const ensureNewSession = useCallback"),
    source.indexOf("const loadSlashCommands = useCallback"),
  );
  assert.match(ensureSource, /const toolNames = getToolNamesForPreset\(toolPreset\)/);
  assert.match(ensureSource, /const selectedThinkingLevel = thinkingLevelOverrideRef\.current/);
  assert.match(ensureSource, /toolNames,\n\s+\.\.\.\(selectedModel/);
  assert.match(ensureSource, /\.\.\.\(selectedThinkingLevel\s*\?\s*\{ thinkingLevel: selectedThinkingLevel \}/);
});
