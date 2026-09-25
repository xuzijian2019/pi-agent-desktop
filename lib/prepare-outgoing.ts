import { buildPasteToken, splicePastedTexts } from "./pasted-text";
import { validateAgentImages } from "./image-attachments";
import { SESSION_REFERENCE_PATTERN } from "./session-reference";
import type { ChatDraft } from "./draft-store";

export interface ReferenceSelection { id: string; leafId?: string; firstEntryId?: string; lastEntryId?: string }
export interface PreparedOutgoing {
  text: string;
  images: { data: string; mimeType: string }[];
}
export async function prepareOutgoingMessage(draft: ChatDraft, fetchImpl: typeof fetch = fetch, signal?: AbortSignal): Promise<PreparedOutgoing> {
  const combined = AbortSignal.any([AbortSignal.timeout(15000), ...(signal ? [signal] : [])]);
  const images = draft.images.map(i => ({ ...i, type: "image" as const }));
  const error = validateAgentImages(images); if (error) throw new Error(error);
  const pastes = (draft.texts ?? []).map(p => ({ ...p, token: buildPasteToken(p.id, p.content) }));
  if ((draft.value.match(/\[Pasted text \d+ · \d+ lines\]/g) ?? []).some(token => !pastes.some(p => p.token === token))) throw new Error("Missing pasted text. Remove or restore the attachment.");
  const command = draft.value.trimStart().startsWith("!");
  let text = splicePastedTexts(draft.value, pastes).trim();
  const references: { label: string; text: string }[] = [];
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
      const data = await res.json() as { reference: string };
      references.push({ label, text: data.reference });
    }
    // Expand only actual composer reference tokens, never hash text inside a pasted block.
    text = draft.value.replace(SESSION_REFERENCE_PATTERN, (token, quoted, bare) => references.find(r => r.label === (quoted ?? bare))?.text ?? token);
    text = splicePastedTexts(text, pastes).trim();
  }
  combined.throwIfAborted();
  return { text, images: images.map(({ data, mimeType }) => ({ data, mimeType })) };
}
