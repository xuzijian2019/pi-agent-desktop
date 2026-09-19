"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { useI18n } from "@/hooks/useI18n";

export function PanelActions({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) ref.current.open = false; };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);
  return <details ref={ref} className="workbench-overflow" onKeyDown={event => {
    if (event.key === "Escape" && ref.current?.open) {
      event.preventDefault(); event.stopPropagation(); ref.current.open = false;
      ref.current.querySelector("summary")?.focus();
    }
  }}><summary aria-label={t("wb.actions")}>···</summary><div>{children}</div></details>;
}
