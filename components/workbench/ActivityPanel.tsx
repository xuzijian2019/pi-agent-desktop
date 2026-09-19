"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { activeRun, type ActivityRun, type ActivitySnapshot } from "@/lib/activity-types";
import { uiFetch } from "@/lib/web-ui-client";

type Row = ActivityRun & { checkout?: string };
export function ActivityPanel({ visible, cwd, onOpen }: { visible: boolean; cwd: string | null; onOpen: (id: string, focus?: boolean) => void }) {
  const { t } = useI18n(); const [runs, setRuns] = useState<Row[]>([]);
  const [filter, setFilter] = useState("all"); const [projectOnly, setProjectOnly] = useState(false);
  const [project, setProject] = useState<string>(); const [count, setCount] = useState(20);
  const [error, setError] = useState(""); const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState<string>(); const [now, setNow] = useState(Date.now());
  const version = useRef({ epoch: "", version: -1 });
  const accept = useCallback((snapshot: ActivitySnapshot) => {
    if (version.current.epoch === snapshot.epoch && snapshot.version < version.current.version) return;
    version.current = snapshot;
    setRuns(previous => snapshot.runs.map(run => ({ ...previous.find(p => p.sessionId === run.sessionId), ...run })));
    if (snapshot.persistenceError) setError(snapshot.persistenceError);
  }, []);
  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    const load = () => void uiFetch<ActivitySnapshot>("/api/agent/activity", undefined, undefined, controller.signal).then(accept).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    const source = new EventSource("/api/agent/activity/events");
    source.onopen = () => { setConnected(true); setError(""); load(); };
    source.onerror = () => setConnected(false);
    const knownRuns = new Set<string>();
    source.onmessage = event => { try { const snapshot = JSON.parse(event.data) as ActivitySnapshot; accept(snapshot); const added = snapshot.runs.some(r => !knownRuns.has(r.runId)); snapshot.runs.forEach(r => knownRuns.add(r.runId)); if (added) load(); } catch { setError(t("wb.loadError")); } };
    const timer = setInterval(() => setNow(Date.now()), 1000);
    window.addEventListener("pi-git-changed", load);
    load();
    return () => { controller.abort(); source.close(); clearInterval(timer); window.removeEventListener("pi-git-changed", load); };
  }, [visible, accept, t]);
  useEffect(() => {
    const controller = new AbortController();
    if (cwd) void uiFetch<{ projectRoot: string }>(`/api/worktrees?cwd=${encodeURIComponent(cwd)}`, undefined, undefined, controller.signal).then(d => setProject(d.projectRoot)).catch(() => {});
    else setProject(undefined);
    return () => controller.abort();
  }, [cwd]);
  async function stop(run: Row) { setBusy(run.runId); setError(""); try { await uiFetch("/api/agent/activity/stop", { sessionId: run.sessionId, runId: run.runId }); } catch (e) { setError(String(e)); } finally { setBusy(undefined); } }
  const filtered = runs.filter(r => (!projectOnly || !!project && (r.projectRoot === project || r.cwd === project)) && (filter === "all" || filter === "running" && activeRun(r) || filter === "attention" && ["waiting", "failed", "interrupted"].includes(r.status) || filter === "recent" && !activeRun(r)));
  return <section className="workbench-content" aria-label={t("wb.activity")}>
    <h2 className="workbench-sr-only">{t("wb.activity")}</h2><div className="workbench-toolbar"><select aria-label={t("wb.filter")} value={filter} onChange={e => setFilter(e.target.value)}>{["all", "running", "attention", "recent"].map(v => <option key={v} value={v}>{t(`wb.${v}`)} ({runs.filter(r => v === "all" || v === "running" && activeRun(r) || v === "attention" && ["waiting", "failed", "interrupted"].includes(r.status) || v === "recent" && !activeRun(r)).length})</option>)}</select><label><input type="checkbox" checked={projectOnly} onChange={e => setProjectOnly(e.target.checked)} />{t("wb.thisProject")}</label></div>
    {!connected && <p role="status">{t("wb.reconnecting")}</p>}{error && <p role="alert">{error}</p>}
    {!filtered.length && <p>{t("wb.noActivity")}</p>}
    {filtered.slice(0, count).map(run => {
      const shared = activeRun(run) ? runs.filter(r => r.sessionId !== run.sessionId && activeRun(r) && (r.checkout ?? r.cwd) === (run.checkout ?? run.cwd)) : [];
      return <article className="workbench-card" key={run.sessionId}>
        <strong>{run.title}</strong><span className={`workbench-status status-${run.status}`}>{t(`wb.${run.status}`)}</span>
        <small title={run.cwd}>{run.projectRoot?.split(/[\\/]/).pop() || run.cwd.split(/[\\/]/).pop()} · {run.branch || t("wb.detached")}</small>
        <p>{t(`wb.${run.phase}`)} · {Math.max(0, Math.floor(((run.finishedAt ?? now) - run.startedAt) / 1000))}s · {t("wb.queued", { count: run.queueCount })}</p>
        {!!shared.length && <p title={shared.map(r => r.title).join("\n")}>{t("wb.sharedCheckout", { count: shared.length })}</p>}
        <div className="workbench-actions"><button onClick={() => onOpen(run.sessionId)}>{t(run.pendingInput ? "wb.openRequest" : "wb.open")}</button><button onClick={() => onOpen(run.sessionId, true)}>{t("wb.followUp")}</button>{activeRun(run) && <button disabled={busy === run.runId} onClick={() => void stop(run)}>{t("wb.stop")}</button>}</div>
      </article>;
    })}
    {filtered.length > count && <button onClick={() => setCount(c => c + 20)}>{t("wb.more")}</button>}
  </section>;
}
