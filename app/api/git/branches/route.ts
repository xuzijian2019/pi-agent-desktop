import { NextResponse } from "next/server";
import { branchInventory, executeBranch } from "@/lib/git-branches";
import { hasBusyCheckout } from "@/lib/rpc-manager";
import { isCwdAllowed } from "@/lib/file-access";
import { uiBody, uiRouteError } from "@/lib/web-ui-route";
import { UiError } from "@/lib/web-ui-store";
export async function GET(req: Request) {
  try { const cwd = new URL(req.url).searchParams.get("cwd"); if (!cwd || !await isCwdAllowed(cwd)) throw new UiError("Access denied", 403); return NextResponse.json(await branchInventory(cwd)); } catch (e) { return uiRouteError(e); }
}
export async function POST(req: Request) {
  try {
    const body = await uiBody(req);
    if (typeof body.cwd !== "string" || !await isCwdAllowed(body.cwd) || typeof body.token !== "string") throw new UiError("Access denied", 403);
    return NextResponse.json(await executeBranch(body.token, body.keepChanges === true, hasBusyCheckout));
  } catch (e) { return uiRouteError(e); }
}
