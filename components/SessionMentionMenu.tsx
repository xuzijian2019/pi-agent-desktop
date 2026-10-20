"use client";

// Fork-owned: the `#` session-mention menu above the composer. State lives in
// hooks/useSessionMentionPalette.ts; ChatInput (upstream-owned) only mounts this.

import type { MutableRefObject } from "react";
import type { SessionMentionEntry } from "@/lib/file-fuzzy";
import { useI18n } from "@/hooks/useI18n";

interface SessionMentionMenuProps {
  /** False until the session index has been fetched once. */
  loaded: boolean;
  showHints?: boolean;
  matches: SessionMentionEntry[];
  activeIndex: number;
  itemRefs: MutableRefObject<Array<HTMLButtonElement | null>>;
  onPick: (entry: SessionMentionEntry) => void;
  onHover: (index: number) => void;
}

export function SessionMentionMenu({ loaded, matches, activeIndex, itemRefs, onPick, onHover, showHints = true }: SessionMentionMenuProps) {
  const { t } = useI18n();
  const matchCountLabel = matches.length === 1 ? t("chat.match") : t("chat.matches", { count: matches.length });
  return (
    <div
      className="native-popover app-menu composer-completion-popover is-front"
    >
      <div className="composer-completion-header">
        <span>{loaded ? t("chat.sessions", { label: matchCountLabel }) : t("chat.loadingSessions")}</span>
        {showHints && <span className="composer-completion-hint">{t("chat.tabEnter")}</span>}
      </div>
      <div className="composer-completion-body">
        {!loaded ? (
          <div className="composer-completion-empty">{t("chat.loadingSessions")}</div>
        ) : matches.length === 0 ? (
          <div className="composer-completion-empty">{t("chat.noMatchingSessions")}</div>
        ) : matches.map((entry, index) => {
          const active = index === activeIndex;
          const name = entry.name?.trim() || entry.firstMessage.trim() || t("chat.untitledSession");
          return (
            <button
              key={`session:${entry.id}`}
              ref={(node) => {
                itemRefs.current[index] = node;
              }}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(entry);
              }}
              onMouseEnter={() => onHover(index)}
              className={`composer-completion-item is-session${active ? " is-active" : ""}`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
              </svg>
              <span className="composer-ellipsis">
                <span className="composer-session-name">{name}</span>
                <span className="composer-session-sub">{entry.firstMessage}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
