"use client";
/* eslint-disable @next/next/no-img-element -- Local user files and data URLs bypass the remote image optimizer. */
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { ChatInputHandle } from "../ChatInput";
import type { PreparedOutgoing } from "@/lib/prepare-outgoing";
import { useI18n } from "@/hooks/useI18n";
export function ContextPanel({ visible, inputRef, revision, identity, systemPrompt }: { visible: boolean; inputRef: RefObject<ChatInputHandle | null>; revision: number; identity: string; systemPrompt: string | null }) {
  const { t } = useI18n(); const [data, setData] = useState<{ revision: number; identity: string; prepared: PreparedOutgoing }>(); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const generation = useRef(0); const owner = useRef(identity); owner.current = identity;
  const refresh = useCallback(async () => {
    if (!inputRef.current) return;
    const request = ++generation.current; setBusy(true); setError("");
    try { const prepared = await inputRef.current.prepare(true); if (request === generation.current && owner.current === identity) setData({ revision, identity, prepared }); }
    catch (e) { if (request === generation.current && owner.current === identity) setError(String(e)); }
    finally { if (request === generation.current) setBusy(false); }
  }, [inputRef, revision, identity]);
  const refreshRef = useRef(refresh); refreshRef.current = refresh;
  useEffect(() => { if (visible) void refreshRef.current(); }, [visible, identity]);
  const current = data?.identity === identity ? data : undefined; const prepared = current?.prepared; const stale = current?.revision !== revision;
  return <section className="workbench-content" aria-label={t("wb.context")}><h2 className="workbench-sr-only">{t("wb.context")}</h2><p>{t("wb.contextHint")}</p><div className="workbench-toolbar"><span role="status">{t(busy ? "wb.preparing" : stale ? "wb.stale" : "wb.fresh")}</span><button disabled={busy || !inputRef.current} onClick={() => void refresh()}>{t("wb.refresh")}</button><button onClick={() => inputRef.current?.focus()}>{t("wb.returnComposer")}</button></div>
    {error && <p role="alert">{error}</p>}
    {!inputRef.current && <p>{t("wb.selectSession")}</p>}
    {prepared && <>
      <small>{new Date(prepared.preparedAt).toLocaleString()} · {prepared.characters} {t("wb.characters")} · {prepared.bytes} B</small>
      <details><summary>{t("wb.typedText")}</summary><pre>{prepared.typedText}</pre></details>
      {prepared.command && <p>{t("wb.commandPreview")}</p>}{prepared.slashCommand && <p>{t("wb.slashHint")}</p>}<p>{t("wb.pathHint")}</p>
      {prepared.pastes.map(p => <article className="workbench-card" key={p.id}><details><summary>{t("wb.pastedText")} {p.id} · {p.content.length} {t("wb.characters")}</summary><pre>{p.content}</pre></details><button disabled={stale} onClick={() => inputRef.current?.removeContextItem("paste", String(p.id))}>{t("wb.remove")}</button></article>)}
      {prepared.references.map(r => <article className="workbench-card" key={r.label}><strong>{r.label}</strong><small>{r.text.length} {t("wb.characters")}{r.truncated ? ` · ${t("wb.truncated")}` : ""}</small>
        {r.leaves.length > 1 && <label>{t("wb.conversationBranch")}<select disabled={stale} value={r.selection.leafId ?? ""} onChange={e => inputRef.current?.selectReference(r.label, { id: r.selection.id, leafId: e.target.value })}>{r.leaves.map(leaf => <option key={leaf.id} value={leaf.id}>{leaf.label}</option>)}</select></label>}
        <label>{t("wb.fromMessage")}<select disabled={stale} value={r.selection.firstEntryId ?? ""} onChange={e => inputRef.current?.selectReference(r.label, { ...r.selection, firstEntryId: e.target.value || undefined })}><option value="">{t("wb.firstMessage")}</option>{r.entries.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}</select></label>
        <label>{t("wb.toMessage")}<select disabled={stale} value={r.selection.lastEntryId ?? ""} onChange={e => inputRef.current?.selectReference(r.label, { ...r.selection, lastEntryId: e.target.value || undefined })}><option value="">{t("wb.lastMessage")}</option>{r.entries.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}</select></label>
        <details><summary>{t("wb.preview")}</summary><pre>{r.text}</pre></details><button disabled={stale} onClick={() => inputRef.current?.removeContextItem("reference", r.label)}>{t("wb.remove")}</button>
      </article>)}
      {prepared.images.map((img, i) => <article className="workbench-card" key={i}><img className="workbench-thumbnail" alt={`${t("wb.images")} ${i + 1}`} src={`data:${img.mimeType};base64,${img.data}`} /><small>{img.mimeType} · {img.bytes} B</small><button disabled={stale} onClick={() => inputRef.current?.removeContextItem("image", String(i))}>{t("wb.remove")}</button></article>)}
      <details open><summary>{t("wb.outgoingText")}</summary><pre tabIndex={0}>{prepared.text}</pre></details>
    </>}
    {systemPrompt !== null && <details><summary>{t("wb.runtimeInstructions")}</summary><p>{t("wb.runtimeHint")}</p><pre>{systemPrompt}</pre></details>}
  </section>;
}
