"use client";
import { PANEL_MODES, type PanelMode } from "@/lib/panel-modes";
import { useI18n } from "@/hooks/useI18n";
export function PanelModeSelector({ mode, onChange, onClose }: { mode: PanelMode; onChange: (mode: PanelMode) => void; onClose: () => void }) {
  const { t } = useI18n();
  return <div className="workbench-mode-selector">
    <div className="workbench-mode-tabs" role="tablist" aria-label={t("wb.views")}>
      {PANEL_MODES.map(value => <button role="tab" key={value} aria-selected={mode === value} onClick={() => onChange(value)}>{t(`wb.${value}`)}</button>)}
    </div>
    <label className="workbench-mode-select"><select aria-label={t("wb.views")} value={mode} onChange={e => onChange(e.target.value as PanelMode)}>{PANEL_MODES.map(value => <option key={value} value={value}>{t(`wb.${value}`)}</option>)}</select></label>
    <button aria-label={t("wb.closePanel")} onClick={onClose}>×</button>
  </div>;
}
