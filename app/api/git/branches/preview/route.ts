import { NextResponse } from "next/server";
import { previewBranch } from "@/lib/git-branches";
import type { BranchOperation } from "@/lib/git-branch-types";
import { isCwdAllowed } from "@/lib/file-access";
import { uiBody, uiRouteError } from "@/lib/web-ui-route";
import { UiError } from "@/lib/web-ui-store";
export async function POST(req: Request) {
  try { const body = await uiBody(req); if (typeof body.cwd !== "string" || !await isCwdAllowed(body.cwd)) throw new UiError("Access denied", 403); return NextResponse.json(await previewBranch(body.cwd, body as unknown as BranchOperation)); } catch (e) { return uiRouteError(e); }
}
