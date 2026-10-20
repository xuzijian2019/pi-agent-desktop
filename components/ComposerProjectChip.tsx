"use client";

// Fork-owned: the project chip at the composer's left edge, which keeps the session's
// project visible and switches a new-session composer between active projects.
// ChatInput (upstream-owned) keeps the open state and ref (its outside-click
// handler closes every composer menu) and mounts this.

import { useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { createPortal } from "react-dom";
import { canUseNativeMenu, menuPointBelow, showNativeMenu } from "@/lib/desktop-menu";
import { getProjectDisplayName } from "@/lib/project-display";
import { useI18n } from "@/hooks/useI18n";

export function getProjectLabel(
  projectPath: string | null | undefined,
  allProjectPaths: readonly string[] = [],
): string | null {
  if (!projectPath) return null;
  return getProjectDisplayName(projectPath, allProjectPaths);
}

interface ComposerProjectChipProps {
  menuRef: RefObject<HTMLDivElement | null>;
  open: boolean;
  onOpenChange: Dispatch<SetStateAction<boolean>>;
  label: string;
  projectPath?: string | null;
  isCompact?: boolean;
  /** Active project roots a new-session composer can switch between. */
  projectOptions: string[];
  onProjectChange?: (projectRoot: string) => void;
  /** Opens the project chooser when there is no list to switch within. */
  onSelectProject?: () => void;
}

export function ComposerProjectChip({
  menuRef, open, onOpenChange, label, projectPath, isCompact = false, projectOptions, onProjectChange, onSelectProject,
}: ComposerProjectChipProps) {
  const { t } = useI18n();
  // Full-path flyout beside the hovered row; kept out of the native tooltip.
  const [projectPathTip, setProjectPathTip] = useState<{ path: string; top: number; left: number } | null>(null);
  return (
    <div ref={menuRef} className="composer-anchor is-static">
      <button
        type="button"
        className={`chat-project-context${isCompact ? " is-compact" : ""}`}
        title={`${t("chat.switchProject")} · ${t("chat.currentProject", { path: projectPath ?? label })}`}
        aria-label={t("chat.currentProject", { path: projectPath ?? label })}
        aria-haspopup={projectOptions.length > 0 && onProjectChange ? "menu" : undefined}
        aria-expanded={projectOptions.length > 0 && onProjectChange ? open : undefined}
        onClick={(event) => {
          if (projectOptions.length > 0 && onProjectChange) {
            setProjectPathTip(null);
            // Desktop shell: the project list as a native popup.
            if (canUseNativeMenu()) {
              void showNativeMenu(
                projectOptions.map((projectRoot) => ({
                  label: getProjectLabel(projectRoot, projectOptions) ?? projectRoot,
                  checked: projectRoot === projectPath,
                  onSelect: () => {
                    if (projectRoot !== projectPath) onProjectChange(projectRoot);
                  },
                })),
                menuPointBelow(event.currentTarget),
              ).then((shown) => { if (!shown) onOpenChange(true); });
              return;
            }
            onOpenChange((open) => !open);
          } else onSelectProject?.();
        }}
        disabled={!onSelectProject && !(projectOptions.length > 0 && onProjectChange)}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
        </svg>
        <span>{label}</span>
      </button>
      {open && projectOptions.length > 0 && onProjectChange && (
        <div
          className="native-popover app-menu composer-project-menu"
          role="menu"
          onMouseLeave={() => setProjectPathTip(null)}
          onScroll={() => setProjectPathTip(null)}
        >
          {projectOptions.map((projectRoot) => {
            const label = getProjectLabel(projectRoot, projectOptions) ?? projectRoot;
            const isCurrent = projectRoot === projectPath;
            return (
              <button
                key={projectRoot}
                type="button"
                role="menuitem"
                aria-current={isCurrent ? "true" : undefined}
                onClick={() => {
                  onOpenChange(false);
                  setProjectPathTip(null);
                  if (!isCurrent) onProjectChange(projectRoot);
                }}
                className={`composer-project-option${isCurrent ? " is-current" : ""}`}
                onMouseEnter={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setProjectPathTip({ path: projectRoot, top: rect.top, left: rect.right + 8 });
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
                </svg>
                <span className="composer-ellipsis">{label}</span>
                {isCurrent && <span className="composer-check">✓</span>}
              </button>
            );
          })}
        </div>
      )}
      {projectPathTip && open && createPortal(
        (() => {
          const vh = window.visualViewport?.height ?? window.innerHeight;
          const top = Math.max(8, Math.min(projectPathTip.top, vh - 40));
          return (
            <div
              role="tooltip"
              className="composer-path-tooltip"
              style={{
                top,
                left: projectPathTip.left,
                maxWidth: `calc(100vw - ${projectPathTip.left + 8}px)`,
                maxHeight: `calc(${vh}px - ${top + 8}px)`,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="composer-icon">
                <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
              </svg>
              <span className="composer-wrap-anywhere">{projectPathTip.path}</span>
            </div>
          );
        })(),
        document.body,
      )}
    </div>
  );
}
