"use client";
import type { SessionStatsInfo } from "@/lib/pi-types";
import { useI18n } from "@/hooks/useI18n";
import { useModalDismiss } from "@/hooks/useModalDismiss";

export function ChatCommandDialog({ kind, choices, stats, onFork, onClose }: {
  kind: "fork" | "hotkeys" | "session";
  stats: SessionStatsInfo | null;
  choices: { id: string; text: string }[];
  onFork: (id: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const ref = useModalDismiss(onClose);
  return <div className="chat-command-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={ref} role="dialog" aria-modal="true" aria-label={t(kind === "fork" ? "chat.commandFork" : kind === "session" ? "chat.commandSession" : "chat.commandHotkeys")} className="native-popover chat-command-dialog">
      <header><strong>{t(kind === "fork" ? "chat.commandFork" : kind === "session" ? "chat.commandSession" : "chat.commandHotkeys")}</strong><button onClick={onClose} aria-label={t("chat.close")}>×</button></header>
      {kind === "fork" ? <>
        <p>{t("chat.forkChoose")}</p>
        <div className="chat-command-choices">{choices.map((choice, index) => <button key={choice.id} onClick={() => onFork(choice.id)}><span>{index + 1}.</span> {choice.text}</button>)}</div>
      </> : kind === "session" ? <dl className="chat-command-hotkeys">
        {[["chat.statsMessages", stats?.totalMessages], ["chat.statsTools", stats?.toolCalls], ["chat.statsTokens", stats?.tokens.total], ["chat.statsCost", stats ? `$${stats.cost.toFixed(4)}` : undefined]].map(([key, value]) => <div key={key}><dt>{t(String(key))}</dt><dd>{value ?? "—"}</dd></div>)}
      </dl> : <dl className="chat-command-hotkeys">
        {[["↑ / ↓", "chat.keysSelect"], ["Tab", "chat.keysComplete"], ["Enter", "chat.keysSubmit"], ["Shift + Enter", "chat.keysNewline"], ["Ctrl / ⌘ + Enter", "chat.keysSteer"], ["Escape", "chat.keysEscape"], ["Ctrl + Alt + N", "chat.commandNew"]].map(([key, label]) => <div key={key}><dt><kbd>{key}</kbd></dt><dd>{t(label)}</dd></div>)}
      </dl>}
    </section>
  </div>;
}
