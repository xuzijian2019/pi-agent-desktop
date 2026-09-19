import {
  createAgentSessionFromServices, createAgentSessionServices, getAgentDir,
  SessionManager, SettingsManager, type AgentSession, type FileEntry, type SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { randomUUID } from "node:crypto";
import { getRpcSession } from "./rpc-manager";
import { resolveSessionPath } from "./session-reader";
import { normalizeToolCalls } from "./normalize";
import type { AgentMessage } from "./types";

export type EphemeralKind = "side" | "recap";
export const EPHEMERAL_IDLE_MS = 5 * 60_000;
export const EPHEMERAL_PROMPT_MS = 2 * 60_000;
export const SIDE_BOUNDARY = "You are in a temporary, read-only side conversation. Everything before this boundary is inherited reference material. The parent task is being handled separately. Do not continue or execute the parent task. Answer only the question and follow-up instructions after this boundary. You may inspect files using the available read-only tools.";
export const RECAP_PROMPT = "Summarize the inherited conversation concisely in the same language as the conversation. Use only relevant, non-empty sections from: Goal, Completed, Current state, Important decisions, Files discussed or modified, Open issues, Next steps. Do not continue the work. Report only supported information and do not claim an exact current Git diff.";

type RecordState = {
  id: string; ownerId: string; kind: EphemeralKind; parentId: string;
  snapshotLeaf?: string; snapshotAt?: string; inheritedIds?: Set<string>;
  session?: AgentSession; controller: AbortController; busy: boolean;
  timer?: ReturnType<typeof setTimeout>; operation?: Promise<unknown>; closing?: Promise<void>;
};
declare global {
  var __piEphemeralSessions: Map<string, RecordState> | undefined;
  var __piEphemeralClosed: Map<string, { ownerId: string; timer: ReturnType<typeof setTimeout> }> | undefined;
}
const registry = () => (globalThis.__piEphemeralSessions ??= new Map());
const closed = () => (globalThis.__piEphemeralClosed ??= new Map());
const deepClone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
export const validEphemeralToken = (value: unknown): value is string => typeof value === "string" && /^[\w-]{1,100}$/.test(value);

/** Keep the complete prefix, including the current user turn, but no partial tool group. */
export function protocolSafePrefix(entries: SessionEntry[]): SessionEntry[] {
  const copy = deepClone(entries);
  const pending = new Set<string>();
  let groupStart = -1;
  for (let index = 0; index < copy.length; index++) {
    const entry = copy[index];
    if (entry.type !== "message") continue;
    const message = entry.message;
    if (message.role === "assistant") {
      if (pending.size) return copy.slice(0, groupStart);
      // Streaming messages normally are not appended by the SDK until settled.
      if (message.stopReason === "aborted" || message.stopReason === "error") return copy.slice(0, index);
      for (const block of message.content) if (block.type === "toolCall") {
        if (!pending.size) groupStart = index;
        pending.add(block.id);
      }
    } else if (message.role === "toolResult") {
      if (!pending.delete(message.toolCallId)) return copy.slice(0, groupStart < 0 ? index : groupStart);
      if (!pending.size) groupStart = -1;
    } else if (pending.size) return copy.slice(0, groupStart);
  }
  return pending.size ? copy.slice(0, groupStart) : copy;
}

function touch(record: RecordState) {
  if (record.controller.signal.aborted) return;
  clearTimeout(record.timer);
  record.timer = setTimeout(() => void closeEphemeral(record.id, record.ownerId), EPHEMERAL_IDLE_MS);
  record.timer.unref?.();
}
function checkOpen(record: RecordState) {
  if (record.controller.signal.aborted) throw new Error("Temporary conversation was cancelled");
}
function owned(id: string, ownerId: string) {
  const record = registry().get(id);
  if (!record || record.ownerId !== ownerId || !record.session || record.controller.signal.aborted) throw new Error("Temporary conversation not found");
  return record as RecordState & { session: AgentSession };
}

export async function createEphemeral(input: { id?: string; parentId: string; ownerId: string; leafId?: string; kind: EphemeralKind; signal?: AbortSignal }) {
  if (!validEphemeralToken(input.ownerId) || (input.id !== undefined && !validEphemeralToken(input.id))) throw new Error("Invalid owner or temporary ID");
  const id = input.id ?? randomUUID();
  if (closed().has(id) || input.signal?.aborted) throw new Error("Temporary conversation was cancelled");
  if (registry().has(id) || [...registry().values()].some(record => record.ownerId === input.ownerId && record.kind === input.kind)) throw new Error(`${input.kind === "side" ? "Side chat" : "Recap"} already active`);
  // Reserve ownership before the first await, including disk resolution and SDK initialization.
  const record: RecordState = { id, ownerId: input.ownerId, parentId: input.parentId, kind: input.kind, controller: new AbortController(), busy: true };
  registry().set(id, record);
  touch(record);
  const abort = () => { void closeEphemeral(id, input.ownerId); };
  input.signal?.addEventListener("abort", abort, { once: true });
  const initialize = async () => {
    let live = getRpcSession(input.parentId)?.getSnapshotSource();
    let source = live?.manager;
    if (!source) {
      const path = await resolveSessionPath(input.parentId);
      if (!path) throw new Error("Parent session not found");
      live = getRpcSession(input.parentId)?.getSnapshotSource();
      source = live?.manager ?? SessionManager.open(path);
    }
    checkOpen(record);
    // An absent leaf means the live branch, never the UI's stale last rendered message.
    const leaf = input.leafId ?? source.getLeafId();
    if (!leaf || !source.getEntry(leaf)) throw new Error("The selected conversation branch is no longer available");
    const entries = protocolSafePrefix(source.getBranch(leaf));
    if (!entries.some(entry => entry.type === "message")) throw new Error("This conversation has no complete context yet");
    record.snapshotLeaf = entries.at(-1)!.id;
    record.snapshotAt = new Date().toISOString();
    const change = [...entries].reverse().find(entry => entry.type === "model_change");
    const identity = live?.model ?? (change?.type === "model_change" ? { provider: change.provider, id: change.modelId } : undefined);
    if (!identity) throw new Error("The parent model could not be determined");
    const manager = SessionManager.inMemory(source.getCwd(), { id: randomUUID() }, entries as FileEntry[]);
    manager.appendCustomMessageEntry("pi-web-ephemeral-boundary", SIDE_BOUNDARY, false);
    record.inheritedIds = new Set(manager.getEntries().map(entry => entry.id));
    const settings = SettingsManager.create(source.getCwd(), getAgentDir());
    const services = await createAgentSessionServices({
      cwd: source.getCwd(), agentDir: getAgentDir(), modelRuntimeSignal: record.controller.signal,
      settingsManager: SettingsManager.inMemory({ ...settings.getGlobalSettings(), ...settings.getProjectSettings(), packages: [], extensions: [], skills: [], prompts: [], themes: [] }),
      resourceLoaderOptions: {
        noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true,
        // Survives SDK compaction without changing the parent's prompt or transcript.
        appendSystemPromptOverride: base => [...base, SIDE_BOUNDARY],
      },
    });
    checkOpen(record);
    const model = services.modelRuntime.getModel(identity.provider, identity.id);
    if (!model) throw new Error(`Parent model is unavailable without extensions: ${identity.provider}/${identity.id}`);
    const { session } = await createAgentSessionFromServices({
      services, sessionManager: manager, model,
      ...(input.kind === "recap" ? { thinkingLevel: "low" as const, tools: [] } : { tools: ["read", "grep", "find", "ls"] }),
    });
    record.session = session;
    if (record.controller.signal.aborted) { session.dispose(); record.session = undefined; checkOpen(record); }
    record.busy = false;
    touch(record);
    return { id, parentId: input.parentId, snapshotLeaf: record.snapshotLeaf!, snapshotAt: record.snapshotAt! };
  };
  const initialization = initialize();
  record.operation = initialization;
  try { return await initialization; }
  catch (error) { await closeEphemeral(id, input.ownerId); throw error; }
  finally { input.signal?.removeEventListener("abort", abort); }
}

export async function promptEphemeral(id: string, ownerId: string, text: string, signal?: AbortSignal) {
  const record = owned(id, ownerId);
  if (record.busy) throw new Error("Temporary conversation is busy");
  const prompt = text.trim();
  if (!prompt) throw new Error("A question is required");
  if (/^[\/!]/.test(prompt)) throw new Error("Commands are not supported in temporary conversations");
  if (signal?.aborted) { await closeEphemeral(id, ownerId); throw new Error("Temporary conversation was cancelled"); }
  record.busy = true; touch(record);
  const before = new Set(record.session.sessionManager.getEntries().map(entry => entry.id));
  const abort = () => { void closeEphemeral(id, ownerId); };
  signal?.addEventListener("abort", abort, { once: true });
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; abort(); }, EPHEMERAL_PROMPT_MS);
  record.operation = (async () => {
    await record.session.prompt(prompt, { expandPromptTemplates: false });
    await record.session.waitForIdle();
  })();
  try {
    await record.operation;
    if (timedOut) throw new Error("Temporary response timed out");
    checkOpen(record);
    // IDs remain valid when compaction adds entries; never fall back to inherited answers.
    const entries = record.session.sessionManager.getEntries();
    const answer = entries.filter(entry => !before.has(entry.id) && entry.type === "message" && entry.message.role === "assistant").at(-1);
    const message = answer?.type === "message" && answer.message.role === "assistant" ? answer.message : undefined;
    const textAnswer = message?.content.filter(block => block.type === "text").map(block => block.text).join("\n").trim();
    if (!textAnswer || !message || ["error", "aborted"].includes(message.stopReason)) throw new Error("The temporary model did not produce a complete answer");
    const messages = entries.filter(entry => !record.inheritedIds?.has(entry.id) && entry.type === "message")
      .map(entry => normalizeToolCalls(deepClone((entry as { message: AgentMessage }).message)));
    touch(record);
    return { messages, answer: textAnswer, snapshotAt: record.snapshotAt!, parentId: record.parentId };
  } catch (error) {
    await closeEphemeral(id, ownerId);
    throw error;
  } finally {
    clearTimeout(timeout); signal?.removeEventListener("abort", abort); record.busy = false;
  }
}

export function heartbeatEphemeral(id: string, ownerId: string) { touch(owned(id, ownerId)); }

export async function closeEphemeral(id: string, ownerId: string): Promise<void> {
  if (!validEphemeralToken(id) || !validEphemeralToken(ownerId)) return;
  const record = registry().get(id);
  if (record && record.ownerId !== ownerId) return;
  // A client picks its ID before POST so DELETE can also cancel a delayed creation.
  if (!closed().has(id)) {
    const timer = setTimeout(() => closed().delete(id), EPHEMERAL_IDLE_MS);
    timer.unref?.(); closed().set(id, { ownerId, timer });
  }
  if (!record) return;
  if (record.closing) return record.closing;
  record.controller.abort(); clearTimeout(record.timer); registry().delete(id);
  record.closing = (async () => {
    if (record.session) await record.session.abort().catch(() => {});
    await record.operation?.catch(() => {});
    record.session?.dispose(); record.session = undefined;
  })();
  return record.closing;
}

export async function runRecap(input: { id?: string; parentId: string; ownerId: string; leafId?: string; signal?: AbortSignal }) {
  const created = await createEphemeral({ ...input, kind: "recap" });
  try { return await promptEphemeral(created.id, input.ownerId, RECAP_PROMPT, input.signal); }
  finally { await closeEphemeral(created.id, input.ownerId); }
}

export async function promptSideEphemeral(id: string, ownerId: string, text: string, signal?: AbortSignal) {
  if (owned(id, ownerId).kind !== "side") throw new Error("Recap does not accept follow-up messages");
  return promptEphemeral(id, ownerId, text, signal);
}
