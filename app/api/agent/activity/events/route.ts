import { activitySnapshot, subscribeActivity } from "@/lib/activity";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = () => { if (!closed) { try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(activitySnapshot())}\n\n`)); } catch { cleanup(); } } };
      const unsubscribe = subscribeActivity(send);
      const timer = setInterval(() => { if (!closed) { try { controller.enqueue(encoder.encode(": heartbeat\n\n")); } catch { cleanup(); } } }, 15000);
      cleanup = () => { if (closed) return; closed = true; unsubscribe(); clearInterval(timer); req.signal.removeEventListener("abort", cleanup); try { controller.close(); } catch {} };
      req.signal.addEventListener("abort", cleanup);
      if (req.signal.aborted) cleanup(); else send();
    }, cancel() { cleanup(); },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", "Connection": "keep-alive" } });
}
