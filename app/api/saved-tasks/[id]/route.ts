import { NextResponse } from "next/server";
import { saveTask, deleteTask } from "@/lib/saved-tasks";
import { uiBody, uiRouteError } from "@/lib/web-ui-route";
type Context = { params: Promise<{ id: string }> };
export async function PATCH(req: Request, ctx: Context) {
  try { return NextResponse.json(await saveTask(await uiBody(req), (await ctx.params).id)); } catch (e) { return uiRouteError(e); }
}
export async function DELETE(req: Request, ctx: Context) {
  try { return NextResponse.json(await deleteTask((await ctx.params).id, (await uiBody(req)).revision)); } catch (e) { return uiRouteError(e); }
}
