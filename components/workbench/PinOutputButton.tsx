"use client";
import { useI18n } from "@/hooks/useI18n";
export function PinOutputButton({ path }: { path: string }) {
  const { t } = useI18n();
  return <button className="pin-output-link" title={t("wb.pinOutputs")} aria-label={t("wb.pinOutputs")} onClick={() => window.dispatchEvent(new CustomEvent("pi-pin-output", { detail: { path } }))}>☆</button>;
}
