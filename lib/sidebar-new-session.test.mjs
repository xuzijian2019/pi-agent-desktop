import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url);
const { resolveSidebarNewSession } = await jiti.import("./sidebar-new-session.ts");
const chat = "/server-owned-chat";
const opts = {
  requestedCwd: "/gone",
  chatWorkspaceCwd: chat,
  sessions: [
    { id: "gone", cwd: "/gone", projectRoot: "/gone", cwdMissing: true },
    { id: "chat", cwd: chat, workspaceKind: "chat" },
    { id: "live", cwd: "/live", projectRoot: "/live" },
  ],
  recentProjects: [chat, "/gone", "/live"],
  homeDir: "/home/test",
};
test("missing project fallback never lands in the hidden chat workspace", () => {
  assert.deepEqual(resolveSidebarNewSession(opts), { cwd: "/live", workspaceKind: "project" });
});
test("a chat uses server identity and does not redirect through missing project fallback", () => {
  assert.deepEqual(resolveSidebarNewSession({ ...opts, requestedCwd: chat }), { cwd: chat, workspaceKind: "chat" });
  assert.deepEqual(resolveSidebarNewSession({ ...opts, workspaceKind: "chat" }), { cwd: chat, workspaceKind: "chat" });
});
test("a chat request waits for server identity rather than borrowing the project cwd", () => {
  assert.equal(resolveSidebarNewSession({ ...opts, workspaceKind: "chat", chatWorkspaceCwd: null, sessions: [] }), null);
});
test("project classification cannot overwrite a known chat identity", () => {
  assert.equal(resolveSidebarNewSession({ ...opts, requestedCwd: chat, workspaceKind: "project" }), null);
});
test("missing projects retain home fallback and existing project stays selected", () => {
  assert.deepEqual(resolveSidebarNewSession({ ...opts, recentProjects: [chat, "/gone"] }), { cwd: "/home/test", workspaceKind: "project" });
  assert.deepEqual(resolveSidebarNewSession({ ...opts, requestedCwd: "/live" }), { cwd: "/live", workspaceKind: "project" });
});
