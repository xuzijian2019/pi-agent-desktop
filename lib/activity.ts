import { randomUUID } from "crypto";
import { readUiStore, updateUiStore } from "./web-ui-store";
import { activeRun, type ActivityRun, type ActivitySnapshot } from "./activity-types";

type State = { epoch: string; version: number; runs: Map<string, ActivityRun>; listeners: Set<() => void>; saving: Promise<void>; persistenceError?: string };
declare global { var __piActivity: State | undefined; }
function state(): State {
  if (!globalThis.__piActivity) {
    let runs: ActivityRun[] = [];
    let persistenceError: string | undefined;
    try { runs = readUiStore<{ runs: ActivityRun[] }>("activity.json", { runs: [] }).runs; }
    catch { persistenceError = "Activity history could not be read"; }
    globalThis.__piActivity = { epoch: randomUUID(), version: 0, runs: new Map(runs.map(r => [r.sessionId, activeRun(r) ? { ...r, status: "interrupted", phase: "interrupted", finishedAt: Date.now(), updatedAt: Date.now(), pendingInput: false } : r])), listeners: new Set(), saving: Promise.resolve(), persistenceError };
  }
  return globalThis.__piActivity;
}
export function activitySnapshot(): ActivitySnapshot {
  const s = state();
  return { epoch: s.epoch, version: s.version, runs: [...s.runs.values()].sort((a, b) => Number(activeRun(b)) - Number(activeRun(a)) || Number(b.pendingInput) - Number(a.pendingInput) || b.updatedAt - a.updatedAt), persistenceError: s.persistenceError };
}
export function subscribeActivity(listener: () => void) { state().listeners.add(listener); return () => { state().listeners.delete(listener); }; }
function changed() {
  const s = state(); s.version++;
  const terminal = [...s.runs.values()].filter(r => !activeRun(r)).sort((a, b) => b.updatedAt - a.updatedAt);
  for (const r of terminal.slice(100)) s.runs.delete(r.sessionId);
  s.listeners.forEach(l => l());
  const runs = structuredClone([...s.runs.values()]);
  s.saving = s.saving.then(() => updateUiStore("activity.json", { runs: [] as ActivityRun[] }, data => { data.runs = runs; })).then(() => { s.persistenceError = undefined; }).catch(() => { s.persistenceError = "Activity history could not be saved"; });
}
export function beginActivity(sessionId: string, runId: string, cwd: string, title: string) {
  const previous = state().runs.get(sessionId);
  if (previous?.runId === runId && activeRun(previous)) return;
  const now = Date.now();
  state().runs.set(sessionId, { sessionId, runId, cwd, title: title.slice(0, 160) || sessionId, status: "running", phase: "waiting_model", startedAt: now, updatedAt: now, pendingInput: false, queueCount: 0 }); changed();
}
export function patchActivity(sessionId: string, runId: string, patch: Partial<ActivityRun>) {
  const previous = state().runs.get(sessionId);
  if (!previous || previous.runId !== runId) return;
  if (!activeRun(previous)) return;
  if (Object.entries(patch).every(([k, v]) => previous[k as keyof ActivityRun] === v)) return;
  state().runs.set(sessionId, { ...previous, ...patch, sessionId, runId, updatedAt: Date.now() }); changed();
}
export function finishActivity(sessionId: string, runId: string, status: "completed" | "failed" | "stopped" | "interrupted") {
  const run = state().runs.get(sessionId);
  if (!run || run.runId !== runId || !activeRun(run)) return;
  patchActivity(sessionId, runId, { status, phase: status, finishedAt: Date.now(), pendingInput: false, queueCount: 0 });
}
