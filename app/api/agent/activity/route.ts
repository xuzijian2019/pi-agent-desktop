import { NextResponse } from "next/server";
import { activitySnapshot } from "@/lib/activity";
import { checkoutRoot } from "@/lib/checkout-guard";
import { resolveProject } from "@/lib/worktree";
export const dynamic = "force-dynamic";
export async function GET() {
  const snapshot = activitySnapshot();
  const cwds = [...new Set(snapshot.runs.map(r => r.cwd))];
  const projects = new Map(await Promise.all(cwds.map(async cwd => [cwd, { ...await resolveProject(cwd), checkout: await checkoutRoot(cwd) }] as const)));
  return NextResponse.json({ ...snapshot, runs: snapshot.runs.map(r => ({ ...r, projectRoot: projects.get(r.cwd)?.projectRoot, branch: projects.get(r.cwd)?.branch, checkout: projects.get(r.cwd)?.checkout })) }, { headers: { "Cache-Control": "no-store" } });
}
