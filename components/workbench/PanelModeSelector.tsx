"use client";
import type { ReactNode } from "react";
import { PANEL_MODES, type PanelMode } from "@/lib/panel-modes";
import { useI18n } from "@/hooks/useI18n";

/**
 * The panel's single chrome row: view switch on the left, the active view's own
 * controls (open file tabs, changes, file actions) in the middle, close on the
 * right. One row instead of three keeps the vertical space for content.
 */
export function PanelModeSelector({ mode, onChange, onClose, children }: { mode: PanelMode; onChange: (mode: PanelMode) => void; onClose: () => void; children?: ReactNode }) {
  const { t } = useI18n();
  return <div className="workbench-mode-selector right-panel-tab-strip">
    <label className="workbench-mode-select"><select aria-label={t("wb.views")} value={mode} onChange={e => onChange(e.target.value as PanelMode)}>{PANEL_MODES.map(value => <option key={value} value={value}>{t(`wb.${value}`)}</option>)}</select></label>
    {children}
    <button className="workbench-mode-close" aria-label={t("wb.closePanel")} title={t("wb.closePanel")} onClick={onClose}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="15" y1="3" x2="15" y2="21" /></svg></button>
  </div>;
}
