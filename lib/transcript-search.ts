import { createHash } from "crypto";
import { stat } from "fs/promises";
import { getSessionEntries, listAllSessions, buildSessionContext } from "./session-reader";
import { getRpcSession, getLiveSessionSnapshots } from "./rpc-manager";
import { resolveProject } from "./worktree";
import { UiError } from "./web-ui-store";
import type { SessionEntry, SessionInfo } from "./types";

export interface TranscriptDocument { entryId: string; displayEntryId: string; field: string; kind: string; text: string }
export interface TranscriptResult extends Omit<TranscriptDocument, "text"> { sessionId: string; title: string; project: string; snippet: string }
export function searchTerms(query: string): string[] {
  return [...query.matchAll(/"([^"]+)"|(\S+)/g)].map(match => (match[1] ?? match[2]).toLowerCase());
}
export function matchesTranscript(text: string, terms: string[]) { const lower = text.toLowerCase(); return terms.length > 0 && terms.every(term => lower.includes(term)); }
export function transcriptSnippet(text: string, terms: string[]) {
  const index = Math.min(...terms.map(term => text.toLowerCase().indexOf(term)).filter(index => index >= 0));
  const start = Math.max(0, index - 80); const end = Math.min(text.length, start + 280);
  return `${start ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}
export function transcriptDocuments(entries: SessionEntry[]): TranscriptDocument[] {
  const documents: TranscriptDocument[] = [];
  const calls = new Map<string, string>();
  for (const entry of entries) {
    if (entry.type !== "message") continue;
    const message = entry.message as unknown as Record<string, unknown>;
    const add = (field: string, kind: string, text: unknown, displayEntryId = entry.id) => {
      if (typeof text === "string" && text) documents.push({ entryId: entry.id, displayEntryId, field, kind, text });
    };
    if (message.role === "bashExecution") {
      add("command", "command", message.command); add("output", "tool_output", message.output); continue;
    }
    const blocks = Array.isArray(message.content) ? message.content as Record<string, unknown>[] : [];
    const kind = message.role === "user" ? "question" : message.role === "assistant" ? "answer" : "tool_output";
    if (!["user", "assistant", "toolResult"].includes(String(message.role))) continue;
    const owner = message.role === "toolResult" ? calls.get(String(message.toolCallId)) ?? entry.id : entry.id;
    if (typeof message.content === "string") add("text", kind, message.content, owner);
    blocks.forEach((block, index) => {
      if (block.type === "text") add(`text:${index}`, kind, block.text, owner);
      if (block.type === "toolCall") {
        const callId = String(block.toolCallId ?? block.id);
        calls.set(callId, entry.id);
        add(`arguments:${index}`, "tool_arguments", `${block.toolName ?? block.name}\n${JSON.stringify(block.input ?? block.arguments, null, 2)}`);
      }
    });
  }
  return documents;
}

type Cached = { stamp: string; docs: TranscriptDocument[]; bytes: number };
declare global { var __piTranscriptCache: Map<string, Cached> | undefined; }
async function documentsFor(session: SessionInfo): Promise<TranscriptDocument[]> {
  const runtime = getRpcSession(session.id);
  if (runtime?.isAlive()) return transcriptDocuments(runtime.inner.sessionManager.getEntries() as unknown as SessionEntry[]);
  const info = await stat(session.path);
  if (info.size > 32 * 1024 * 1024) throw new Error("Session exceeds 32 MiB search limit");
  const cache = globalThis.__piTranscriptCache ??= new Map();
  const stamp = `${info.mtimeMs}:${info.size}`;
  const old = cache.get(session.path);
  if (old?.stamp === stamp) { cache.delete(session.path); cache.set(session.path, old); return old.docs; }
  const docs = transcriptDocuments(getSessionEntries(session.path));
  const bytes = docs.reduce((sum, doc) => sum + doc.text.length * 2, 0);
  cache.delete(session.path);
  if (bytes <= 32 * 1024 * 1024) cache.set(session.path, { stamp, docs, bytes });
  let total = [...cache.values()].reduce((sum, value) => sum + value.bytes, 0);
  while (total > 32 * 1024 * 1024 || cache.size > 100) { const key = cache.keys().next().value!; total -= cache.get(key)!.bytes; cache.delete(key); }
  return docs;
}
export async function searchableSessions(): Promise<SessionInfo[]> {
  const stored = await listAllSessions();
  const live = getLiveSessionSnapshots(new Set(stored.map(s => s.id)));
  return [...stored, ...await Promise.all(live.map(async s => ({ ...s, projectRoot: (await resolveProject(s.cwd)).projectRoot })))] as SessionInfo[];
}
export async function searchTranscripts(query: string, project: string | null, sessionId: string | null, cursor: string | null, signal: AbortSignal) {
  if (!query.trim() || query.length > 256) throw new UiError("Search must contain 1–256 characters");
  const terms = searchTerms(query);
  if (!terms.length || terms.length > 16) throw new UiError("Use 1–16 search terms");
  const all = await searchableSessions();
  const sessions = all.filter(s => (!project || (s.projectRoot ?? s.cwd) === project) && (!sessionId || s.id === sessionId));
  const stamps = await Promise.all(sessions.map(async session => {
    const runtime = getRpcSession(session.id);
    if (runtime?.isAlive()) return [session.id, runtime.inner.sessionManager.getEntries().length, runtime.inner.sessionManager.getLeafId()];
    try { const info = await stat(session.path); return [session.id, info.mtimeMs, info.size]; } catch { return [session.id, "missing"]; }
  }));
  const revision = createHash("sha256").update(JSON.stringify([query, project, sessionId, stamps])).digest("hex");
  let sessionOffset = 0; let documentOffset = 0;
  if (cursor) {
    try {
      if (cursor.length > 512) throw new Error();
      const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString());
      if (parsed.revision !== revision) throw new UiError("Sessions changed. Search again.", 409);
      if (!Number.isInteger(parsed.s) || !Number.isInteger(parsed.d) || parsed.s < 0 || parsed.d < 0 || parsed.s > sessions.length) throw new Error();
      sessionOffset = parsed.s; documentOffset = parsed.d;
    } catch (error) { if (error instanceof UiError) throw error; throw new UiError("Invalid search cursor"); }
  }
  const results: TranscriptResult[] = []; const skipped: string[] = [];
  const deadline = Date.now() + 6000; let scanned = 0; let visited = 0;
  outer: for (; sessionOffset < sessions.length; sessionOffset++, documentOffset = 0) {
    signal.throwIfAborted();
    if (visited >= 25 || Date.now() > deadline) break;
    visited++;
    const session = sessions[sessionOffset]; let docs: TranscriptDocument[];
    try { docs = await documentsFor(session); } catch { skipped.push(session.id); scanned++; continue; }
    for (; documentOffset < docs.length; documentOffset++) {
      if (documentOffset % 100 === 0) { await new Promise<void>(resolve => setImmediate(resolve)); signal.throwIfAborted(); }
      if (results.length >= 50 || Date.now() > deadline) break outer;
      const doc = docs[documentOffset];
      if (matchesTranscript(doc.text, terms)) {
        const { text, ...identity } = doc;
        results.push({ ...identity, sessionId: session.id, title: session.name || session.firstMessage || session.id, project: session.projectRoot ?? session.cwd, snippet: transcriptSnippet(text, terms) });
      }
    }
    scanned++;
  }
  const nextCursor = sessionOffset < sessions.length ? Buffer.from(JSON.stringify({ revision, s: sessionOffset, d: documentOffset })).toString("base64url") : null;
  return { results, nextCursor, skipped, scanned, totalSessions: sessions.length };
}
export async function validateTranscriptResult(sessionId: string, entryId: string, field: string, query: string) {
  if (!query.trim() || query.length > 256) throw new UiError("Invalid search query");
  const session = (await searchableSessions()).find(s => s.id === sessionId);
  if (!session) throw new UiError("Session no longer exists", 404);
  const document = (await documentsFor(session)).find(doc => doc.entryId === entryId && doc.field === field);
  if (!document || !matchesTranscript(document.text, searchTerms(query))) throw new UiError("Result changed. Search again.", 409);
  const runtime = getRpcSession(session.id);
  const entries = runtime?.isAlive() ? runtime.inner.sessionManager.getEntries() as unknown as SessionEntry[] : getSessionEntries(session.path);
  const context = buildSessionContext(entries, entryId, { deferThinking: true, deferToolResultImages: true });
  if (!context.entryIds.includes(document.displayEntryId)) throw new UiError("Result branch changed. Search again.", 409);
  const { text, ...identity } = document;
  return { session, target: { ...identity, sessionId, query, snippet: transcriptSnippet(text, searchTerms(query)), context } };
}
