export type TaskEffort = "inherit" | "auto" | "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
export type TaskTools = "inherit" | "none" | "read-only" | "default" | "full";
export interface TaskSetup {
  model: { provider: string; modelId: string } | null;
  effort: TaskEffort;
  tools: TaskTools;
}
export interface SavedTask extends TaskSetup {
  id: string; revision: number; name: string; description: string; prompt: string;
  projectRoot: string | null; createdAt: string; updatedAt: string;
}
export const emptyTask = (): Omit<SavedTask, "id" | "revision" | "createdAt" | "updatedAt"> => ({ name: "", description: "", prompt: "", projectRoot: null, model: null, effort: "inherit", tools: "inherit" });
