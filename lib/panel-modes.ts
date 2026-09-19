export const PANEL_MODES = ["files", "activity", "search", "tasks"] as const;
export type PanelMode = typeof PANEL_MODES[number];
export function panelMode(value: unknown): PanelMode { return PANEL_MODES.includes(value as PanelMode) ? value as PanelMode : "files"; }
