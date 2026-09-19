"use client";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import type { SavedTask } from "@/lib/task-types";
import { uiFetch } from "@/lib/web-ui-client";

/** Three fits one row at 820px and still reads as a hint rather than a menu. */
export const RECENT_TASK_LIMIT = 3;

/** Most recently updated first. `updatedAt` is an ISO string written by
 *  lib/saved-tasks.ts; a library file hand-edited without one keeps its place
 *  in the list rather than jumping to the front. */
export function recentTasks(tasks: SavedTask[], limit = RECENT_TASK_LIMIT): SavedTask[] {
  const stamped = tasks.map((task, order) => ({ task, order, at: Date.parse(task.updatedAt ?? "") || 0 }));
  stamped.sort((a, b) => b.at - a.at || a.order - b.order);
  return stamped.slice(0, limit).map(entry => entry.task);
}

/** One GET through uiFetch, which coalesces it with the Saved Tasks panel's
 *  identical request when both are mounted. No poller: the library only
 *  changes from that panel, which broadcasts on "pi-saved-tasks". */
export async function loadRecentTasks(cwd: string, signal?: AbortSignal): Promise<SavedTask[]> {
  const data = await uiFetch<{ tasks: SavedTask[] }>(`/api/saved-tasks?cwd=${encodeURIComponent(cwd)}`, undefined, undefined, signal);
  return recentTasks(data.tasks ?? []);
}

export function NewTaskGuideView({ tasks, busy, error, onUse, onOpenTasks }: { tasks: SavedTask[]; busy?: boolean; error?: string; onUse: (task: SavedTask) => void; onOpenTasks?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="new-task-guide">
      <p className="new-task-guide-hint">{t("wb.newTaskHint")}</p>
      {tasks.length > 0 && (
        <div className="new-task-guide-chips" role="group" aria-label={t("wb.recentTasks")}>
          {tasks.map(task => (
            <button key={task.id} type="button" className="new-task-chip" disabled={busy} onClick={() => onUse(task)}>
              <strong>{task.name}</strong>
              {task.description && <span>{task.description}</span>}
            </button>
          ))}
          {onOpenTasks && <button type="button" className="new-task-guide-all" onClick={onOpenTasks}>{t("wb.allSavedTasks")}</button>}
        </div>
      )}
      {error && <p className="new-task-guide-error" role="alert">{error}</p>}
    </div>
  );
}

/** The new-task screen, above the composer: one quiet line and, when the
 *  library has any, the three most recent saved tasks. An empty library shows
 *  the line alone — an empty box would be louder than the blank area it
 *  replaced. Rendered only while no session is selected, so a sent message
 *  takes it away with the rest of the empty state. */
export function NewTaskGuide({ cwd, onUseTask, onOpenTasks }: { cwd: string | null; onUseTask: (task: SavedTask) => Promise<void>; onOpenTasks?: () => void }) {
  const [tasks, setTasks] = useState<SavedTask[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setTasks([]);
    if (!cwd) return;
    const controller = new AbortController();
    // A missing or untrusted folder 403s here; the guidance line stands alone
    // rather than reporting a failure the user did not ask for.
    const refresh = () => void loadRecentTasks(cwd, controller.signal).then(setTasks).catch(() => { if (!controller.signal.aborted) setTasks([]); });
    refresh();
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("pi-saved-tasks") : null;
    if (channel) channel.onmessage = refresh;
    return () => { controller.abort(); channel?.close(); };
  }, [cwd]);

  const use = useCallback((task: SavedTask) => {
    setBusy(true); setError("");
    void onUseTask(task).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e))).finally(() => setBusy(false));
  }, [onUseTask]);

  return <NewTaskGuideView tasks={tasks} busy={busy} error={error} onUse={use} onOpenTasks={onOpenTasks} />;
}
