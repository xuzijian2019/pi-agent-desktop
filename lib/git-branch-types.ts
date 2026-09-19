export interface BranchInventory {
  isGit: boolean; root: string; current: string | null; head: string;
  branches: { ref: string; name: string; sha: string; remote: boolean; worktree?: string }[];
  worktrees: { path: string; branch: string | null; isMain: boolean }[];
}
export interface BranchOperation { action: "switch" | "create"; location: "current" | "worktree"; name?: string; ref?: string; baseRef?: string }
export interface BranchPreview extends BranchOperation { token: string; cwd: string; name: string; head: string; dirty: boolean; baseSha: string; targetRef?: string; path: string }
