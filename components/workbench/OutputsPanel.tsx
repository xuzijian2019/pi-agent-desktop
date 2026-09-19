"use client";
/* eslint-disable @next/next/no-img-element -- Local user files and data URLs bypass the remote image optimizer. */
import { useEffect, useState } from "react";
import { PanelActions } from "./PanelActions";
import { useI18n } from "@/hooks/useI18n";
import { uiFetch } from "@/lib/web-ui-client";
import { encodeFilePathForApi } from "@/lib/file-paths";
import type { OutputItem } from "@/lib/output-types";
export function OutputsPanel({ visible, sessionId, title, leafId, refreshKey, onOpen, onMessage }: { visible: boolean; sessionId: string | null; title?: string; leafId: string | null; refreshKey: number; onOpen: (path: string) => void; onMessage: (entryId: string, leafId: string | null) => void }) {
  const { t } = useI18n(); const [data, setData] = useState<{ sessionId: string; leafId: string | null; items: OutputItem[]; total: number }>(); const [version, refresh] = useState(0);
  const [filter, setFilter] = useState("all"); const [search, setSearch] = useState(""); const [hidden, setHidden] = useState(false); const [limit, setLimit] = useState(50);
  const [error, setError] = useState(""); const [editing, setEditing] = useState<string>(); const [label, setLabel] = useState("");
  useEffect(() => {
    if (!visible || !sessionId) return;
    const controller = new AbortController();
    const load = async () => { const collected: OutputItem[] = []; let total = 0; do { const d = await uiFetch<{ items: OutputItem[]; total: number }>(`/api/sessions/${sessionId}/outputs?${new URLSearchParams({ ...(leafId ? { leafId } : {}), offset: String(collected.length) })}`, undefined, undefined, controller.signal); total = d.total; collected.push(...d.items); if (!d.items.length) break; } while (collected.length < Math.min(limit, total)); if (!controller.signal.aborted) setData({ sessionId, leafId, items: collected, total }); };
    const run = () => void load().catch(e => { if (!controller.signal.aborted) setError(e.message); }); run();
    const timer = setInterval(run, 5000); window.addEventListener("pi-output-changed", run);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener("pi-output-changed", run); };
  }, [visible, sessionId, leafId, refreshKey, version, limit]);
  const current = data?.sessionId === sessionId && data.leafId === leafId ? data : undefined;
  async function change(item: OutputItem, patch: Record<string, unknown>) { setError(""); try { await uiFetch(`/api/sessions/${sessionId}/outputs`, { path: item.path, revision: item.revision, leafId, ...patch }, "PATCH"); refresh(v => v + 1); } catch (e) { setError(String(e)); } }
  return <section className="workbench-content" aria-label={t("wb.outputs")}><h2 className="workbench-sr-only">{t("wb.outputs")}</h2><small className="workbench-meta" title={title}>{title || t("wb.selectSession")} · {t("wb.selectedBranch")}</small><p>{t("wb.currentFileHint")}</p>{error && <p role="alert">{error}</p>}
    {sessionId && <><div className="workbench-toolbar"><input aria-label={t("wb.searchOutputs")} placeholder={t("wb.searchOutputs")} value={search} onChange={e => setSearch(e.target.value)} /><button onClick={() => refresh(v => v + 1)}>{t("wb.refresh")}</button></div><div className="workbench-toolbar"><select aria-label={t("wb.filter")} value={filter} onChange={e => setFilter(e.target.value)}>{["all", "documents", "images", "audio", "other"].map(v => <option key={v} value={v}>{t(`wb.${v}`)}</option>)}</select><label><input type="checkbox" checked={hidden} onChange={e => setHidden(e.target.checked)} />{t("wb.showHidden")}</label></div>
    {!current ? <p>{t("wb.loading")}</p> : !current.items.length ? <p className="workbench-empty">{t("wb.noOutputs")}</p> : current.items.filter(i => (hidden || !i.hidden) && (filter === "all" || filter === i.kind) && `${i.label} ${i.path}`.toLowerCase().includes(search.toLowerCase())).map(item => <article className="workbench-card" key={item.id}>
      {item.kind === "images" && item.available && <img alt="" className="workbench-thumbnail" src={`/api/files/${encodeFilePathForApi(item.path)}?type=preview&sessionId=${sessionId}`} />}
      <strong>{item.pinned ? "★ " : ""}{item.label}</strong><small>{item.path}</small><p>{t("wb.currentFile")} · {item.size ?? "—"} B{item.changed ? ` · ${t("wb.changed")}` : ""}{item.otherBranch ? ` · ${t("wb.otherBranch")}` : ""}</p>{!item.available && <p>{t(item.availability === "missing" ? "wb.missing" : "wb.unavailable")}</p>}
      <div className="workbench-actions"><button disabled={!item.available} onClick={() => onOpen(item.path)}>{t("wb.open")}</button>{item.available && <a href={`/api/files/${encodeFilePathForApi(item.path)}?type=download&sessionId=${sessionId}`} download>{t("wb.download")}</a>}<PanelActions>{item.sourceEntryIds.length > 0 && <button onClick={() => onMessage(item.sourceEntryIds.at(-1)!, item.leafId)}>{t("wb.goMessage")}</button>}<button onClick={() => void change(item, { pinned: !item.pinned })}>{t(item.pinned ? "wb.unpin" : "wb.pin")}</button><button onClick={() => { setEditing(item.id); setLabel(item.label); }}>{t("wb.renameLabel")}</button><button onClick={() => void change(item, { hidden: !item.hidden })}>{t(item.hidden ? "wb.restore" : "wb.hide")}</button></PanelActions></div>
      {editing === item.id && <form onSubmit={e => { e.preventDefault(); void change(item, { label }).then(() => setEditing(undefined)); }}><input aria-label={t("wb.label")} value={label} maxLength={200} onChange={e => setLabel(e.target.value)} /><button>{t("wb.save")}</button></form>}
    </article>)}{current && current.total > current.items.length && <button onClick={() => setLimit(n => n + 50)}>{t("wb.more")}</button>}
    </>}
  </section>;
}
