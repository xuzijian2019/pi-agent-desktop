import { NextResponse } from "next/server";
import { listOutputs, changeOutput } from "@/lib/session-outputs";
import { uiBody, uiRouteError } from "@/lib/web-ui-route";
type Context = { params: Promise<{ id: string }> };
export async function GET(req: Request, ctx: Context) {
  try { const query = new URL(req.url).searchParams; const items = await listOutputs((await ctx.params).id, query.get("leafId")); const offset = Math.max(0, Number(query.get("offset")) || 0); return NextResponse.json({ items: items.slice(offset, offset + 50), total: items.length }); } catch (e) { return uiRouteError(e); }
}
export async function POST(req: Request, ctx: Context) {
  try { return NextResponse.json(await changeOutput((await ctx.params).id, await uiBody(req))); } catch (e) { return uiRouteError(e); }
}
export const PATCH = POST;
export async function DELETE(req: Request, ctx: Context) {
  try { return NextResponse.json(await changeOutput((await ctx.params).id, await uiBody(req), true)); } catch (e) { return uiRouteError(e); }
}
