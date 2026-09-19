import { NextResponse } from "next/server";
import { searchTranscripts, validateTranscriptResult } from "@/lib/transcript-search";
import { uiRouteError } from "@/lib/web-ui-route";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const p = new URL(request.url).searchParams;
    const result = p.has("entryId")
      ? await validateTranscriptResult(p.get("session") ?? "", p.get("entryId") ?? "", p.get("field") ?? "", p.get("q") ?? "")
      : await searchTranscripts(p.get("q") ?? "", p.get("project"), p.get("session"), p.get("cursor"), request.signal);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return uiRouteError(e); }
}
