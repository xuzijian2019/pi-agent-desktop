export type TaskEffort = "inherit" | "auto" | "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
export type TaskTools = "inherit" | "none" | "read-only" | "default" | "full";
export interface TaskSetup {
  model: { provider: string; modelId: string } | null;
  effort: TaskEffort;
  tools: TaskTools;
}
