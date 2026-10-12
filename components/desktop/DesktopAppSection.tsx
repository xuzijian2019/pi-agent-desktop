"use client";

import { useState } from "react";

import { APP_PREF_KEYS, getPrefBool, setPrefBool } from "@/lib/app-prefs";
import { clearAppCacheNative, openLogDirNative, quitAppNative, setCloseQuitsNative } from "@/lib/desktop-native";
import { useI18n } from "@/hooks/useI18n";
import { ConfigButton, ConfigSwitch } from "@/components/SettingsUi";

import { useDesktopChrome } from "./useDesktopChrome";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Window, tray and notification behaviour for the packaged desktop app.
 *
 * Renders nothing in a browser build, so the General settings tab can mount it
 * unconditionally instead of branching on `isTauriDesktop()` itself. This is
 * the remainder of the old "Desktop" settings tab after the app info moved to
 * the top of General and its language / appearance blocks were dropped as
 * duplicates of what General already offers.
 */
export function DesktopAppSection() {
  const { t } = useI18n();
  const { isDesktop } = useDesktopChrome();
  const [closeQuits, setCloseQuits] = useState(() => getPrefBool(APP_PREF_KEYS.closeQuits, false));
  const [notifyOnComplete, setNotifyOnComplete] = useState(
    () => getPrefBool(APP_PREF_KEYS.notifyOnComplete, true),
  );

  const [cacheState, setCacheState] = useState<
    { status: "idle" | "busy" | "error" } | { status: "done"; freed: number }
  >({ status: "idle" });

  if (!isDesktop) return null;

  const clearCache = async () => {
    setCacheState({ status: "busy" });
    try {
      setCacheState({ status: "done", freed: await clearAppCacheNative() });
    } catch {
      setCacheState({ status: "error" });
    }
  };

  return (
    <section className="settings-general-section">
      <h3 className="settings-general-heading">{t("appSettings.desktopSection")}</h3>
      <p className="settings-general-description">{t("appSettings.desktopHint")}</p>
      <div className="settings-option-list">
        <div className="settings-option">
          <span className="settings-option-text">
            <span className="settings-option-title">{t("appSettings.closeQuits")}</span>
            <span className="settings-option-hint">{t("appSettings.closeQuitsHint")}</span>
          </span>
          <ConfigSwitch
            checked={closeQuits}
            label={t("appSettings.closeQuits")}
            onChange={(next) => {
              setCloseQuits(next);
              setPrefBool(APP_PREF_KEYS.closeQuits, next);
              void setCloseQuitsNative(next);
            }}
          />
        </div>
        <div className="settings-option">
          <span className="settings-option-text">
            <span className="settings-option-title">{t("appSettings.notifyOnComplete")}</span>
            <span className="settings-option-hint">{t("appSettings.notifyOnCompleteHint")}</span>
          </span>
          <ConfigSwitch
            checked={notifyOnComplete}
            label={t("appSettings.notifyOnComplete")}
            onChange={(next) => {
              setNotifyOnComplete(next);
              setPrefBool(APP_PREF_KEYS.notifyOnComplete, next);
            }}
          />
        </div>
        <div className="settings-option">
          <span className="settings-option-text">
            <span className="settings-option-title">{t("appSettings.clearCache")}</span>
            <span className="settings-option-hint" role="status">
              {cacheState.status === "done"
                ? t("appSettings.clearCacheDone", { size: formatBytes(cacheState.freed) })
                : cacheState.status === "error"
                  ? t("appSettings.clearCacheError")
                  : t("appSettings.clearCacheHint")}
            </span>
          </span>
          <ConfigButton disabled={cacheState.status === "busy"} onClick={() => void clearCache()}>
            {cacheState.status === "busy" ? t("appSettings.clearCacheBusy") : t("appSettings.clearCache")}
          </ConfigButton>
        </div>
      </div>
      <ConfigButton className="settings-option-action" onClick={() => void openLogDirNative()}>
        {t("appSettings.openLogs")}
      </ConfigButton>
      <ConfigButton className="settings-option-action" onClick={() => void quitAppNative()}>
        {t("appSettings.quitApp")}
      </ConfigButton>
    </section>
  );
}
