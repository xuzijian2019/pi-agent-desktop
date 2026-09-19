export const PANEL_MODES = ["files", "browser", "diff", "activity", "search", "tasks", "outputs", "context"] as const;
export type PanelMode = typeof PANEL_MODES[number];
export function panelMode(value: unknown): PanelMode { return PANEL_MODES.includes(value as PanelMode) ? value as PanelMode : "files"; }
