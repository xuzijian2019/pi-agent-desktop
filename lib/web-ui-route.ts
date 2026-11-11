import { NextResponse } from "next/server";
import { isApiRequestAllowed } from "./request-security";
import { parseJsonWithinLimit } from "./bounded-form-data";
import { UiError } from "./web-ui-store";
import { WorktreeBranchInUseError } from "./worktree";

export async function uiBody(req: Request): Promise<Record<string, unknown>> {
  if (!isApiRequestAllowed(req)) throw new UiError("Untrusted API request", 403);
  const body = await parseJsonWithinLimit(req, 192 * 1024);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new UiError("Invalid request");
  return body as Record<string, unknown>;
}
export function uiRouteError(error: unknown) {
  if (error instanceof WorktreeBranchInUseError) {
    return NextResponse.json({
      error: error.message,
      code: error.missing ? "branch_worktree_missing" : "branch_in_use",
      branch: error.branch,
      worktreePath: error.worktreePath,
    }, { status: 409 });
  }
  return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: error instanceof UiError ? error.status : 500 });
}
