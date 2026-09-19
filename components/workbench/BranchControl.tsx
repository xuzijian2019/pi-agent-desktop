"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { uiFetch } from "@/lib/web-ui-client";
import type { BranchInventory, BranchOperation, BranchPreview } from "@/lib/git-branch-types";
export function BranchControl({ cwd, onNavigate }: { cwd: string; onNavigate: (cwd: string) => void }) {
  const { t } = useI18n(); const [open, setOpen] = useState(false); const [inventory, setInventory] = useState<BranchInventory>();
  const [query, setQuery] = useState(""); const [creating, setCreating] = useState(false); const [name, setName] = useState("");
  const [remoteRef, setRemoteRef] = useState<string>();
  const mounted = useRef(true); useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [baseRef, setBase] = useState("HEAD"); const [location, setLocation] = useState<"current" | "worktree">("current");
  const [preview, setPreview] = useState<BranchPreview>(); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const owner = useRef(cwd); owner.current = cwd; const anchor = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; bottom: number; width: number; maxHeight: number }>();
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const trigger = anchor.current?.querySelector("button")?.getBoundingClientRect();
      const composer = anchor.current?.closest(".chat-composer")?.getBoundingClientRect();
      if (!trigger) return;
      const inset = 12;
      const leftEdge = Math.max(inset, (composer?.left ?? 0) + inset);
      const rightEdge = Math.min(window.innerWidth - inset, (composer?.right ?? window.innerWidth) - inset);
      const width = Math.min(320, rightEdge - leftEdge);
      setPosition({ left: Math.max(leftEdge, Math.min(trigger.left, rightEdge - width)), bottom: window.innerHeight - trigger.top + 6, width, maxHeight: Math.max(0, Math.min(420, trigger.top - 18)) });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open]);
  const load = useCallback(async () => { const current = cwd; const result = await uiFetch<BranchInventory>(`/api/git/branches?cwd=${encodeURIComponent(cwd)}`); if (mounted.current && owner.current === current) setInventory(result); }, [cwd]);
  useEffect(() => { let alive = true; const refresh = () => { if (!document.hidden) void load().catch(e => { if (alive) setError(e.message); }); }; refresh(); const timer = setInterval(refresh, 10000); window.addEventListener("focus", refresh); window.addEventListener("pi-git-changed", refresh); return () => { alive = false; clearInterval(timer); window.removeEventListener("focus", refresh); window.removeEventListener("pi-git-changed", refresh); }; }, [load]);
  useEffect(() => { setOpen(false); setPreview(undefined); setError(""); }, [cwd]);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!anchor.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close); return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  async function review(operation: BranchOperation) { const current = cwd; setBusy(true); setError(""); try { const result = await uiFetch<BranchPreview>("/api/git/branches/preview", { cwd, ...operation }); if (mounted.current && owner.current === current) setPreview(result); } catch (e) { setError(String(e)); } finally { setBusy(false); } }
  async function execute() {
    if (!preview) return;
    const current = cwd; setBusy(true); setError("");
    try { const result = await uiFetch<{ path: string; warning?: string }>("/api/git/branches", { cwd, token: preview.token, keepChanges: true }); window.dispatchEvent(new Event("pi-git-changed")); if (mounted.current && owner.current === current) { setPreview(undefined); if (result.warning) setError(result.warning); else setOpen(false); if (result.path !== inventory?.root) onNavigate(result.path); await load(); } }
    catch (e) { setError(String(e)); setPreview(undefined); } finally { setBusy(false); }
  }
  if (inventory?.isGit === false) return null;
  return <div className="workbench-branch-control" ref={anchor} onKeyDown={e => { if (e.key === "Escape" && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); } }}>
    <button type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => { setOpen(v => !v); if (!open) void load().catch(e => setError(e.message)); }} title={cwd}>⑂ {inventory?.current || (inventory?.head ? `${t("wb.detached")} ${inventory.head.slice(0, 7)}` : t("wb.branch"))}</button>
    {open && position && <div className="workbench-branch-popover workbench-content" style={position} role="dialog" aria-label={t("wb.branch")}>
      <div className="workbench-toolbar"><strong>{t("wb.branch")}</strong><button onClick={() => setOpen(false)} aria-label={t("wb.close")}>×</button></div>
      {error && <p role="alert">{error}</p>}
      {inventory?.isGit && <><small>{inventory.root}</small>
        {preview ? <><p>{preview.name} ← {preview.baseSha.slice(0, 10)}</p><p>{preview.path}</p>{preview.dirty && <p>{t("wb.keepChangesHint")}</p>}<div className="workbench-actions"><button disabled={busy} onClick={() => void execute()}>{t(preview.location === "worktree" ? "wb.createWorktree" : preview.dirty ? "wb.switchKeeping" : preview.action === "create" ? "wb.createSwitch" : "wb.switch")}</button><button onClick={() => setPreview(undefined)}>{t("wb.back")}</button></div></> : <>
        <div className="workbench-actions"><button disabled={busy} onClick={async () => { setBusy(true); try { await uiFetch("/api/worktrees/fetch", { cwd }); await load(); } catch (e) { setError(String(e)); } finally { setBusy(false); } }}>{t("wb.fetch")}</button><button onClick={() => (setRemoteRef(undefined), setCreating(v => !v))}>{t("wb.createBranch")}</button></div>
        {(creating || remoteRef) && <form onSubmit={e => { e.preventDefault(); void review(remoteRef ? { action: "switch", name, ref: remoteRef, location: "current" } : { action: "create", name, baseRef, location }); }}>
          <label>{t("wb.name")}<input required value={name} onChange={e => setName(e.target.value)} /></label>
          {!remoteRef && <><label>{t("wb.base")}<select value={baseRef} onChange={e => setBase(e.target.value)}><option value="HEAD">HEAD · {inventory.head.slice(0, 7)}</option>{inventory.branches.map(b => <option key={b.ref} value={b.ref}>{b.name}</option>)}</select></label>
          <label>{t("wb.location")}<select value={location} onChange={e => setLocation(e.target.value as "current" | "worktree")}><option value="current">{t("wb.currentCheckout")}</option><option value="worktree">{t("wb.newWorktree")}</option></select></label></>}
          <button disabled={busy}>{t("wb.reviewOperation")}</button>
        </form>}
        <input aria-label={t("wb.searchBranches")} placeholder={t("wb.searchBranches")} value={query} onChange={e => setQuery(e.target.value)} />
        {inventory.branches.filter(b => b.name.toLowerCase().includes(query.toLowerCase())).map(b => <button className="workbench-branch-row" disabled={busy || b.ref === `refs/heads/${inventory.current}`} key={b.ref} onClick={() => b.worktree && b.worktree !== inventory.root ? (setOpen(false), onNavigate(b.worktree)) : b.remote ? (setRemoteRef(b.ref), setCreating(false), setName(b.name.slice(b.name.indexOf("/") + 1))) : void review({ action: "switch", location: "current", ref: b.ref })}><span>{b.name}</span><small>{t(b.worktree && b.worktree !== inventory.root ? "wb.openWorktree" : "wb.switch")}</small></button>)}
        </>}
      </>}
    </div>}
  </div>;
}
