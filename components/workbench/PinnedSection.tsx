"use client";
/* eslint-disable @next/next/no-img-element -- Local user files and data URLs bypass the remote image optimizer. */
import { useEffect, useId, useState } from "react";
import { PanelActions } from "./PanelActions";
import { useI18n } from "@/hooks/useI18n";
import { uiFetch } from "@/lib/web-ui-client";
import { encodeFilePathForApi } from "@/lib/file-paths";
import type { OutputItem } from "@/lib/output-types";

const MAX_ITEMS = 200;

/**
 * Pinned session outputs, collapsed by default, inside the Files panel.
 * Replaces the standalone Outputs panel mode: opening a pin now just opens a
 * file tab in the same panel, so there is nothing to navigate back from.
 * The whole section is absent while the session has no pins.
 */
export function PinnedSection({ visible, sessionId, leafId, expanded, onExpandedChange, refreshKey, onOpen, onMessage }: {
  visible: boolean;
  sessionId: string | null;
  leafId: string | null;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  refreshKey: number;
  onOpen: (path: string) => void;
  onMessage: (entryId: string, leafId: string | null) => void;
}) {
  const { t } = useI18n();
  const id = useId();
  const [data, setData] = useState<{ sessionId: string; leafId: string | null; items: OutputItem[] }>();
  const [version, refresh] = useState(0);
  const [showHidden, setShowHidden] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<string>();
  const [label, setLabel] = useState("");

  useEffect(() => {
    if (!visible || !sessionId) return;
    const controller = new AbortController();
    const load = async () => {
      const collected: OutputItem[] = [];
      let total = 0;
      do {
        const page = await uiFetch<{ items: OutputItem[]; total: number }>(`/api/sessions/${sessionId}/outputs?${new URLSearchParams({ ...(leafId ? { leafId } : {}), offset: String(collected.length) })}`, undefined, undefined, controller.signal);
        total = page.total;
        collected.push(...page.items);
        if (!page.items.length) break;
      } while (collected.length < Math.min(MAX_ITEMS, total));
      if (!controller.signal.aborted) setData({ sessionId, leafId, items: collected.filter(item => item.pinned) });
    };
    // No timer: a pin, a rename or an unpin all dispatch pi-output-changed,
    // and the panel refetches when it becomes visible again.
    const run = () => void load().catch(e => { if (!controller.signal.aborted) setError(e.message); });
    run();
    window.addEventListener("pi-output-changed", run);
    return () => { controller.abort(); window.removeEventListener("pi-output-changed", run); };
  }, [visible, sessionId, leafId, refreshKey, version]);

  const current = data?.sessionId === sessionId && data.leafId === leafId ? data : undefined;
  const pins = current?.items ?? [];
  const items = pins.filter(item => showHidden || !item.hidden);
  const hasHidden = pins.some(item => item.hidden);

  async function change(item: OutputItem, patch: Record<string, unknown>) {
    setError("");
    try {
      await uiFetch(`/api/sessions/${sessionId}/outputs`, { path: item.path, revision: item.revision, leafId, ...patch }, "PATCH");
      refresh(v => v + 1);
    } catch (e) { setError(String(e)); }
  }

  // An empty shelf shows nothing at all — no header, no filters.
  if (!sessionId || !pins.length) return null;
  return <section className="workbench-section" aria-label={t("wb.pinned")}>
    <div className="workbench-section-header">
      <button type="button" className="workbench-section-toggle" aria-expanded={expanded} aria-controls={id} onClick={() => onExpandedChange(!expanded)}>
        <svg className={expanded ? "is-expanded" : ""} width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" aria-hidden="true"><path d="m4 2 4 4-4 4" /></svg>
        <span>{t("wb.pinned")}</span>
        <span className="workbench-section-badge">{items.length}</span>
      </button>
      {hasHidden && <label className="workbench-section-filter"><input type="checkbox" checked={showHidden} onChange={e => setShowHidden(e.target.checked)} />{t("wb.showHidden")}</label>}
    </div>
    {expanded && <div id={id} className="workbench-section-body workbench-content">
      {error && <p className="review-message" role="alert">{error}</p>}
      {!items.length ? <p className="workbench-empty">{t("wb.noPins")}</p> : items.map(item => <article className="workbench-card" key={item.id}>
        {item.kind === "images" && item.available && <img alt="" className="workbench-thumbnail" src={`/api/files/${encodeFilePathForApi(item.path)}?type=preview&sessionId=${sessionId}`} />}
        <strong>{item.label}</strong><small>{item.path}</small>
        <p>{t("wb.currentFile")} · {item.size ?? "—"} B{item.changed ? ` · ${t("wb.changed")}` : ""}{item.otherBranch ? ` · ${t("wb.otherBranch")}` : ""}</p>
        {!item.available && <p>{t(item.availability === "missing" ? "wb.missing" : "wb.unavailable")}</p>}
        <div className="workbench-actions">
          <button disabled={!item.available} onClick={() => onOpen(item.path)}>{t("wb.open")}</button>
          {item.available && <a href={`/api/files/${encodeFilePathForApi(item.path)}?type=download&sessionId=${sessionId}`} download>{t("wb.download")}</a>}
          <PanelActions>
            {item.sourceEntryIds.length > 0 && <button onClick={() => onMessage(item.sourceEntryIds.at(-1)!, item.leafId)}>{t("wb.goMessage")}</button>}
            <button onClick={() => void change(item, { pinned: false })}>{t("wb.unpin")}</button>
            <button onClick={() => { setEditing(item.id); setLabel(item.label); }}>{t("wb.renameLabel")}</button>
            <button onClick={() => void change(item, { hidden: !item.hidden })}>{t(item.hidden ? "wb.restore" : "wb.hide")}</button>
          </PanelActions>
        </div>
        {editing === item.id && <form onSubmit={e => { e.preventDefault(); void change(item, { label }).then(() => setEditing(undefined)); }}>
          <input aria-label={t("wb.label")} value={label} maxLength={200} onChange={e => setLabel(e.target.value)} /><button>{t("wb.save")}</button>
        </form>}
      </article>)}
    </div>}
  </section>;
}
