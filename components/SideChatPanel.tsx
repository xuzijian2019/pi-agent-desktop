"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentMessage, ToolResultMessage } from "@/lib/types";
import { MessageView } from "./MessageView";
import { useI18n } from "@/hooks/useI18n";

export function SideChatPanel({ messages, busy, ready, error, parentRunning, cwd, onSend, onStop, onClose }: {
  messages: AgentMessage[]; busy: boolean; ready: boolean; error: string | null; parentRunning: boolean; cwd?: string;
  onSend: (message: string) => void; onStop: () => void; onClose: () => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const toolResults = useMemo(() => new Map(messages.filter((message): message is ToolResultMessage => message.role === "toolResult").map(message => [message.toolCallId, message])), [messages]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest" }); }, [messages, busy]);
  const submit = () => {
    const text = value.trim();
    if (!text || busy || !ready) return;
    if (/^[\/!]/.test(text)) { setInputError(t("side.noCommands")); return; }
    setValue(""); setInputError(null); onSend(text);
  };
  return (
    <section ref={panelRef} className="absolute inset-0 z-50 flex flex-col bg-[var(--bg)]" aria-label={t("side.title")}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); if (busy) onStop(); else onClose(); }
        if (event.key === "Tab") {
          const items = panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), textarea, a[href], [tabindex="0"]');
          const first = items?.[0], last = items?.[items.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      }}>
      <header className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] bg-[var(--bg-panel)] px-4 py-3">
        <strong className="text-sm">{t("side.title")}</strong>
        <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] text-text-muted">{t("side.readOnly")}</span>
        <button className="ml-auto text-sm text-[var(--accent)]" onClick={onClose}>{t("side.return")}</button>
        {parentRunning && <span className="w-full text-xs text-[var(--warning)]">{t("side.parentRunning")}</span>}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto max-w-[820px]">
          {messages.filter(message => message.role !== "toolResult").map((message, index) => <MessageView key={index} message={message} cwd={cwd} toolResults={toolResults} />)}
          {busy && <div role="status" className="py-2 text-sm text-text-muted">{t("side.thinking")}</div>}
          {error && <div role="alert" className="my-2 text-sm text-[var(--danger)]">{error}</div>}
          <div ref={endRef} />
        </div>
      </div>
      <div className="border-t border-[var(--border)] bg-[var(--bg-panel)] p-3">
        {inputError && <div role="alert" className="mx-auto mb-2 max-w-[820px] text-sm text-[var(--danger)]">{inputError}</div>}
        <div className="mx-auto flex max-w-[820px] gap-2">
          <textarea autoFocus value={value} rows={2} className="min-w-0 flex-1 resize-none rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]" placeholder={t("side.placeholder")}
            onChange={event => setValue(event.target.value)}
            onPaste={event => { if (event.clipboardData.files.length) { event.preventDefault(); setInputError(t("side.noCommands")); } }}
            onKeyDown={event => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); submit(); }
            }} />
          {busy ? <button className="composer-stop-button" onClick={onStop}>{t("chat.stop")}</button> : <button className="native-primary-button px-4" onClick={submit} disabled={!value.trim() || !ready}>{t("chat.send")}</button>}
        </div>
      </div>
    </section>
  );
}
