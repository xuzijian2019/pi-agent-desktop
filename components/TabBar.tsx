"use client";

import { getFileIcon } from "./FileIcons";
import { useI18n } from "@/hooks/useI18n";
import type { FileViewerDisplayMode, FileViewerState } from "@/lib/file-viewer-state";

export interface Tab {
  id: string;
  label: string;
  filePath: string;
  kind?: "terminal";
  closing?: boolean;
  sourceSessionId?: string | null;
  initialDisplayMode?: FileViewerDisplayMode;
  /** PDF page requested by the link that opened this tab (`#page=N`). */
  page?: number;
  viewerState?: FileViewerState;
  viewerRevision?: number;
}

interface Props {
  tabs: Tab[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onNewTerminal?: () => void;
}

export function TabBar({ tabs, activeTabId, onSelectTab, onCloseTab, onNewTerminal }: Props) {
  const { t } = useI18n();

  return (
    <div className="file-tab-bar" role="tablist" aria-label="Open files">
      {/* No empty-state label: the header's view switch already reads "Files". */}
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const closeLabel = t(tab.kind === "terminal" ? "terminal.close" : "i18n.close");
        return (
          <div
            key={tab.id}
            className={`file-tab${isActive ? " is-active" : ""}`}
            role="tab"
            aria-label={tab.kind === "terminal" ? t("terminal.tabLabel", { name: tab.label }) : tab.label}
            aria-selected={isActive}
            tabIndex={isActive || (!activeTabId && tabs[0].id === tab.id) ? 0 : -1}
            data-tab-id={tab.id}
            title={tab.filePath}
            onClick={() => onSelectTab(tab.id)}
            onKeyDown={(event) => {
              if (event.target !== event.currentTarget) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelectTab(tab.id);
              } else if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
                event.preventDefault();
                const index = tabs.findIndex((item) => item.id === tab.id);
                const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
                  : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
                onSelectTab(tabs[next].id);
                (event.currentTarget.parentElement?.children[next] as HTMLElement)?.focus();
              }
            }}
            onMouseDown={(event) => {
              if (event.button === 1) event.preventDefault();
            }}
            onAuxClick={(event) => {
              if (event.button !== 1) return;
              event.preventDefault();
              event.stopPropagation();
              onCloseTab(tab.id);
            }}
          >
            <span className="file-tab-icon">
              {tab.kind === "terminal" ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
                </svg>
              ) : getFileIcon(tab.label, 13)}
            </span>
            <span
              className="file-tab-label"
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                flex: 1,
                fontWeight: isActive ? 550 : 400,
              }}
              title={tab.filePath}
            >
              {tab.label}
            </span>
            <button
              type="button"
              className="file-tab-close"
              disabled={tab.closing}
              onClick={(event) => {
                event.stopPropagation();
                onCloseTab(tab.id);
              }}
              title={closeLabel}
              aria-label={`${closeLabel} ${tab.label}`}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
                <line x1="2" y1="2" x2="8" y2="8" />
                <line x1="8" y1="2" x2="2" y2="8" />
              </svg>
            </button>
          </div>
        );
      })}
      {onNewTerminal && (
        <div className="file-tab-add-anchor">
          <button
            type="button"
            className="file-tab-add"
            onClick={onNewTerminal}
            title={t("terminal.newTerminal")}
            aria-label={t("terminal.newTerminal")}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 28,
              height: 28,
              margin: "0 4px 4px 4px",
              background: "none",
              border: "none",
              borderRadius: 4,
              color: "var(--text-muted)",
              cursor: "pointer",
              flexShrink: 0,
              transition: "background 0.1s, color 0.1s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--bg-hover)";
              e.currentTarget.style.color = "var(--text)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "none";
              e.currentTarget.style.color = "var(--text-muted)";
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
