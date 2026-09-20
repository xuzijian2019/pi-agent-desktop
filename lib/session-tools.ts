const SESSION_TOOLS_ENTRY = "pi-web:session-tools";

interface ToolSettingsManager {
  getEntries(): { type: string; customType?: string; data?: unknown }[];
  appendCustomEntry(customType: string, data?: unknown): string;
}

/** Session-level metadata, independent of the currently selected conversation branch. */
export function readSessionToolNames(manager: ToolSettingsManager): string[] | undefined {
  const entries = manager.getEntries();
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index];
    if (entry.type !== "custom" || entry.customType !== SESSION_TOOLS_ENTRY) continue;
    const names = (entry.data as { toolNames?: unknown } | null)?.toolNames;
    if (Array.isArray(names) && names.every((name) => typeof name === "string")) return [...names];
  }
  return undefined;
}

export function saveSessionToolNames(manager: ToolSettingsManager, toolNames: string[]): void {
  const names = [...new Set(toolNames)];
  const previous = readSessionToolNames(manager);
  if (previous && previous.length === names.length && previous.every((name) => names.includes(name))) return;
  manager.appendCustomEntry(SESSION_TOOLS_ENTRY, { toolNames: names });
}

export function assertSessionToolsEditable(manager: ToolSettingsManager): void {
  if (manager.getEntries().some((entry) => entry.type === "message")) {
    throw new Error("Tool mode is fixed after the conversation starts. Start a new session to choose a different mode.");
  }
}
