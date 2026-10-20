import type { SessionInfo, SessionWorkspaceKind } from "./types";
import { resolveNewSessionCwd } from "./missing-folder";

/** Keep project fallback and the server-owned non-project workspace separate. */
export function resolveSidebarNewSession(options: {
  requestedCwd: string | null;
  workspaceKind?: SessionWorkspaceKind;
  chatWorkspaceCwd: string | null;
  sessions: SessionInfo[];
  recentProjects: string[];
  homeDir: string;
}): { cwd: string; workspaceKind: SessionWorkspaceKind } | null {
  const { requestedCwd, chatWorkspaceCwd, sessions, recentProjects, homeDir } = options;
  const isChatCwd = (cwd: string | null) => Boolean(cwd && (
    cwd === chatWorkspaceCwd
    || sessions.some((session) => session.workspaceKind === "chat" && session.cwd === cwd)
  ));
  const workspaceKind = options.workspaceKind ?? (isChatCwd(requestedCwd) ? "chat" : "project");
  if (workspaceKind === "chat") {
    // A new chat cannot borrow the selected project's cwd while its identity loads.
    const cwd = isChatCwd(requestedCwd) ? requestedCwd : chatWorkspaceCwd;
    return cwd ? { cwd, workspaceKind } : null;
  }
  // Never turn a classified chat into a project, including malformed callers.
  if (isChatCwd(requestedCwd)) return null;
  const cwd = resolveNewSessionCwd(
    requestedCwd,
    sessions.filter((session) => session.workspaceKind !== "chat" && !isChatCwd(session.cwd)),
    recentProjects.filter((root) => !isChatCwd(root)),
    homeDir,
  );
  return cwd ? { cwd, workspaceKind } : null;
}
