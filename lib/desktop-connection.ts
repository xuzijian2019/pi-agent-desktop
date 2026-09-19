"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { isTauriDesktop } from "@/lib/desktop-updater";
import { relaunchAppNative } from "@/lib/desktop-native";

export type DesktopConnectionState = "online" | "offline" | "checking";

const PING_INTERVAL_MS = 8_000;
// The browser build has no relaunch to offer and no packaged server to babysit,
// so a healthy tab idles an order of magnitude slower than the desktop shell —
// this probe was the single largest source of idle `/api/` traffic. It cannot
// be switched off entirely: outside Tauri the banner is still the only way a
// tab learns its server died (tests/e2e/server-recovery.spec.ts). A suspected
// outage is confirmed on the short interval in either build, so detection and
// recovery stay as fast as they were.
const WEB_PING_INTERVAL_MS = 20_000;
const RECHECK_INTERVAL_MS = 2_000;
const OFFLINE_THRESHOLD = 2;

/**
 * Lightweight local-server health probe. Used to surface a reconnect banner
 * when the packaged Next server or SSE streams drop.
 */
export function useDesktopConnection(enabled = true): {
  state: DesktopConnectionState;
  retry: () => void;
} {
  const [state, setState] = useState<DesktopConnectionState>(enabled ? "checking" : "online");
  const failuresRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const probeControllerRef = useRef<AbortController | null>(null);
  const stoppedRef = useRef(false);

  const probe = useCallback(async (): Promise<boolean | null> => {
    if (!enabled || stoppedRef.current) return null;

    // Wake/online/timer events can arrive together after sleep. Only the most
    // recent probe may change connection state; otherwise a stale timeout can
    // overwrite a newer successful response and leave the banner stuck.
    probeControllerRef.current?.abort();
    const controller = new AbortController();
    probeControllerRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 4_000);
    try {
      const res = await fetch(`/api/home?_=${Date.now()}`, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (stoppedRef.current || probeControllerRef.current !== controller) return null;
      failuresRef.current = 0;
      setState("online");
      return true;
    } catch {
      if (stoppedRef.current || probeControllerRef.current !== controller) return null;
      failuresRef.current += 1;
      if (failuresRef.current >= OFFLINE_THRESHOLD) {
        setState("offline");
      } else {
        setState((prev) => (prev === "offline" ? "offline" : "checking"));
      }
      return false;
    } finally {
      window.clearTimeout(timeout);
      if (probeControllerRef.current === controller) {
        probeControllerRef.current = null;
      }
    }
  }, [enabled]);

  // A probe that is still in flight at unmount resolves after cleanup ran, so
  // it would queue a timer nobody owns and keep pinging forever.
  const schedule = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!enabled || stoppedRef.current) return;
    const healthy = failuresRef.current === 0;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void probe().finally(() => schedule());
    }, healthy ? (isTauriDesktop() ? PING_INTERVAL_MS : WEB_PING_INTERVAL_MS) : failuresRef.current < OFFLINE_THRESHOLD ? RECHECK_INTERVAL_MS : PING_INTERVAL_MS);
  }, [enabled, probe]);

  const retry = useCallback(() => {
    if (!enabled) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setState("checking");
    failuresRef.current = 0;
    void probe().then(async (reachable) => {
      if (stoppedRef.current || reachable === null) return;
      if (reachable) {
        if (isTauriDesktop()) {
          window.location.reload();
        } else {
          // Existing HTTP/SSE owners reconcile on online. Keep the editor
          // mounted, including any input whose local storage write failed.
          window.dispatchEvent(new Event("online"));
        }
        return;
      }

      if (!isTauriDesktop()) {
        setState("offline");
        schedule();
        return;
      }
      try {
        // Tauri IPC remains available even when the localhost server is not.
        // Relaunching recreates both the WebView and packaged Node server.
        await relaunchAppNative();
      } catch {
        if (!stoppedRef.current) {
          setState("offline");
          schedule();
        }
      }
    });
  }, [enabled, probe, schedule]);

  const checkNow = useCallback(() => {
    if (!enabled) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    void probe().finally(() => schedule());
  }, [enabled, probe, schedule]);

  useEffect(() => {
    if (!enabled) {
      stoppedRef.current = true;
      return;
    }
    stoppedRef.current = false;
    checkNow();

    const onVisible = () => {
      if (document.visibilityState === "visible") checkNow();
    };
    const onOnline = () => checkNow();

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      stoppedRef.current = true;
      probeControllerRef.current?.abort();
      probeControllerRef.current = null;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [checkNow, enabled]);

  return { state: enabled ? state : "online", retry };
}
