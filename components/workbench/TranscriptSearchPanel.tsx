"use client";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { uiFetch } from "@/lib/web-ui-client";
import type { SessionInfo } from "@/lib/types";
import type { TranscriptResult } from "@/lib/transcript-search";
import { HighlightedSnippet } from "./TranscriptHighlight";
type Page = { results: TranscriptResult[]; nextCursor: string | null; skipped: string[]; scanned: number; totalSessions: number };
export function TranscriptSearchPanel({ visible, onOpen }: { visible: boolean; onOpen: (result: TranscriptResult, query: string, signal: AbortSignal) => Promise<void> }) {
  const { t } = useI18n();
  const [query, setQuery] = useState(""); const [project, setProject] = useState(""); const [session, setSession] = useState("");
  const [sessions, setSessions] = useState<SessionInfo[]>([]); const [result, setResult] = useState<Page>();
  const [submitted, setSubmitted] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null); const generation = useRef(0);
  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    void uiFetch<{ sessions: SessionInfo[] }>("/api/sessions", undefined, undefined, controller.signal).then(data => setSessions(data.sessions)).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => { controller.abort(); request.current?.abort(); setBusy(false); };
  }, [visible]);
  function invalidate() { request.current?.abort(); generation.current++; setBusy(false); setResult(undefined); setError(""); }
  async function search(more = false) {
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    const current = ++generation.current; setBusy(true); setError("");
    const text = more ? submitted : query.trim(); if (!more) { setResult(undefined); setSubmitted(text); }
    try {
      const params = new URLSearchParams({ q: text }); if (project) params.set("project", project); if (session) params.set("session", session); if (more && result?.nextCursor) params.set("cursor", result.nextCursor);
      let accumulated = more ? result : undefined;
      const startingCount = accumulated?.results.length ?? 0;
      do {
        const page = await uiFetch<Page>(`/api/transcript-search?${params}`, undefined, undefined, controller.signal);
        if (generation.current !== current || controller.signal.aborted) return;
        accumulated = accumulated ? { ...page, results: [...accumulated.results, ...page.results], skipped: [...accumulated.skipped, ...page.skipped], scanned: accumulated.scanned + page.scanned } : page;
        setResult(accumulated);
        if (!page.nextCursor || accumulated.results.length - startingCount >= 50) break;
        params.set("cursor", page.nextCursor);
      } while (!controller.signal.aborted);
    } catch (e) { if (!controller.signal.aborted && generation.current === current) setError(String(e)); }
    finally { if (generation.current === current) setBusy(false); }
  }
  const projects = [...new Set(sessions.map(s => s.projectRoot ?? s.cwd))].sort();
  return <section className="workbench-content transcript-search" aria-label={t("wb.transcriptSearch")}>
    <form onSubmit={event => { event.preventDefault(); void search(); }}>
      <div className="workbench-toolbar"><input aria-label={t("wb.transcriptSearch")} placeholder={t("wb.searchPlaceholder")} value={query} maxLength={256} onChange={event => { invalidate(); setQuery(event.target.value); }} /><button disabled={!query.trim() || busy}>{t("wb.search")}</button>{busy && <button type="button" onClick={() => { request.current?.abort(); generation.current++; setBusy(false); }}>{t("wb.cancel")}</button>}</div>
      <div className="transcript-filters"><select aria-label={t("wb.projectFilter")} value={project} onChange={e => { invalidate(); setProject(e.target.value); setSession(""); }}><option value="">{t("wb.allProjects")}</option>{projects.map(p => <option value={p} key={p}>{p}</option>)}</select>
      <select aria-label={t("wb.sessionFilter")} value={session} onChange={e => { invalidate(); setSession(e.target.value); }}><option value="">{t("wb.allSessions")}</option>{sessions.filter(s => !project || (s.projectRoot ?? s.cwd) === project).map(s => <option value={s.id} key={s.id}>{s.name || s.firstMessage || s.id}</option>)}</select></div>
    </form>
    {error && <p role="alert">{error}</p>}{busy && <p role="status">{t("wb.searching")}</p>}
    {result && <><small>{result.results.length} {t("wb.matches")} · {result.scanned}/{result.totalSessions} {t("wb.sessionsScanned")}</small>{result.skipped.length > 0 && <p role="status">{t("wb.searchSkipped", { count: result.skipped.length })}</p>}
      {!result.results.length && !result.nextCursor && <p>{t("wb.noMatches")}</p>}
      {result.results.map((hit, index) => <button className="transcript-hit" key={`${hit.sessionId}:${hit.entryId}:${hit.field}:${index}`} disabled={busy} onClick={async () => { request.current?.abort(); const controller = new AbortController(); request.current = controller; const current = ++generation.current; setError(""); setBusy(true); try { await onOpen(hit, submitted, controller.signal); } catch (e) { if (!controller.signal.aborted) setError(String(e)); } finally { if (current === generation.current) setBusy(false); } }}><strong>{hit.title}</strong><small>{hit.project.split(/[\\/]/).pop()} · {t(`wb.search_${hit.kind}`)}</small><span><HighlightedSnippet text={hit.snippet} query={submitted} /></span></button>)}
      {result.nextCursor && <button disabled={busy} onClick={() => void search(true)}>{t("wb.searchMore")}</button>}
    </>}
  </section>;
}
