import type { TaskSetup } from "./task-types";
import type { ReferenceSelection } from "./prepare-outgoing";
import { APP_PREF_KEYS } from "./app-prefs";
import type { ChatDraftText } from "./pasted-text";
import { MAX_ATTACHED_IMAGES, isBase64ImageWithinLimits } from "./image-attachments";

export interface ChatDraftImage { data: string; mimeType: string }
export interface ChatDraft { value: string; images: ChatDraftImage[]; texts?: ChatDraftText[]; setup?: TaskSetup; references?: Record<string, ReferenceSelection> }
type RecordValue = { revision: number; draft: ChatDraft | null };
export type DraftStatus = "loading" | "pending" | "saved" | "failed" | "conflict";
const drafts = new Map<string, ChatDraft>();
const revisions = new Map<string, number>();
const statuses = new Map<string, DraftStatus>();
const listeners = new Set<() => void>();
const queues = new Map<string, Promise<void>>();
let database: Promise<IDBDatabase> | undefined;
let channel: BroadcastChannel | undefined;
const emit = () => listeners.forEach((listener) => listener());
function status(key: string, value: DraftStatus) { statuses.set(key, value); emit(); }
export function subscribeDrafts(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function getDraftStatus(key: string): DraftStatus { return statuses.get(key) ?? "loading"; }
export function getDraft(key: string): ChatDraft | null { return structuredClone(drafts.get(key) ?? null); }
function db(): Promise<IDBDatabase> {
  if (!database) database = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("pi-chat-drafts", 1);
    const timeout = setTimeout(() => reject(new Error("Draft database timed out")), 5_000);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts");
    request.onerror = () => { clearTimeout(timeout); reject(request.error); };
    request.onblocked = () => { clearTimeout(timeout); reject(new Error("Draft database blocked")); };
    request.onsuccess = () => { clearTimeout(timeout); request.result.onversionchange = () => { request.result.close(); database = undefined; }; resolve(request.result); };
  }).catch((error) => { database = undefined; throw error; });
  if (typeof window !== "undefined" && !channel && typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel("pi-chat-drafts");
    channel.onmessage = (event) => {
      const { key, revision } = event.data;
      if (revisions.has(key) && revisions.get(key) !== revision) status(key, "conflict");
    };
  }
  return database;
}
function valid(draft: ChatDraft): boolean {
  return typeof draft?.value === "string" && Array.isArray(draft.images)
    && draft.images.every((image) => typeof image.data === "string" && typeof image.mimeType === "string")
    && (draft.texts ?? []).every((text) => Number.isFinite(text.id) && typeof text.content === "string");
}
export async function loadDraft(key: string, discardLocal = false): Promise<ChatDraft | null> {
  await queues.get(key);
  if (!discardLocal && drafts.has(key) && ["failed", "conflict"].includes(getDraftStatus(key))) return getDraft(key);
  try {
    const database = await db();
    const record = await new Promise<RecordValue | undefined>((resolve, reject) => {
      const tx = database.transaction("drafts", "readwrite", { durability: "strict" });
      const store = tx.objectStore("drafts");
      const request = store.get(key);
      let value: RecordValue | undefined;
      request.onsuccess = () => {
        value = request.result;
        if (!value) {
          // Retain legacy data until migration has committed. Tombstones stop
          // deleted drafts from being migrated again in another browser tab.
          try {
            const legacy = JSON.parse(window.localStorage.getItem(APP_PREF_KEYS.chatDrafts) ?? "{}")[key];
            if (legacy && !valid(legacy)) throw new Error("Invalid legacy draft");
            value = { revision: 0, draft: legacy ?? null };
            store.put(value, key);
          } catch { tx.abort(); }
        }
      };
      tx.oncomplete = () => resolve(value);
      tx.onabort = tx.onerror = () => reject(tx.error ?? new Error("Draft migration failed"));
    });
    if (record?.draft && !valid(record.draft)) throw new Error("Invalid draft attachments");
    revisions.set(key, record?.revision ?? 0);
    if (record?.draft) drafts.set(key, record.draft); else drafts.delete(key);
    status(key, "saved");
    return getDraft(key);
  } catch {
    // Storage denial must still let the user recover a readable legacy draft.
    if (!drafts.has(key)) {
      try {
        const legacy = JSON.parse(window.localStorage.getItem(APP_PREF_KEYS.chatDrafts) ?? "{}")[key];
        if (legacy && valid(legacy)) drafts.set(key, legacy);
      } catch { /* The failed status also covers denied legacy storage. */ }
    }
    status(key, "failed"); return getDraft(key);
  }
}
export function setDraft(key: string, draft: ChatDraft): void {
  const value = !draft.value && !draft.images.length && !draft.texts?.length && !draft.setup ? null : structuredClone(draft);
  const previous = drafts.get(key) ?? null;
  if (previous === value || (previous && value && previous.value === value.value
    && JSON.stringify(previous.setup) === JSON.stringify(value.setup) && JSON.stringify(previous.references) === JSON.stringify(value.references)
    && previous.images.length === value.images.length
    && previous.images.every((image, index) => image.data === value.images[index].data && image.mimeType === value.images[index].mimeType)
    && (previous.texts?.length ?? 0) === (value.texts?.length ?? 0)
    && (previous.texts ?? []).every((text, index) => text.id === value.texts![index].id && text.content === value.texts![index].content))) return;
  if (value) drafts.set(key, value); else drafts.delete(key);
  if (getDraftStatus(key) === "conflict") return;
  persist(key, value);
}
function persist(key: string, draft: ChatDraft | null, force = false): void {
  status(key, "pending");
  const next = (queues.get(key) ?? Promise.resolve()).then(async () => {
    const database = await db();
    const revision = await new Promise<number>((resolve, reject) => {
      const tx = database.transaction("drafts", "readwrite", { durability: "strict" });
      const store = tx.objectStore("drafts");
      const request = store.get(key);
      let revision = 0;
      let conflict = false;
      request.onsuccess = () => {
        const current = request.result as RecordValue | undefined;
        if (!force && (current?.revision ?? 0) !== (revisions.get(key) ?? 0)) { conflict = true; tx.abort(); return; }
        revision = (current?.revision ?? 0) + 1;
        try { store.put({ revision, draft }, key); } catch { tx.abort(); }
      };
      tx.oncomplete = () => resolve(revision);
      tx.onabort = tx.onerror = () => reject(new Error(conflict ? "conflict" : "save"));
    });
    revisions.set(key, revision);
    channel?.postMessage({ key, revision });
    if (queues.get(key) === next) status(key, "saved");
  }).catch((error) => status(key, error.message === "conflict" ? "conflict" : "failed"));
  queues.set(key, next);
  void next.finally(() => { if (queues.get(key) === next) queues.delete(key); });
}
export function retryDraft(key: string): void { persist(key, getDraft(key), true); }
export function clearDraft(key: string): void { drafts.delete(key); persist(key, null, true); }

export function mergeRestoredSubmissionText(submitted: string, current: string): string {
  if (!submitted.trim()) return current;
  if (!current.trim()) return submitted;
  return `${submitted}\n\n${current}`;
}

export function mergeRestoredSubmissionDraft(
  submittedText: string,
  submittedImages: ChatDraftImage[] | undefined,
  currentText: string,
  currentImages: ChatDraftImage[],
): ChatDraft {
  const images = [...(submittedImages ?? []), ...currentImages]
    .filter(isBase64ImageWithinLimits)
    .slice(0, MAX_ATTACHED_IMAGES)
    .map(({ data, mimeType }) => ({ data, mimeType }));

  return {
    value: mergeRestoredSubmissionText(submittedText, currentText),
    images,
  };
}

export function restoreDraftSubmission(
  key: string,
  text: string,
  images?: ChatDraftImage[],
): ChatDraft {
  const current = getDraft(key) ?? { value: "", images: [] };
  const restored = { ...current, ...mergeRestoredSubmissionDraft(
    text,
    images,
    current.value,
    current.images,
  ) };
  setDraft(key, restored);
  return restored;
}

export function rekeyDraft(
  previousKey: string,
  nextKey: string,
  currentDraft?: ChatDraft,
): ChatDraft | null {
  if (previousKey === nextKey) return currentDraft ? structuredClone(currentDraft) : getDraft(nextKey);

  const storedPrevious = getDraft(previousKey);
  const previous = currentDraft && (currentDraft.value || currentDraft.images.length || currentDraft.texts?.length || currentDraft.setup)
    ? structuredClone(currentDraft)
    : (storedPrevious ?? (currentDraft ? structuredClone(currentDraft) : null));
  const next = getDraft(nextKey);
  clearDraft(previousKey);
  if (!previous) return next;

  const merged = next
    ? { ...next, ...previous, ...mergeRestoredSubmissionDraft(next.value, next.images, previous.value, previous.images) }
    : previous;
  setDraft(nextKey, merged);
  return structuredClone(merged);
}
