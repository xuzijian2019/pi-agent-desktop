import { registerEventStreamCloser } from "@/lib/agent-event-stream";
import { getSessionListVersion } from "@/lib/session-reader";
import { getCompletionNotificationSuppressedRpcSessionIds, getRunningRpcSessionIds, getRpcSessionRunIds, subscribeRunningSessions } from "@/lib/rpc-manager";

export const dynamic = "force-dynamic";

// GET /api/agent/running/events - SSE stream of the set of currently-running
// session ids. Pushes an update whenever any session starts or stops working,
// so the sidebar never has to poll.
export async function GET(req: Request) {
  let dispose = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let closed = false;
      let unsubscribe = () => {};
      let unregisterClose = () => {};
      let heartbeat: ReturnType<typeof setInterval> | null = null;
      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe();
        unregisterClose();
        req.signal?.removeEventListener("abort", cleanup);
        try { controller.close(); } catch { /* already closed/cancelled */ }
      };
      dispose = cleanup;
      unregisterClose = registerEventStreamCloser(cleanup);
      req.signal?.addEventListener("abort", cleanup);
      const encode = (data: unknown) => {
        if (closed) return false;
        const text = `data: ${JSON.stringify(data)}\n\n`;
        try {
          controller.enqueue(encoder.encode(text));
          return true;
        } catch {
          cleanup();
          return false;
        }
      };

      const snapshot = (ids = getRunningRpcSessionIds()) => ({
        type: "running", runningSessionIds: ids, runIds: getRpcSessionRunIds(),
        sessionListVersion: getSessionListVersion(),
        completionNotificationSuppressedSessionIds: getCompletionNotificationSuppressedRpcSessionIds(),
      });

      // Subscribe BEFORE taking the initial snapshot so no state change can slip
      // through the gap between snapshot and subscription. Every frame carries
      // the session-list version: renames/deletes/creates in other windows bump
      // it, letting connected sidebars refetch without waiting for focus.
      const nextUnsubscribe = subscribeRunningSessions((ids) => {
        encode(snapshot(ids));
      });
      if (closed) nextUnsubscribe();
      else unsubscribe = nextUnsubscribe;

      // Initial snapshot so the client renders the correct state immediately.
      // (A duplicate frame here is harmless: the client just sets the same set.)
      encode(snapshot());

      // Heartbeat to keep the connection alive through proxies/timeouts.
      if (!closed) heartbeat = setInterval(() => {
        if (closed) return;
        try { encode(snapshot()); }
        catch { cleanup(); }
      }, 30_000);

    },
    cancel() {
      dispose();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
