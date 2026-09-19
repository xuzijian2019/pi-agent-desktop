"use client";

import { useI18n } from "@/hooks/useI18n";

/**
 * Replaces the composer in the chat area when the active folder no longer
 * exists. Everything the composer would render for such a cwd — branch chip,
 * model chip, skills and plugins dialogs — resolves to "Access denied", so one
 * calm state with the two useful exits stands in for all of it.
 *
 * "Remove project" and "Pick a new folder" are the sidebar's own actions,
 * reached through `SidebarProjectActions`; nothing is duplicated here.
 */
export function MissingFolderNotice({ cwd, onRemoveProject, onPickFolder }: {
  cwd: string;
  onRemoveProject: () => void;
  onPickFolder: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="missing-folder-notice" role="status">
      <span className="missing-folder-notice-icon" aria-hidden="true">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
          <line x1="9" y1="11" x2="15" y2="17" />
          <line x1="15" y1="11" x2="9" y2="17" />
        </svg>
      </span>
      <p className="missing-folder-notice-path">{cwd}</p>
      <p className="missing-folder-notice-text">{t("workspace.folderMissing")}</p>
      <div className="missing-folder-notice-actions">
        <button type="button" className="missing-folder-notice-action" onClick={onRemoveProject}>
          {t("sidebar.archiveProject")}
        </button>
        <button type="button" className="missing-folder-notice-action is-primary" onClick={onPickFolder}>
          {t("workspace.pickFolder")}
        </button>
      </div>
    </div>
  );
}
