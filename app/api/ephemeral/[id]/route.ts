import { NextResponse } from "next/server";
import { closeEphemeral, promptSideEphemeral, heartbeatEphemeral, validEphemeralToken } from "@/lib/ephemeral-session";
import { hasJsonContentType, isApiRequestAllowed } from "@/lib/request-security";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isApiRequestAllowed(request) || !hasJsonContentType(request)) return NextResponse.json({ error: "Request not allowed" }, { status: 403 });
  try {
    const { id } = await params;
    const body = await request.json() as { ownerId?: string; message?: string };
    if (!body || Object.keys(body).some(key => !["ownerId", "message"].includes(key)) || !validEphemeralToken(body.ownerId) || typeof body.message !== "string" || body.message.length > 100_000) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    const data = await promptSideEphemeral(id, body.ownerId, body.message, request.signal);
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 409 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isApiRequestAllowed(request)) return NextResponse.json({ error: "Request not allowed" }, { status: 403 });
  const ownerId = new URL(request.url).searchParams.get("ownerId");
  if (!validEphemeralToken(ownerId)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { id } = await params;
  await closeEphemeral(id, ownerId);
  return NextResponse.json({ success: true });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isApiRequestAllowed(request) || !hasJsonContentType(request)) return NextResponse.json({ error: "Request not allowed" }, { status: 403 });
  try {
    const body = await request.json();
    if (!body || Object.keys(body).some(key => key !== "ownerId") || !validEphemeralToken(body.ownerId)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    heartbeatEphemeral((await params).id, body.ownerId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 409 });
  }
}
