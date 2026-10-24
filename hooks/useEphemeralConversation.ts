"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "./useI18n";
import { parseLocalChatCommand } from "@/lib/local-chat-command";

type Operation = { id: string; parentId: string; view: string; controller: AbortController };
type Recap = { view: string; parentId: string; text: string; snapshotAt: string; generatedAt: string };
async function api<T>(url: string, body: unknown, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  const payload = await response.json();
  if (!response.ok || !payload.data) throw new Error(payload.error || "Temporary conversation failed");
  return payload.data;
}

export function useEphemeralConversation(parentId: string | null, cwd: string | undefined, leafId?: string) {
  const { t } = useI18n();
  const [ownerId] = useState(() => crypto.randomUUID());
  const [recap, setRecap] = useState<Recap | null>(null);
  const [recapBusy, setRecapBusy] = useState(false);
  const [recapError, setRecapError] = useState<{ view: string; message: string } | null>(null);
  const recapRef = useRef<Operation | null>(null);
  const view = `${parentId ?? ""}:${cwd ?? ""}`;
  const viewRef = useRef(view); viewRef.current = view;
  const release = useCallback((operation: Operation | null) => {
    if (!operation) return;
    operation.controller.abort();
    void fetch(`/api/ephemeral/${operation.id}?ownerId=${ownerId}`, { method: "DELETE", keepalive: true }).catch(() => {});
  }, [ownerId]);
  const cancelRecap = useCallback(() => {
    const operation = recapRef.current; recapRef.current = null;
    release(operation); setRecapBusy(false);
  }, [release]);
  useEffect(() => {
    setRecap(null); setRecapBusy(false); setRecapError(null);
    const cleanup = () => {
      release(recapRef.current); recapRef.current = null;
    };
    const pagehide = () => { cleanup(); setRecap(null); setRecapBusy(false); setRecapError(null); };
    window.addEventListener("pagehide", pagehide);
    return () => { window.removeEventListener("pagehide", pagehide); cleanup(); };
  }, [view, release]);

  const current = (operation: Operation) => recapRef.current === operation && viewRef.current === operation.view && !operation.controller.signal.aborted;
  const handleLocalCommand = useCallback(async (text: string) => {
    const command = parseLocalChatCommand(text.trim());
    if (!command) return { handled: false };
    if (!parentId) return { handled: true, error: t("recap.needsSession") };
    if (command.question) return { handled: true, error: t("recap.usage") };
    if (recapRef.current) return { handled: true, error: t("recap.busy") };
    const operation: Operation = { id: crypto.randomUUID(), parentId, view, controller: new AbortController() };
    const body = { id: operation.id, ownerId, parentId, leafId, kind: command.kind };
    recapRef.current = operation; setRecapBusy(true); setRecapError(null);
    void (async () => {
      try {
        const data = await api<{ answer: string; snapshotAt: string; parentId: string }>("/api/ephemeral", body, operation.controller.signal);
        if (current(operation) && data.parentId === parentId) setRecap({ view, parentId, text: data.answer, snapshotAt: data.snapshotAt, generatedAt: new Date().toISOString() });
      } catch (error) {
        if (current(operation)) setRecapError({ view, message: error instanceof Error ? error.message : String(error) });
      } finally {
        if (current(operation)) { recapRef.current = null; setRecapBusy(false); }
        release(operation);
      }
    })();
    // Accept immediately: later completion never owns the main composer's draft.
    return { handled: true };
  }, [parentId, ownerId, leafId, view, release, t]);

  return { recap: recap?.view === view ? recap : null, recapBusy: recapRef.current?.view === view && recapBusy, recapError: recapError?.view === view ? recapError.message : null, handleLocalCommand, cancelRecap };
}
