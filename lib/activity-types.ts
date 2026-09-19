export type ActivityStatus = "running" | "waiting" | "completed" | "failed" | "stopped" | "interrupted";
export interface ActivityRun {
  sessionId: string; runId: string; title: string; cwd: string; projectRoot?: string; branch?: string | null;
  status: ActivityStatus; phase: string; startedAt: number; updatedAt: number; finishedAt?: number;
  pendingInput: boolean; queueCount: number;
}
export interface ActivitySnapshot { epoch: string; version: number; runs: ActivityRun[]; persistenceError?: string }
export const activeRun = (run: ActivityRun) => run.status === "running" || run.status === "waiting";
