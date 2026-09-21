import { randomUUID } from "crypto";
import { readUiStore, updateUiStore, UiError } from "./web-ui-store";
import type { SavedTask, TaskEffort, TaskTools } from "./task-types";
import { getAllowedFileRoots, isExistingFilePathAllowed } from "./file-access";
import { statSync } from "fs";
import { resolveProject } from "./worktree";

const STORE = "saved-tasks.json";
type Store = { version: 1; tasks: SavedTask[] };
const initial = (): Store => ({ version: 1, tasks: [] });
export async function taskProject(cwd: unknown): Promise<string | null> {
  if (cwd === null || cwd === undefined || cwd === "") return null;
  if (typeof cwd !== "string" || !isExistingFilePathAllowed(cwd, await getAllowedFileRoots()) || !statSync(cwd).isDirectory()) throw new UiError("Access denied", 403);
  return (await resolveProject(cwd)).projectRoot;
}
export function validateTask(body: Record<string, unknown>): Omit<SavedTask, "id" | "revision" | "createdAt" | "updatedAt"> {
  const { name, description = "", prompt = "", projectRoot = null, model = null, effort = "inherit", tools = "inherit" } = body;
  if (typeof name !== "string" || !name.trim() || name.trim().length > 80 || typeof description !== "string" || description.length > 500 || typeof prompt !== "string" || Buffer.byteLength(prompt) > 131072) throw new UiError("Invalid task text");
  if (projectRoot !== null && typeof projectRoot !== "string") throw new UiError("Invalid project scope");
  if (model !== null && (typeof model !== "object" || typeof (model as Record<string, unknown>).provider !== "string" || !(model as Record<string, unknown>).provider || typeof (model as Record<string, unknown>).modelId !== "string" || !(model as Record<string, unknown>).modelId)) throw new UiError("Invalid model");
  if (!["inherit", "auto", "off", "minimal", "low", "medium", "high", "xhigh", "max"].includes(String(effort)) || !["inherit", "none", "read-only", "default", "full"].includes(String(tools))) throw new UiError("Invalid task settings");
  return { name: name.trim(), description, prompt, projectRoot, model: model as SavedTask["model"], effort: effort as TaskEffort, tools: tools as TaskTools };
}
export function listSavedTasks(projectRoot: string | null) {
  return readUiStore(STORE, initial()).tasks.filter(t => !t.projectRoot || t.projectRoot === projectRoot);
}
export async function saveTask(body: Record<string, unknown>, id?: string) {
  const input = validateTask(body);
  input.projectRoot = await taskProject(input.projectRoot);
  // Check old scope too; changing scope must not grant access to another project's task.
  const old = id ? readUiStore(STORE, initial()).tasks.find(t => t.id === id) : null;
  if (old) await taskProject(old.projectRoot);
  return updateUiStore(STORE, initial(), data => {
    const index = data.tasks.findIndex(t => t.id === id);
    if (id && index < 0) throw new UiError("Task not found", 404);
    if (id && data.tasks[index].revision !== body.revision) throw new UiError("Task changed. Reload or save as a copy.", 409);
    if (!id && data.tasks.length >= 500) throw new UiError("Task library is full");
    const now = new Date().toISOString();
    const task: SavedTask = { ...input, id: id ?? randomUUID(), revision: id ? data.tasks[index].revision + 1 : 1, createdAt: id ? data.tasks[index].createdAt : now, updatedAt: now };
    if (id) data.tasks[index] = task; else data.tasks.push(task);
    return task;
  });
}
export async function deleteTask(id: string, revision: unknown) {
  const old = readUiStore(STORE, initial()).tasks.find(t => t.id === id);
  if (old) await taskProject(old.projectRoot);
  return updateUiStore(STORE, initial(), data => {
    const item = data.tasks.find(t => t.id === id);
    if (!item) throw new UiError("Task not found", 404);
    if (item.revision !== revision) throw new UiError("Task changed. Reload before deleting.", 409);
    data.tasks = data.tasks.filter(t => t.id !== id);
    return { success: true };
  });
}
