"use client";

import { useCallback, useSyncExternalStore } from "react";
import { APP_PREF_KEYS, getPrefBool, setPrefBool } from "@/lib/app-prefs";

/**
 * Whether the "1,068 in · 221 out · $0.0221" line renders under each assistant
 * reply. Only that line is affected: the context ring, `/session` and codemode
 * cost stay available as the places to look the numbers up on demand.
 */
const DEFAULT = true;
const listeners = new Set<() => void>();

function readStored(): boolean {
  return getPrefBool(APP_PREF_KEYS.showMessageUsage, DEFAULT);
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getServerSnapshot(): boolean {
  return DEFAULT;
}

export function useShowMessageUsage(): {
  showUsage: boolean;
  setShowUsage: (next: boolean) => void;
} {
  const showUsage = useSyncExternalStore(subscribe, readStored, getServerSnapshot);

  const setShowUsage = useCallback((next: boolean) => {
    setPrefBool(APP_PREF_KEYS.showMessageUsage, next);
    listeners.forEach((cb) => cb());
  }, []);

  return { showUsage, setShowUsage };
}
