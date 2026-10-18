import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const { selectedProjectWorktreeState } = await createJiti(import.meta.url).import("./sidebar-worktree-selection.ts");
const main = { path: "/repo", branch: "main", isMain: true };
const feature = { path: "/repo-worktrees/topic", branch: "topic", isMain: false };
const project = { root: main.path, key: "server-resolved-project-key" };
const loaded = { root: main.path, isGit: true, branches: ["main"], remoteBranches: [], loaded: true, worktrees: [main] };

function state(overrides = {}) {
  return { forCwd: main.path, projectRoot: main.path, projectKey: project.key, isGit: true, isTopLevel: true, currentWorktreePath: main.path, worktrees: [main], ...overrides };
}

test("creating from another project's menu keeps the target's stable identity immediately", () => {
  const previous = state({ forCwd: "/other", projectRoot: "/other", projectKey: "other-key", worktrees: [{ path: "/other", branch: "main", isMain: true }] });
  const next = selectedProjectWorktreeState(previous, project, feature.path, loaded, feature);
  assert.deepEqual(next, state({ forCwd: feature.path, currentWorktreePath: feature.path, worktrees: [main, feature] }));
  assert.equal(previous.projectKey, "other-key");
  assert.deepEqual(previous.worktrees.map((entry) => entry.path), ["/other"]);
});

test("selecting an existing worktree uses the menu's fresh list and never another project's list", () => {
  const fresh = { ...loaded, worktrees: [main, feature] };
  const next = selectedProjectWorktreeState(null, project, feature.path, fresh);
  assert.equal(next.currentWorktreePath, feature.path);
  assert.equal(next.projectKey, project.key);
  assert.deepEqual(next.worktrees, [main, feature]);
  assert.deepEqual(selectedProjectWorktreeState(state({ projectRoot: "/other" }), project, feature.path, { ...fresh, root: "/other" }, feature).worktrees, [feature]);
});

test("creation retains known same-project checkouts without duplicating the returned path", () => {
  const previous = state({ worktrees: [main, { ...feature, branch: "old" }] });
  const next = selectedProjectWorktreeState(previous, project, feature.path, null, feature);
  assert.deepEqual(next.worktrees, [main, feature]);
  assert.equal(next.isTopLevel, true);
});
