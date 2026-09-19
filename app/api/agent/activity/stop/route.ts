import { NextResponse } from "next/server";
import { getRpcSession } from "@/lib/rpc-manager";
import { uiBody, uiRouteError } from "@/lib/web-ui-route";
import { UiError } from "@/lib/web-ui-store";
import { withCheckoutGuard } from "@/lib/checkout-guard";
export async function POST(req: Request) {
  try {
    const body = await uiBody(req);
    const session = typeof body.sessionId === "string" ? getRpcSession(body.sessionId) : null;
    if (!session) throw new UiError("Run is no longer active", 409);
    return await withCheckoutGuard(session.cwd, async () => {
      if (!session.isRunning() || session.runId !== body.runId) throw new UiError("Run changed. Refresh activity.", 409);
      await session.send({ type: session.inner.isBashRunning ? "abort_bash" : "abort" });
      return NextResponse.json({ success: true });
    });
  } catch (e) { return uiRouteError(e); }
}
