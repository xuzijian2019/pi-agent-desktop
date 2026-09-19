import { NextResponse } from "next/server";
import { createEphemeral, runRecap, validEphemeralToken } from "@/lib/ephemeral-session";
import { hasJsonContentType, isApiRequestAllowed } from "@/lib/request-security";

export async function POST(request: Request) {
  if (!isApiRequestAllowed(request) || !hasJsonContentType(request)) return NextResponse.json({ error: "Request not allowed" }, { status: 403 });
  try {
    const body = await request.json() as { id?: string; parentId?: string; ownerId?: string; leafId?: string; kind?: string };
    if (!body || Object.keys(body).some(key => !["id", "parentId", "ownerId", "leafId", "kind"].includes(key)) || !validEphemeralToken(body.parentId) || !validEphemeralToken(body.ownerId) || (body.id !== undefined && !validEphemeralToken(body.id)) || (body.leafId !== undefined && !validEphemeralToken(body.leafId)) || (body.kind !== "side" && body.kind !== "recap")) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    const input = { id: body.id, parentId: body.parentId, ownerId: body.ownerId, ...(body.leafId ? { leafId: body.leafId } : {}), signal: request.signal };
    const data = body.kind === "recap" ? await runRecap(input) : await createEphemeral({ ...input, kind: "side" });
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: /not found|no context|no complete/i.test(message) ? 404 : 409 });
  }
}
