import { buildPasteToken, splicePastedTexts } from "./pasted-text";
import { getBase64DecodedByteLength, validateAgentImages } from "./image-attachments";
import { SESSION_REFERENCE_PATTERN } from "./session-reference";
import type { ChatDraft } from "./draft-store";

export interface ReferenceSelection { id: string; leafId?: string; firstEntryId?: string; lastEntryId?: string }
export interface ReferencePreview { label: string; selection: ReferenceSelection; text: string; truncated: boolean; revision: string; entries: { id: string; label: string }[]; leaves: { id: string; label: string }[] }
export interface PreparedOutgoing {
  text: string; typedText: string; images: { data: string; mimeType: string; bytes: number }[];
  pastes: { id: number; content: string }[]; references: ReferencePreview[]; preparedAt: number;
  characters: number; bytes: number; command: boolean; slashCommand: boolean;
}
export async function prepareOutgoingMessage(draft: ChatDraft, fetchImpl: typeof fetch = fetch, signal?: AbortSignal): Promise<PreparedOutgoing> {
  const combined = AbortSignal.any([AbortSignal.timeout(15000), ...(signal ? [signal] : [])]);
  const images = draft.images.map(i => ({ ...i, type: "image" as const }));
  const error = validateAgentImages(images); if (error) throw new Error(error);
  const pastes = (draft.texts ?? []).map(p => ({ ...p, token: buildPasteToken(p.id, p.content) }));
  if ((draft.value.match(/\[Pasted text \d+ · \d+ lines\]/g) ?? []).some(token => !pastes.some(p => p.token === token))) throw new Error("Missing pasted text. Remove or restore the attachment.");
  const command = draft.value.trimStart().startsWith("!");
  let text = splicePastedTexts(draft.value, pastes).trim();
  const references: ReferencePreview[] = [];
  if (!command) {
    const tokens = [...draft.value.matchAll(SESSION_REFERENCE_PATTERN)];
    const labels = [...new Set(tokens.map(m => m[1] ?? m[2]))];
    for (const label of labels) {
      let selection = draft.references?.[label];
      const quoted = tokens.some(m => m[1] === label);
      if (!selection && !quoted) continue;
      if (!selection) {
        const res = await fetchImpl("/api/sessions", { signal: combined });
        if (!res.ok) throw new Error("Unable to resolve session reference");
        const data = await res.json() as { sessions: { id: string; name?: string; firstMessage: string }[] };
        const matches = data.sessions.filter(s => (s.name?.trim() || s.firstMessage.trim()) === label);
        if (matches.length !== 1) throw new Error("Session reference is missing or ambiguous. Select it again.");
        selection = { id: matches[0].id };
      }
      const params = new URLSearchParams();
      for (const key of ["leafId", "firstEntryId", "lastEntryId"] as const) if (selection[key]) params.set(key, selection[key]);
      const res = await fetchImpl(`/api/sessions/${encodeURIComponent(selection.id)}/reference?${params}`, { signal: combined });
      if (!res.ok) throw new Error("Unable to load referenced session. Retry or remove it.");
      const data = await res.json() as { reference: string; truncated?: boolean; revision?: string; leafId?: string; entries?: ReferencePreview["entries"]; leaves?: ReferencePreview["leaves"] };
      references.push({ label, selection: { ...selection, leafId: data.leafId ?? selection.leafId }, text: data.reference, truncated: !!data.truncated, revision: data.revision ?? "", entries: data.entries ?? [], leaves: data.leaves ?? [] });
    }
    // Expand only actual composer reference tokens, never hash text inside a pasted block.
    text = draft.value.replace(SESSION_REFERENCE_PATTERN, (token, quoted, bare) => references.find(r => r.label === (quoted ?? bare))?.text ?? token);
    text = splicePastedTexts(text, pastes).trim();
  }
  combined.throwIfAborted();
  return { text, typedText: draft.value, images: images.map(i => ({ data: i.data, mimeType: i.mimeType, bytes: getBase64DecodedByteLength(i.data)! })), pastes: pastes.filter(p => draft.value.includes(p.token)).map(({ id, content }) => ({ id, content })), references, preparedAt: Date.now(), characters: text.length, bytes: new TextEncoder().encode(text).length, command, slashCommand: text.startsWith("/") };
}

/** Templates contain reusable prompt text, not attached conversation snapshots. */
export function taskPromptFromDraft(draft: ChatDraft): string {
  const value = draft.value.replace(SESSION_REFERENCE_PATTERN, (token, quoted, bare) =>
    quoted !== undefined || draft.references?.[bare] ? "" : token);
  return splicePastedTexts(value, (draft.texts ?? []).map(p => ({ ...p, token: buildPasteToken(p.id, p.content) })))
    .replace(/<referenced-session\b[^>]*>[\s\S]*?<\/referenced-session>/g, "")
    .replace(/\[Pasted text \d+ · \d+ lines\]/g, "").trim();
}
