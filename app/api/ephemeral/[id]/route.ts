import { NextResponse } from "next/server";
import { closeEphemeral, validEphemeralToken } from "@/lib/ephemeral-session";
import { isApiRequestAllowed } from "@/lib/request-security";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isApiRequestAllowed(request)) return NextResponse.json({ error: "Request not allowed" }, { status: 403 });
  const ownerId = new URL(request.url).searchParams.get("ownerId");
  if (!validEphemeralToken(ownerId)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { id } = await params;
  await closeEphemeral(id, ownerId);
  return NextResponse.json({ success: true });
}
