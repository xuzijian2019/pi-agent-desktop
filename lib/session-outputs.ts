import { createHash } from "crypto";
import { existsSync, realpathSync, statSync } from "fs";
import { basename, extname, resolve } from "path";
import { resolveLocalFileHref } from "./file-links";
import { resolveSessionPath, buildSessionContext } from "./session-reader";
import { openSessionManagerForRead } from "./session-manager-access";
import { getAllowedFileRoots, isExistingFilePathAllowed, isFilePathAllowed } from "./file-access";
import { isFilePathReferencedByEntries, isValidSessionId } from "./session-file-references-core";
import { readUiStore, updateUiStore, UiError } from "./web-ui-store";
import type { AgentMessage, SessionEntry } from "./types";
import type { OutputItem, OutputOverride } from "./output-types";

export function outputKind(path: string): OutputItem["kind"] {
  const ext = extname(path).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"].includes(ext)) return "images";
  if ([".mp3", ".wav", ".ogg", ".m4a", ".flac"].includes(ext)) return "audio";
  if ([".md", ".pdf", ".docx", ".pptx", ".xlsx", ".csv", ".html", ".txt"].includes(ext)) return "documents";
  return "other";
}
function canonical(path: string) { try { return realpathSync(path); } catch { return resolve(path); } }
export function discoverOutputs(sessionId: string, cwd: string, messages: AgentMessage[], entryIds: string[], leafId: string | null): OutputItem[] {
  const items = new Map<string, OutputItem>();
  const writes = new Map<string, { path: string; entryId: string }>();
  const add = (path: string, entryId: string, reason: string) => {
    path = canonical(path);
    const previous = items.get(path);
    const sources = [...new Set([...(previous?.sourceEntryIds ?? []), entryId])];
    items.set(path, { id: createHash("sha256").update(sessionId + "\0" + path).digest("hex"), path, label: basename(path), kind: outputKind(path), sourceEntryIds: sources, leafId, reason, revision: 0, pinned: false, hidden: false, available: false, otherBranch: false });
  };
  messages.forEach((message, index) => {
    const entryId = entryIds[index];
    if (message.role === "assistant") for (const block of message.content) {
      if (block.type === "text") for (const match of block.text.matchAll(/!?\[[^\]]*\]\(<?([^\n]*?)>?\)/g)) {
        const path = resolveLocalFileHref(match[1], cwd); if (path) add(path, entryId, "link");
      }
      if (block.type === "toolCall" && block.toolName === "write" && typeof block.input.path === "string") writes.set(block.toolCallId, { path: resolve(cwd, block.input.path), entryId });
    }
    if (message.role === "toolResult" && !message.isError) {
      const write = writes.get(message.toolCallId);
      if (write && outputKind(write.path) !== "other") add(write.path, write.entryId, "write");
    }
  });
  return [...items.values()].reverse();
}
async function source(sessionId: string, leafId?: string | null) {
  if (!isValidSessionId(sessionId)) throw new UiError("Invalid session ID");
  const file = await resolveSessionPath(sessionId);
  const manager = file ? openSessionManagerForRead(sessionId, file) : null;
  if (!manager) throw new UiError("Session not found", 404);
  const entries = manager.getEntries() as unknown as SessionEntry[];
  const leaf = leafId ?? manager.getLeafId();
  if (leaf && !entries.some(e => e.id === leaf)) throw new UiError("Invalid session leaf");
  return { entries, leaf, cwd: manager.getCwd(), context: buildSessionContext(entries, leaf, { deferThinking: true, deferToolResultImages: true }) };
}
type Shelf = { items: Record<string, OutputOverride> };
const store = (id: string) => `outputs/${id}.json`;
export async function listOutputs(sessionId: string, leafId?: string | null) {
  const s = await source(sessionId, leafId);
  const items = discoverOutputs(sessionId, s.cwd, s.context.messages, s.context.entryIds, s.leaf);
  let shelf = readUiStore<Shelf>(store(sessionId), { items: {} });
  const roots = await getAllowedFileRoots();
  const missing = items.filter(item => !shelf.items[item.id] && (isExistingFilePathAllowed(item.path, roots) || isFilePathReferencedByEntries(item.path, s.entries)));
  if (missing.length) {
    await updateUiStore<Shelf, void>(store(sessionId), { items: {} }, data => {
      for (const item of missing) {
        if (data.items[item.id] || Object.keys(data.items).length >= 500) continue;
        try { const stat = statSync(item.path); if (stat.isFile()) data.items[item.id] = { path: item.path, label: item.label, revision: 0, pinned: false, hidden: false, sourceEntryIds: item.sourceEntryIds, leafId: item.leafId, observedMtime: stat.mtimeMs }; } catch { /* Missing candidates remain visible without a baseline. */ }
      }
    });
    shelf = readUiStore<Shelf>(store(sessionId), { items: {} });
  }
  const byId = new Map(items.map(i => [i.id, i]));
  for (const [id, override] of Object.entries(shelf.items)) {
    const original = byId.get(id);
    if (original) byId.set(id, { ...original, ...override, sourceEntryIds: original.sourceEntryIds, leafId: original.leafId, otherBranch: false });
    else if (override.pinned) byId.set(id, { ...override, id, kind: outputKind(override.path), reason: "pin", available: false, otherBranch: override.sourceEntryIds.some(entry => !s.context.entryIds.includes(entry)) });
  }
  return [...byId.values()].map(item => {
    const allowed = isExistingFilePathAllowed(item.path, roots) || isFilePathReferencedByEntries(item.path, s.entries);
    if (!allowed) return { ...item, available: false, availability: "inaccessible" };
    try { const stat = statSync(item.path); return { ...item, available: stat.isFile(), availability: stat.isFile() ? "available" : "missing", size: stat.size, mtime: stat.mtimeMs, changed: item.observedMtime !== undefined && item.observedMtime !== stat.mtimeMs }; }
    catch { return { ...item, available: false, availability: "missing" }; }
  }).sort((a, b) => Number(b.pinned) - Number(a.pinned));
}
export async function changeOutput(sessionId: string, body: Record<string, unknown>, remove = false) {
  const s = await source(sessionId, typeof body.leafId === "string" ? body.leafId : undefined);
  if (typeof body.path !== "string" || body.path.length > 4096) throw new UiError("Invalid path");
  const path = canonical(resolve(s.cwd, body.path));
  const roots = await getAllowedFileRoots();
  // Missing known outputs can still be hidden/unpinned; new pins require an existing authorized file.
  const id = createHash("sha256").update(sessionId + "\0" + path).digest("hex");
  const old = readUiStore<Shelf>(store(sessionId), { items: {} }).items[id];
  if (!isExistingFilePathAllowed(path, roots) && !(old && !existsSync(path) && isFilePathAllowed(path, roots)) && !isFilePathReferencedByEntries(path, s.entries)) throw new UiError("Access denied", 403);
  if (body.label !== undefined && (typeof body.label !== "string" || body.label.length > 200)) throw new UiError("Invalid label");
  let mtime: number | undefined;
  try { const stat = statSync(path); if (!stat.isFile()) throw new Error(); mtime = stat.mtimeMs; } catch { if (!old && body.pinned === true) throw new UiError("File not found", 404); }
  const candidate = discoverOutputs(sessionId, s.cwd, s.context.messages, s.context.entryIds, s.leaf).find(i => i.id === id);
  return updateUiStore<Shelf, OutputOverride | null>(store(sessionId), { items: {} }, data => {
    const current = data.items[id];
    // Pin entry points only know a path (a transcript/file may have no shelf
    // row on screen). Treat that narrow operation as an atomic, idempotent
    // repin while retaining revision checks for every shelf edit.
    const pathOnlyPin = body.pinned === true && body.revision === undefined && body.label === undefined && body.hidden === undefined && !remove;
    if (current?.pinned && pathOnlyPin) return current;
    if (!pathOnlyPin && (current?.revision ?? 0) !== (body.revision ?? 0)) throw new UiError("Output changed. Refresh the shelf.", 409);
    if (remove) { delete data.items[id]; return null; }
    if (!current && Object.keys(data.items).length >= 500) throw new UiError("Output shelf is full");
    const item: OutputOverride = { path, label: typeof body.label === "string" ? body.label : current?.label ?? basename(path), revision: (current?.revision ?? 0) + 1, pinned: typeof body.pinned === "boolean" ? body.pinned : current?.pinned ?? false, hidden: typeof body.hidden === "boolean" ? body.hidden : current?.hidden ?? false, sourceEntryIds: current?.sourceEntryIds ?? candidate?.sourceEntryIds ?? [], leafId: current?.leafId ?? s.leaf, observedMtime: current?.observedMtime ?? mtime };
    data.items[id] = item; return item;
  });
}
