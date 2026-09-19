"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { getFileIcon } from "../FileIcons";
import { getRelativeFilePath } from "@/lib/file-paths";
import { parseUnifiedPatch } from "@/lib/patch";
import { invalidateUiCache, uiFetch } from "@/lib/web-ui-client";
import type { GitFileDiffResponse, GitFileStatus, GitStatusResponse } from "@/lib/git-types";

function FileDiff({ cwd, file, selected, refreshKey }: {
  cwd: string; file: GitFileStatus; selected: boolean; refreshKey: number;
}) {
  const { t } = useI18n();
  const id = useId();
  const [open, setOpen] = useState(selected);
  const [diff, setDiff] = useState<GitFileDiffResponse>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => { if (selected) setOpen(true); }, [selected]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true); setError("");
    void uiFetch<GitFileDiffResponse>(`/api/git/diff?${new URLSearchParams({ cwd, path: file.filePath })}`, undefined, undefined, controller.signal)
      .then(setDiff)
      .catch(e => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [cwd, file.filePath, open, refreshKey]);
  const rows = useMemo(() => parseUnifiedPatch(diff?.patch ?? "")?.flatMap(file => file.rows) ?? [], [diff]);
  const additions = rows.filter(row => row.type === "line" && row.right.type === "added").length;
  const deletions = rows.filter(row => row.type === "line" && row.left.type === "removed").length;
  const name = getRelativeFilePath(file.filePath, cwd);
  return <article className="review-file">
    <button className="review-file-heading" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)} title={name}>
      <svg className={open ? "is-expanded" : ""} width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" aria-hidden="true"><path d="m4 2 4 4-4 4" /></svg>
      {getFileIcon(name.split(/[\\/]/).pop() ?? name, 16)}
      <span className="review-file-name">{name}</span>
      {diff?.supported && <span className="review-counts"><span className="review-added">+{additions}</span><span className="review-removed">−{deletions}</span></span>}
    </button>
    {open && <div id={id} className="review-file-body" role="region" aria-label={name}>
      {loading ? <p className="review-message">{t("files.loading")}</p> : error ? <p className="review-message" role="alert">{error}</p> : !diff?.supported ? <p className="review-message">{t("wb.diffUnavailable")}</p> :
        <div className="review-patch" tabIndex={0}>
          {rows.map((row, index) => row.type === "hunk" ? <div className="review-hunk" key={index} title={row.text} aria-label={row.text}>···</div> :
            <div key={index}>
              {[...(row.left.type === "removed" ? [row.left] : []), ...(row.right.type !== "empty" ? [row.right] : [])].map((cell, side) =>
                <div className={`review-line is-${cell.type}`} key={side}><span className="review-line-number">{cell.lineNo}</span><span className="review-line-sign">{cell.type === "added" ? "+" : cell.type === "removed" ? "−" : " "}</span><code>{cell.text || " "}</code></div>)}
            </div>)}
        </div>}
    </div>}
  </article>;
}

/**
 * Working-tree changes, collapsed by default, inside the Files panel. Replaces
 * the standalone Diff panel mode: one place to look at a project's files,
 * whether they changed or not.
 */
export function ChangesSection({ visible, cwd, expanded, onExpandedChange, selectedFilePath, refreshKey = 0 }: {
  visible: boolean;
  cwd: string | null;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  selectedFilePath?: string | null;
  refreshKey?: number;
}) {
  const { t } = useI18n();
  const id = useId();
  const [status, setStatus] = useState<GitStatusResponse>();
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  // The count badge has to be right while the section is collapsed, so the
  // status request follows panel visibility rather than the expanded state.
  // Individual patches are still only fetched when a file row is opened.
  useEffect(() => {
    if (!visible || !cwd) return;
    const controller = new AbortController();
    setError("");
    void uiFetch<GitStatusResponse>(`/api/git/status?cwd=${encodeURIComponent(cwd)}`, undefined, undefined, controller.signal)
      .then(setStatus).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [visible, cwd, refreshKey, revision]);
  useEffect(() => { setStatus(undefined); }, [cwd]);

  if (!cwd) return null;
  const files = status?.files ?? [];
  const count = files.length;
  return <section className="workbench-section" aria-label={t("wb.changes")}>
    <div className="workbench-section-header">
      <button type="button" className="workbench-section-toggle" aria-expanded={expanded} aria-controls={id} onClick={() => onExpandedChange(!expanded)}>
        <svg className={expanded ? "is-expanded" : ""} width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" aria-hidden="true"><path d="m4 2 4 4-4 4" /></svg>
        <span>{t("wb.changes")}</span>
        {count > 0 && <span className="workbench-section-badge">{count}</span>}
      </button>
      {status && count > 0 && <span className="review-counts"><span className="review-added">+{status.additions}</span><span className="review-removed">−{status.deletions}</span></span>}
      {/* External editors do not emit an in-app change event. Keep refresh
          available even for a clean tree so clean-to-dirty transitions can be
          discovered without switching sessions. */}
      <button type="button" className="workbench-section-action" onClick={() => { invalidateUiCache("/api/git/"); setRevision(value => value + 1); }} aria-label={t("contextPanel.diffRefresh")} title={t("contextPanel.diffRefresh")}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M20 11a8 8 0 1 0 2 5.3M20 4v7h-7" /></svg>
      </button>
    </div>
    {expanded && <div id={id} className="workbench-section-body">
      {error ? <p className="review-message" role="alert">{error}</p> : !status ? <p className="review-message">{t("files.loading")}</p> : !count ? <p className="review-message">{t("contextPanel.diffEmpty")}</p> :
        files.map(file => <FileDiff key={file.filePath} cwd={cwd} file={file} selected={file.filePath === selectedFilePath} refreshKey={refreshKey + revision} />)}
    </div>}
  </section>;
}
