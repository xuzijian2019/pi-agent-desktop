import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { buildSessionContext, resolveSessionPath } from "@/lib/session-reader";
import { openSessionManagerForRead } from "@/lib/session-manager-access";
import { formatSessionReference } from "@/lib/session-reference";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const filePath = await resolveSessionPath(id);
    if (!filePath) return NextResponse.json({ error: "Session not found" }, { status: 404 });

    const sm = openSessionManagerForRead(id, filePath);
    if (!sm) return NextResponse.json({ error: "Session not found" }, { status: 404 });

    const entries = sm.getEntries();
    const parents = new Set(entries.map(entry => entry.parentId));
    const leaves = entries.filter(entry => !parents.has(entry.id)).map(entry => ({ id: entry.id, label: `${entry.timestamp} · ${entry.id}` }));
    const query = new URL(req.url).searchParams;
    const leafId = query.get("leafId") || sm.getLeafId();
    if (leafId && !sm.getEntries().some(e => e.id === leafId)) return NextResponse.json({ error: "Invalid leaf" }, { status: 400 });
    const context = buildSessionContext(sm.getEntries() as never, leafId, {
      deferThinking: false,
      deferToolResultImages: true,
    });
    const first = query.get("firstEntryId"); const last = query.get("lastEntryId");
    const start = first ? context.entryIds.indexOf(first) : 0;
    const end = last ? context.entryIds.indexOf(last) : context.messages.length - 1;
    if ((first && start < 0) || (last && end < 0) || (context.messages.length && start > end)) return NextResponse.json({ error: "Invalid message range" }, { status: 400 });
    const reference = formatSessionReference(id, sm.getSessionName(), context.messages.slice(start, end + 1));
    return NextResponse.json({ reference, leafId, leaves, revision: createHash("sha256").update(reference).digest("hex"), truncated: reference.includes("[referenced session truncated]"), entries: context.entryIds.map((entryId, index) => ({ id: entryId, label: `${index + 1}. ${context.messages[index].role}` })) });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

