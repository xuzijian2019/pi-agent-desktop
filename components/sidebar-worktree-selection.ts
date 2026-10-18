import type { ProjectBranchMenuState, WorktreeEntry } from "./ProjectContextMenu";

export interface SidebarWorktreeState {
  /** The cwd this data was fetched or selected for. */
  forCwd: string;
  projectRoot: string;
  /** Stable server-computed identity; never derive OS path semantics here. */
  projectKey: string;
  isGit: boolean;
  isTopLevel: boolean;
  /** Canonical path of the checkout containing forCwd, resolved server-side. */
  currentWorktreePath: string | null;
  worktrees: WorktreeEntry[];
}

/** Register a menu selection before notifying the shell, even for another project. */
export function selectedProjectWorktreeState(
  previous: SidebarWorktreeState | null,
  project: { root: string; key: string },
  path: string,
  loaded?: ProjectBranchMenuState | null,
  created?: WorktreeEntry,
): SidebarWorktreeState {
  const known = loaded?.root === project.root
    ? loaded.worktrees
    : previous?.projectRoot === project.root ? previous.worktrees : [];
  const worktrees = created
    ? [...known.filter((entry) => entry.path !== created.path), created]
    : known;
  return {
    forCwd: path,
    projectRoot: project.root,
    projectKey: project.key,
    isGit: true,
    isTopLevel: true,
    currentWorktreePath: path,
    worktrees,
  };
}
