"use client";

// Fork-owned: pi's "Summarize branch?" for in-session branch switches. Kept out of
// hooks/useAgentSession.ts (upstream-owned) so upstream merges stay clean; the
// hook only consumes it (see components/fork-extractions.test.mjs).

import { useCallback, useRef, useState, type MutableRefObject } from "react";
import { sendAgentCommand } from "@/lib/agent-client";
import type { TranslationParams } from "@/lib/i18n/types";

// The hook stays mounted across session switches, so a summarized branch switch
// still running for the previous session must not hold sends or switches in the next.
export function branchSummaryHolds(pendingSessionId: string | null, sessionId: string | null): boolean {
  return pendingSessionId !== null && pendingSessionId === sessionId;
}

interface UseBranchSummaryOptions {
  /** The session the view shows now (`session?.id`). */
  sessionId: string | null;
  sessionIdRef: MutableRefObject<string | null>;
  sessionGenerationRef: MutableRefObject<number>;
  loadSession: (sid: string) => Promise<unknown>;
  addNotice: (notice: { message: string; type?: "info" | "error" }) => void;
  t: (key: string, params?: TranslationParams) => string;
}

export function useBranchSummary({ sessionId, sessionIdRef, sessionGenerationRef, loadSession, addNotice, t }: UseBranchSummaryOptions) {
  // The session whose branch summary is being generated: a summarized switch is one
  // blocking navigate_tree request that can take as long as an LLM call.
  const [branchSummarySessionId, setBranchSummarySessionId] = useState<string | null>(null);
  const branchSummarySessionIdRef = useRef<string | null>(null);
  const summaryRequestIdRef = useRef(0);
  const summaryGenerationRef = useRef(sessionGenerationRef.current);
  // The host stays mounted across switches. Retire both the lock and the pending
  // request when its conversation changes, including an A -> B -> A round trip.
  if (summaryGenerationRef.current !== sessionGenerationRef.current) {
    summaryGenerationRef.current = sessionGenerationRef.current;
    summaryRequestIdRef.current += 1;
    branchSummarySessionIdRef.current = null;
    setBranchSummarySessionId(null);
  }

  // A summarized switch cannot switch the view first: pi writes the summary as the new
  // leaf, so the transcript to show only exists once the request returns.
  const summarizeAndNavigate = useCallback(async (leafId: string, customInstructions?: string) => {
    const sid = sessionIdRef.current;
    if (!sid || branchSummaryHolds(branchSummarySessionIdRef.current, sid)) return;
    const generation = sessionGenerationRef.current;
    const requestId = ++summaryRequestIdRef.current;
    const isCurrent = () => sessionIdRef.current === sid
      && sessionGenerationRef.current === generation
      && summaryRequestIdRef.current === requestId;
    branchSummarySessionIdRef.current = sid;
    setBranchSummarySessionId(sid);
    try {
      const result = await sendAgentCommand<{ cancelled?: boolean; aborted?: boolean }>(sid, {
        type: "navigate_tree",
        targetId: leafId,
        summarize: true,
        ...(customInstructions ? { customInstructions } : {}),
      });
      if (!isCurrent()) return;
      if (result?.aborted) {
        addNotice({ type: "info", message: t("chat.branchSummaryStopped") });
      } else if (result?.cancelled) {
        addNotice({ type: "info", message: t("chat.branchSwitchCancelled") });
      } else {
        await loadSession(sid);
      }
    } catch (e) {
      if (isCurrent()) {
        addNotice({ type: "error", message: t("chat.branchSummaryFailed", { error: e instanceof Error ? e.message : String(e) }) });
      }
    } finally {
      if (isCurrent()) {
        branchSummarySessionIdRef.current = null;
        setBranchSummarySessionId(null);
      }
    }
  }, [addNotice, loadSession, sessionGenerationRef, sessionIdRef, t]);

  const handleAbortBranchSummary = useCallback(() => {
    const sid = branchSummarySessionIdRef.current;
    if (!sid) return;
    sendAgentCommand(sid, { type: "abort_branch_summary" }).catch((e) => {
      console.error("Failed to stop the branch summary:", e);
    });
  }, []);

  const branchSummaryPending = branchSummaryHolds(branchSummarySessionId, sessionId);

  return { branchSummarySessionIdRef, branchSummaryPending, summarizeAndNavigate, handleAbortBranchSummary };
}
