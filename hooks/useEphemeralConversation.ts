"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "./useI18n";
import type { AgentMessage } from "@/lib/types";
import { parseLocalChatCommand } from "@/lib/local-chat-command";

type Operation = { id: string; parentId: string; view: string; controller: AbortController };
type Side = { view: string; id: string; parentId: string; messages: AgentMessage[]; busy: boolean; error: string | null; snapshotAt?: string; ready: boolean };
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
  const [side, setSide] = useState<Side | null>(null);
  const [recap, setRecap] = useState<Recap | null>(null);
  const [recapBusy, setRecapBusy] = useState(false);
  const [recapError, setRecapError] = useState<{ view: string; message: string } | null>(null);
  const sideRef = useRef<Operation | null>(null);
  const recapRef = useRef<Operation | null>(null);
  const view = `${parentId ?? ""}:${cwd ?? ""}`;
  const viewRef = useRef(view); viewRef.current = view;
  const release = useCallback((operation: Operation | null) => {
    if (!operation) return;
    operation.controller.abort();
    void fetch(`/api/ephemeral/${operation.id}?ownerId=${ownerId}`, { method: "DELETE", keepalive: true }).catch(() => {});
  }, [ownerId]);
  const closeSide = useCallback(() => {
    const operation = sideRef.current; sideRef.current = null;
    release(operation); setSide(null);
  }, [release]);
  const cancelRecap = useCallback(() => {
    const operation = recapRef.current; recapRef.current = null;
    release(operation); setRecapBusy(false);
  }, [release]);
  useEffect(() => {
    setSide(null); setRecap(null); setRecapBusy(false); setRecapError(null);
    const cleanup = () => {
      release(sideRef.current); sideRef.current = null;
      release(recapRef.current); recapRef.current = null;
    };
    const pagehide = () => { cleanup(); setSide(null); setRecap(null); setRecapBusy(false); setRecapError(null); };
    window.addEventListener("pagehide", pagehide);
    return () => { window.removeEventListener("pagehide", pagehide); cleanup(); };
  }, [view, release]);

  const current = (operation: Operation, ref: typeof sideRef) => ref.current === operation && viewRef.current === operation.view && !operation.controller.signal.aborted;
  const send = useCallback(async (operation: Operation, message: string) => {
    try {
      const data = await api<{ messages: AgentMessage[]; parentId: string }>(`/api/ephemeral/${operation.id}`, { ownerId, message }, operation.controller.signal);
      if (current(operation, sideRef) && data.parentId === operation.parentId) setSide(previous => previous?.id === operation.id ? { ...previous, messages: data.messages, busy: false } : previous);
    } catch (error) {
      if (current(operation, sideRef)) setSide(previous => previous?.id === operation.id ? { ...previous, busy: false, ready: false, error: String(error instanceof Error ? error.message : error) } : previous);
    }
  }, [ownerId]);
  const sendSide = useCallback((message: string) => {
    const operation = sideRef.current;
    if (!operation || !side?.ready || side.busy) return;
    setSide(previous => previous ? { ...previous, busy: true, error: null, messages: [...previous.messages, { role: "user", content: message, timestamp: Date.now() }] } : previous);
    void send(operation, message);
  }, [side, send]);

  useEffect(() => {
    if (!side?.ready) return;
    const id = side.id;
    // Brief reconnects are harmless; an abandoned page expires after five minutes.
    const timer = setInterval(() => {
      void fetch(`/api/ephemeral/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ownerId }) })
        .then(response => {
          if (response.status === 409) setSide(previous => previous?.id === id ? { ...previous, ready: false, busy: false, error: t("side.expired") } : previous);
        }).catch(() => {});
    }, 30_000);
    return () => clearInterval(timer);
  }, [side?.id, side?.ready, ownerId, t]);

  const handleLocalCommand = useCallback(async (text: string) => {
    const command = parseLocalChatCommand(text.trim());
    if (!command) return { handled: false };
    if (!parentId) return { handled: true, error: t("side.needsSession") };
    if (command.kind === "side" && !command.question) return { handled: true, error: t("side.usage") };
    if (command.kind === "recap" && command.question) return { handled: true, error: t("recap.usage") };
    if (command.kind === "side" && sideRef.current) return { handled: true, error: t("side.alreadyOpen") };
    if (command.kind === "recap" && recapRef.current) return { handled: true, error: t("recap.busy") };
    const operation: Operation = { id: crypto.randomUUID(), parentId, view, controller: new AbortController() };
    const body = { id: operation.id, ownerId, parentId, leafId, kind: command.kind };
    if (command.kind === "side") {
      sideRef.current = operation;
      setSide({ view, id: operation.id, parentId, busy: true, ready: false, error: null, messages: [{ role: "user", content: command.question, timestamp: Date.now() }] });
      void (async () => {
        try {
          const data = await api<{ id: string; snapshotAt: string }>("/api/ephemeral", body, operation.controller.signal);
          if (!current(operation, sideRef)) { release(operation); return; }
          setSide(previous => previous?.id === operation.id ? { ...previous, snapshotAt: data.snapshotAt, ready: true } : previous);
          await send(operation, command.question);
        } catch (error) {
          if (current(operation, sideRef)) setSide(previous => previous?.id === operation.id ? { ...previous, busy: false, error: error instanceof Error ? error.message : String(error) } : previous);
          release(operation);
        }
      })();
    } else {
      recapRef.current = operation; setRecapBusy(true); setRecapError(null);
      void (async () => {
        try {
          const data = await api<{ answer: string; snapshotAt: string; parentId: string }>("/api/ephemeral", body, operation.controller.signal);
          if (current(operation, recapRef) && data.parentId === parentId) setRecap({ view, parentId, text: data.answer, snapshotAt: data.snapshotAt, generatedAt: new Date().toISOString() });
        } catch (error) {
          if (current(operation, recapRef)) setRecapError({ view, message: error instanceof Error ? error.message : String(error) });
        } finally {
          if (current(operation, recapRef)) { recapRef.current = null; setRecapBusy(false); }
          release(operation);
        }
      })();
    }
    // Accept immediately: later completion never owns the main composer's draft.
    return { handled: true };
  }, [parentId, ownerId, leafId, view, send, release, t]);

  return { side: side?.view === view ? side : null, recap: recap?.view === view ? recap : null, recapBusy: recapRef.current?.view === view && recapBusy, recapError: recapError?.view === view ? recapError.message : null, handleLocalCommand, sendSide, closeSide, cancelRecap };
}
