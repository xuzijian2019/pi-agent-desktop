"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/hooks/useI18n";
import { placeAboveComposer, type PopoverPlacement } from "@/lib/composer-popover";
import type { ContextUsage, SessionStatsInfo } from "@/lib/pi-types";

const RING_SIZE = 14;
const RING_STROKE = 2;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const CTX_DANGER_PCT = 90;

interface ContextUsageRingProps {
  contextUsage?: ContextUsage | null;
  sessionStats?: SessionStatsInfo | null;
}

/** Visible context fullness, with session telemetry available on click instead of hover. */
export function ContextUsageRing({ contextUsage, sessionStats }: ContextUsageRingProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<PopoverPlacement>();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const usage = contextUsage ?? sessionStats?.contextUsage;
  const percent = usage?.percent ?? null;
  const pct = percent !== null ? Math.max(0, Math.min(100, percent)) : 0;
  const color = percent === null ? "var(--text-dim)" : pct >= CTX_DANGER_PCT ? "var(--danger)" : "var(--accent)";
  const filled = RING_CIRCUMFERENCE * (pct / 100);
  const percentage = percent === null ? "—" : `${percent.toFixed(1)}%`;
  const hasData = usage != null || sessionStats != null;
  const format = (value: number | null | undefined) => value == null ? "—" : value.toLocaleString();

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const trigger = triggerRef.current?.getBoundingClientRect();
      if (!trigger) return;
      const composer = triggerRef.current?.closest(".chat-composer")?.getBoundingClientRect();
      setPosition(placeAboveComposer({ left: trigger.left, top: composer?.top ?? trigger.top }, composer, { width: window.innerWidth, height: window.innerHeight }, 300));
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!triggerRef.current?.contains(event.target as Node) && !panelRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    const blur = (event: FocusEvent) => {
      if (!triggerRef.current?.contains(event.target as Node) && !panelRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape, true);
    document.addEventListener("focusin", blur);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape, true);
      document.removeEventListener("focusin", blur);
    };
  }, [open]);

  const isPositioned = position !== undefined;
  useEffect(() => {
    if (open && isPositioned) closeRef.current?.focus();
  }, [open, isPositioned]);

  const tokens = sessionStats?.tokens;
  const rows: [string, string][] = [
    [t("chat.statsInput"), format(tokens?.input)],
    [t("chat.statsOutput"), format(tokens?.output)],
    [t("chat.statsCacheRead"), format(tokens?.cacheRead)],
    [t("chat.statsCacheWrite"), format(tokens?.cacheWrite)],
    [t("chat.statsTokens"), format(tokens?.total)],
    [t("chat.statsCost"), sessionStats?.cost == null ? "—" : `$${sessionStats.cost.toFixed(4)}`],
    [t("chat.statsMessages"), format(sessionStats?.totalMessages)],
    [t("chat.statsTools"), format(sessionStats?.toolCalls)],
  ];

  return <>
    <button
      ref={triggerRef}
      type="button"
      aria-label={`${t("chat.ctxUsage")}: ${percentage}`}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls={open ? panelId : undefined}
      disabled={!hasData}
      onClick={() => setOpen(value => !value)}
      className={`context-usage-ring${hasData ? "" : " is-dim"}`}
    >
      <svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} aria-hidden="true">
        <circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS} fill="none" stroke="var(--border)" strokeWidth={RING_STROKE} />
        <circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS} fill="none" stroke={color} strokeWidth={RING_STROKE}
          strokeDasharray={`${filled} ${RING_CIRCUMFERENCE - filled}`} strokeLinecap="round"
          transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`} opacity={percent === null ? 0.35 : 1} />
      </svg>
      <span className="context-usage-percent" style={{ color }}>{percentage}</span>
    </button>
    {open && position && createPortal(
      <div ref={panelRef} id={panelId} role="dialog" aria-label={t("chat.sessionUsage")} className="context-usage-popover native-popover" style={position}>
        <header><strong>{t("chat.sessionUsage")}</strong><button ref={closeRef} type="button" aria-label={t("chat.close")} onClick={() => { setOpen(false); triggerRef.current?.focus(); }}>×</button></header>
        <div className="context-usage-summary">
          <span>{t("chat.ctxUsage")}</span><strong style={{ color }}>{percentage}</strong>
          <small>{format(usage?.tokens)} / {format(usage?.contextWindow)} {t("chat.usageTokens")}</small>
        </div>
        <dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      </div>, document.body,
    )}
  </>;
}
