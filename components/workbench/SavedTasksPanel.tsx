"use client";
import { useCallback, useEffect, useState } from "react";
import { PanelActions } from "./PanelActions";
import { useI18n } from "@/hooks/useI18n";
import { emptyTask, type SavedTask, type TaskEffort, type TaskTools } from "@/lib/task-types";
import { uiFetch } from "@/lib/web-ui-client";
type Editor = ReturnType<typeof emptyTask> & Partial<Pick<SavedTask, "id" | "revision">>;
export interface TaskSeed { nonce: number; prompt: string; model: SavedTask["model"]; effort: TaskEffort; tools: TaskTools }
export function SavedTasksPanel({ visible, cwd, seed, onUse, onCapture }: { visible: boolean; cwd: string | null; seed?: TaskSeed; onUse: (task: SavedTask) => Promise<void>; onCapture: () => void }) {
  const { t } = useI18n(); const [tasks, setTasks] = useState<SavedTask[]>([]); const [projectRoot, setProjectRoot] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor>(); const [search, setSearch] = useState(""); const [scope, setScope] = useState("all");
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [models, setModels] = useState<{ provider: string; id: string; name: string }[]>([]);
  const [prompts, setPrompts] = useState<{ name: string; description: string; content: string; path?: string }[]>();
  const load = useCallback(async (signal?: AbortSignal) => { const data = await uiFetch<{ tasks: SavedTask[]; projectRoot: string | null }>(`/api/saved-tasks${cwd ? `?cwd=${encodeURIComponent(cwd)}` : ""}`, undefined, undefined, signal); setTasks(data.tasks); setProjectRoot(data.projectRoot); }, [cwd]);
  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    const refresh = () => void load(controller.signal).catch(e => { if (!controller.signal.aborted) setError(e.message); }); refresh();
    void uiFetch<{ modelList: { provider: string; id: string; name: string }[] }>(`/api/models${cwd ? `?cwd=${encodeURIComponent(cwd)}` : ""}`, undefined, undefined, controller.signal).then(d => setModels(d.modelList ?? [])).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("pi-saved-tasks") : null;
    if (channel) channel.onmessage = refresh;
    window.addEventListener("focus", refresh); return () => { controller.abort(); channel?.close(); window.removeEventListener("focus", refresh); };
  }, [visible, load, cwd]);
  useEffect(() => { if (seed) setEditor({ ...emptyTask(), prompt: seed.prompt, model: seed.model, effort: seed.effort, tools: seed.tools }); }, [seed]);
  function broadcast() { if (typeof BroadcastChannel !== "undefined") { const c = new BroadcastChannel("pi-saved-tasks"); c.postMessage("changed"); c.close(); } }
  const modelValid = (value: Editor | SavedTask) => !value.model || models.some(m => m.provider === value.model!.provider && m.id === value.model!.modelId);
  async function save() { if (!editor) return; setBusy(true); setError(""); try { await uiFetch(`/api/saved-tasks${editor.id ? `/${editor.id}` : ""}`, editor, editor.id ? "PATCH" : "POST"); setEditor(undefined); broadcast(); await load(); } catch (e) { setError(String(e)); } finally { setBusy(false); } }
  async function use(task: SavedTask) { setBusy(true); setError(""); try { await onUse(task); } catch (e) { setError(String(e)); } finally { setBusy(false); } }
  const filtered = tasks.filter(task => (scope === "all" || scope === "global" && !task.projectRoot || scope === "project" && !!task.projectRoot) && `${task.name} ${task.description}`.toLowerCase().includes(search.toLowerCase()));
  return <section className="workbench-content" aria-label={t("wb.tasks")}>
    <h2 className="workbench-sr-only">{t("wb.tasks")}</h2><p>{t("wb.taskHint")}</p>{error && <div role="alert">{error}<button onClick={() => void load().catch(e => setError(String(e)))}>{t("wb.refresh")}</button>{editor?.id && <button onClick={() => setEditor({ ...editor, id: undefined, revision: undefined })}>{t("wb.saveCopy")}</button>}</div>}
    {editor ? <form onSubmit={e => { e.preventDefault(); void save(); }}>
      <label>{t("wb.name")}<input required maxLength={80} value={editor.name} onChange={e => setEditor({ ...editor, name: e.target.value })} /></label>
      <label>{t("wb.description")}<input maxLength={500} value={editor.description} onChange={e => setEditor({ ...editor, description: e.target.value })} /></label>
      <label>{t("wb.prompt")}<textarea rows={9} value={editor.prompt} onChange={e => setEditor({ ...editor, prompt: e.target.value })} /></label>
      <label>{t("wb.scope")}<select aria-label={t("wb.scope")} value={editor.projectRoot ? "project" : "global"} onChange={e => setEditor({ ...editor, projectRoot: e.target.value === "global" ? null : projectRoot })}><option value="global">{t("wb.global")}</option><option value="project" disabled={!projectRoot}>{t("wb.thisProject")}</option></select></label>
      <label>{t("common.models")}<select value={editor.model ? `${editor.model.provider}/${editor.model.modelId}` : ""} onChange={e => { const m = models.find(m => `${m.provider}/${m.id}` === e.target.value); setEditor({ ...editor, model: m ? { provider: m.provider, modelId: m.id } : null }); }}><option value="">{t("wb.inherit")}</option>{editor.model && !modelValid(editor) && <option value={`${editor.model.provider}/${editor.model.modelId}`}>{editor.model.modelId} ({t("wb.unavailable")})</option>}{models.map(m => <option key={`${m.provider}/${m.id}`} value={`${m.provider}/${m.id}`}>{m.name} · {m.provider}</option>)}</select></label>
      <label>{t("wb.effort")}<select aria-label={t("wb.effort")} value={editor.effort} onChange={e => setEditor({ ...editor, effort: e.target.value as TaskEffort })}>{["inherit", "auto", "off", "minimal", "low", "medium", "high", "xhigh", "max"].map(v => <option key={v} value={v}>{v === "inherit" ? t("wb.inherit") : v === "auto" ? t("wb.auto") : v}</option>)}</select></label>
      <label>{t("wb.tools")}<select aria-label={t("wb.tools")} value={editor.tools} onChange={e => setEditor({ ...editor, tools: e.target.value as TaskTools })}>{["inherit", "none", "default", "full"].map(v => <option key={v} value={v}>{t(`wb.${v}`)}</option>)}</select></label>
      <small>{t("wb.inheritHint")}</small><div className="workbench-actions"><button disabled={busy}>{t("wb.save")}</button><button type="button" onClick={() => setEditor(undefined)}>{t("wb.cancel")}</button></div>
    </form> : <>
      <div className="workbench-actions"><button onClick={() => { setError(""); setEditor(emptyTask()); }}>{t("wb.newTask")}</button><PanelActions><button disabled={!cwd} onClick={onCapture}>{t("wb.saveCurrent")}</button><button disabled={!cwd} onClick={async () => { try { const d = await uiFetch<{ prompts: NonNullable<typeof prompts> }>(`/api/saved-tasks/prompts?cwd=${encodeURIComponent(cwd!)}`); setPrompts(d.prompts); } catch (e) { setError(String(e)); } }}>{t("wb.importPrompt")}</button></PanelActions></div>
      {prompts && <div className="workbench-card"><p>{t("wb.importHint")}</p>{!prompts.length && <p>{t("wb.empty")}</p>}{prompts.map((p, i) => <button key={i} onClick={() => { setEditor({ ...emptyTask(), name: p.name, description: `${p.description || ""}${p.path ? ` (${p.path})` : ""}`.slice(0, 500), prompt: p.content }); setPrompts(undefined); }}>{p.name}</button>)}<button onClick={() => setPrompts(undefined)}>{t("wb.close")}</button></div>}
      <div className="workbench-toolbar"><input aria-label={t("wb.searchTasks")} placeholder={t("wb.searchTasks")} value={search} onChange={e => setSearch(e.target.value)} /><select aria-label={t("wb.scope")} value={scope} onChange={e => setScope(e.target.value)}><option value="all">{t("wb.all")}</option><option value="global">{t("wb.global")}</option><option value="project">{t("wb.thisProject")}</option></select></div>
      {!filtered.length && <p className="workbench-empty">{t(!tasks.length && !search.trim() && scope === "all" ? "wb.noTasksYet" : "wb.noTasks")}</p>}{filtered.map(task => <article className="workbench-card" key={task.id}><strong>{task.name}</strong><p>{task.description}</p><small>{task.model?.modelId || t("wb.inherit")} · {task.effort} · {task.tools}</small><details><summary>{t("wb.preview")}</summary><pre>{task.prompt}</pre></details>{!modelValid(task) && <p>{t("wb.modelUnavailable")}</p>}<div className="workbench-actions"><button disabled={busy || !cwd || !modelValid(task)} onClick={() => void use(task)}>{t("wb.use")}</button><button onClick={() => setEditor(task)}>{t("wb.edit")}</button><PanelActions><button onClick={() => setEditor({ ...task, id: undefined, revision: undefined, name: `${task.name} (copy)`.slice(0, 80) })}>{t("wb.duplicate")}</button><button disabled={busy} onClick={async () => { setBusy(true); try { await uiFetch(`/api/saved-tasks/${task.id}`, { revision: task.revision }, "DELETE"); broadcast(); await load(); } catch (e) { setError(String(e)); } finally { setBusy(false); } }}>{t("wb.delete")}</button></PanelActions></div></article>)}
    </>}
  </section>;
}
