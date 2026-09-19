"use client";

import { useEffect, useState } from "react";
import type { BranchInventory } from "./git-branch-types";
import { invalidateUiCache, uiFetch, UiFetchError } from "./web-ui-client";

// One poll per cwd, shared by every panel that wants git state, instead of one
// timer per component. Subscribers declare which routes they need so a panel
// that only wants the project root never puts `/api/git/branches` on a timer.
export type GitResource = "branches" | "worktrees";
export type GitInventory = { branches?: BranchInventory; projectRoot?: string; error?: string };

const POLL_MS = 10_000;
export const BRANCHES: readonly GitResource[] = ["branches"];
export const WORKTREES: readonly GitResource[] = ["worktrees"];

type Subscriber = { want: readonly GitResource[]; notify: (snapshot: GitInventory) => void };
type Feed = { subscribers: Map<object, Subscriber>; snapshot: GitInventory; timer: ReturnType<typeof setInterval> | null; startedAt: number; busy: boolean; gone: boolean };
const feeds = new Map<string, Feed>();

async function collect(next: GitInventory, feed: Feed, run: () => Promise<void>) {
  try { await run(); } catch (error) {
    next.error = error instanceof Error ? error.message : String(error);
    // 403/404 is the folder itself being gone or off-limits. The same answer
    // would come back every 10 s, so stop until something actually changes.
    if (error instanceof UiFetchError && (error.status === 403 || error.status === 404)) feed.gone = true;
  }
}

async function load(cwd: string, forced: boolean) {
  const feed = feeds.get(cwd);
  if (!feed || feed.busy) return;
  if (!forced && (document.hidden || feed.gone || Date.now() - feed.startedAt < POLL_MS - 500)) return;
  const want = new Set<GitResource>();
  for (const subscriber of feed.subscribers.values()) for (const resource of subscriber.want) want.add(resource);
  if (!want.size) return;
  feed.busy = true; feed.startedAt = Date.now();
  const next: GitInventory = { ...feed.snapshot, error: "" };
  const scope = `cwd=${encodeURIComponent(cwd)}`;
  // A forced refresh answers a git operation or a focus, so it must not be
  // served by the read cache no matter which listener cleared it first.
  if (forced) { invalidateUiCache("/api/git/branches"); invalidateUiCache("/api/worktrees"); }
  try {
    await Promise.all([
      want.has("branches") ? collect(next, feed, async () => { next.branches = await uiFetch<BranchInventory>(`/api/git/branches?${scope}`); }) : null,
      want.has("worktrees") ? collect(next, feed, async () => { next.projectRoot = (await uiFetch<{ projectRoot?: string }>(`/api/worktrees?${scope}`)).projectRoot; }) : null,
    ].filter(Boolean));
  } finally { feed.busy = false; }
  if (feeds.get(cwd) !== feed) return;
  feed.snapshot = next;
  for (const subscriber of feed.subscribers.values()) subscriber.notify(next);
}

/** A focus, a git operation or a tab coming back deserves a fresh answer even
 *  for a cwd that was previously gone — the folder may well be back. */
function refreshAll() { for (const cwd of [...feeds.keys()]) refreshGitInventory(cwd); }
const onVisible = () => { if (!document.hidden) refreshAll(); };
function bindWindow(active: boolean) {
  for (const [target, type, listener] of [[window, "focus", refreshAll], [window, "pi-git-changed", refreshAll], [document, "visibilitychange", onVisible]] as const) {
    if (active) target.addEventListener(type, listener); else target.removeEventListener(type, listener);
  }
}

export function refreshGitInventory(cwd: string) {
  const feed = feeds.get(cwd);
  if (!feed) return;
  feed.gone = false;
  void load(cwd, true);
}

export function subscribeGitInventory(cwd: string, want: readonly GitResource[], notify: (snapshot: GitInventory) => void): () => void {
  let feed = feeds.get(cwd);
  if (!feed) {
    feed = { subscribers: new Map(), snapshot: {}, timer: null, startedAt: 0, busy: false, gone: false };
    if (!feeds.size) bindWindow(true);
    feeds.set(cwd, feed);
    feed.timer = setInterval(() => void load(cwd, false), POLL_MS);
  }
  const owner = feed;
  const key = {};
  owner.subscribers.set(key, { want, notify });
  notify(owner.snapshot);
  void load(cwd, false);
  return () => {
    owner.subscribers.delete(key);
    if (owner.subscribers.size || feeds.get(cwd) !== owner) return;
    if (owner.timer) clearInterval(owner.timer);
    feeds.delete(cwd);
    if (!feeds.size) bindWindow(false);
  };
}

/** `want` must be referentially stable — use the exported BRANCHES/WORKTREES. */
export function useGitInventory(cwd: string | null, want: readonly GitResource[]): GitInventory {
  const [snapshot, setSnapshot] = useState<GitInventory>({});
  useEffect(() => {
    if (!cwd) { setSnapshot({}); return; }
    return subscribeGitInventory(cwd, want, setSnapshot);
  }, [cwd, want]);
  return snapshot;
}
