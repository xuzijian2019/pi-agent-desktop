import { stat } from "fs/promises";
import { resolve } from "path";
import { NextResponse } from "next/server";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { getAllowedFileRoots, isExistingFilePathAllowed } from "@/lib/file-access";
import { invalidateModelsCache } from "@/lib/models-cache";
import type { ProjectTrustStatus } from "@/lib/api-types";
import { getProjectTrustStatus, trustProject } from "@/lib/project-trust";
import { destroyRpcSessionsForCwd, hasBusyRpcSessionForCwd } from "@/lib/rpc-manager";

export const dynamic = "force-dynamic";

async function validateCwd(value: unknown): Promise<
  { cwd: string } | { response: NextResponse }
>;
async function validateCwd(
  value: unknown,
  opts: { missingIsBenign: true },
): Promise<{ cwd: string } | { cwdMissing: true } | { response: NextResponse }>;
async function validateCwd(value: unknown, opts: { missingIsBenign?: boolean } = {}): Promise<
  { cwd: string } | { cwdMissing: true } | { response: NextResponse }
> {
  if (typeof value !== "string" || !value.trim()) {
    return { response: NextResponse.json({ error: "cwd required" }, { status: 400 }) };
  }

  const cwd = resolve(value);
  try {
    if (!(await stat(cwd)).isDirectory()) {
      return { response: NextResponse.json({ error: "cwd must be a directory" }, { status: 400 }) };
    }
  } catch {
    if (opts.missingIsBenign) return { cwdMissing: true };
    return { response: NextResponse.json({ error: `Directory does not exist: ${cwd}` }, { status: 400 }) };
  }

  const allowedRoots = await getAllowedFileRoots();
  if (!isExistingFilePathAllowed(cwd, allowedRoots)) {
    return { response: NextResponse.json({ error: "Access denied" }, { status: 403 }) };
  }
  return { cwd };
}

export async function GET(req: Request) {
  // GET only probes trust state: sessions and restored workspaces routinely
  // point at directories deleted since, so a missing cwd is a status, not an error.
  const result = await validateCwd(new URL(req.url).searchParams.get("cwd"), { missingIsBenign: true });
  if ("response" in result) return result.response;
  if ("cwdMissing" in result) {
    const status: ProjectTrustStatus = { requiresTrust: false, trusted: false, cwdMissing: true };
    return NextResponse.json(status);
  }
  return NextResponse.json(getProjectTrustStatus(result.cwd, getAgentDir()));
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as { cwd?: unknown };
    const result = await validateCwd(body.cwd);
    if ("response" in result) return result.response;

    const agentDir = getAgentDir();
    const current = getProjectTrustStatus(result.cwd, agentDir);
    if (!current.requiresTrust) {
      return NextResponse.json({ error: "This project has no resources that require trust" }, { status: 409 });
    }
    if (hasBusyRpcSessionForCwd(result.cwd)) {
      return NextResponse.json({ error: "Wait for the active session to finish before trusting this project" }, { status: 409 });
    }

    const status = trustProject(result.cwd, agentDir);
    invalidateModelsCache();
    await destroyRpcSessionsForCwd(result.cwd);
    return NextResponse.json(status);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
