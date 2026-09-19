import type { SessionInfo } from "./types";

/**
 * The missing-folder path: what the UI does once a project's directory is gone
 * from disk. Every cwd-scoped API call for such a directory answers 403, so the
 * composer there can only render broken chips and "Access denied" dialogs.
 *
 * Kept out of the upstream components so the shared files only gain a handle
 * type and two call sites.
 */

/**
 * Imperative handle the chat area uses to reach the sidebar's project actions.
 * The sidebar owns both the archived-project list and the project picker, and
 * it is the only place that knows which directories still exist.
 */
export interface SidebarProjectActions {
  /** Start a new session, redirected away from a directory that is gone. */
  newSession: (cwd?: string) => void;
  /** Hide a project from the sidebar — the project menu's "Remove project". */
  removeProject: (projectRoot: string) => void;
  /** Open the "Add project" picker. */
  addProject: () => void;
}

/**
 * Paths the last `/api/sessions` scan reported as gone. A path counts as
 * missing only when *every* session resolving to it is flagged, mirroring
 * `ProjectGroup.cwdMissing`: a repo whose main checkout was deleted but which
 * still has a live worktree is not missing.
 */
export function collectMissingCwds(sessions: SessionInfo[]): Set<string> {
  const present = new Set<string>();
  const missing = new Set<string>();
  for (const session of sessions) {
    for (const key of [session.cwd, session.projectRoot]) {
      if (key) (session.cwdMissing ? missing : present).add(key);
    }
  }
  for (const key of present) missing.delete(key);
  return missing;
}

/**
 * Where a "new session" gesture should actually land. A deleted directory
 * cannot host one, so fall back to the most recent project that still exists,
 * then to the home directory. Returns null when there is nowhere to go.
 */
export function resolveNewSessionCwd(
  requested: string | null,
  sessions: SessionInfo[],
  recentProjects: string[],
  homeDir: string,
): string | null {
  if (!requested) return null;
  const missing = collectMissingCwds(sessions);
  if (!missing.has(requested)) return requested;
  return recentProjects.find((root) => !missing.has(root)) ?? (homeDir || null);
}
