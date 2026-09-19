import { NextResponse } from "next/server";
import { listSavedTasks, saveTask, taskProject } from "@/lib/saved-tasks";
import { uiBody, uiRouteError } from "@/lib/web-ui-route";
export async function GET(req: Request) {
  try { const projectRoot = await taskProject(new URL(req.url).searchParams.get("cwd")); return NextResponse.json({ tasks: listSavedTasks(projectRoot), projectRoot }); }
  catch (e) { return uiRouteError(e); }
}
export async function POST(req: Request) {
  try { return NextResponse.json(await saveTask(await uiBody(req))); } catch (e) { return uiRouteError(e); }
}
