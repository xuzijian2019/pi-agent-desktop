import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("./SessionSidebar.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("SessionSidebar.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let declaration;
function visit(node) {
  if (ts.isVariableStatement(node) && node.declarationList.declarations.some(item => item.name.getText(tree) === "performProjectSessionsDelete")) declaration = node.getText(tree);
  ts.forEachChild(node, visit);
}
visit(tree);
assert.ok(declaration);
function harness(ids, fetch) {
  const removed = [], notices = [];
  const context = vm.createContext({
    projectSessionsDelete: { ids }, projectSessionsDeletingRef: { current: false },
    currentRunningIdsRef: { current: new Set() }, useCallback: fn => fn, fetch,
    encodeURIComponent, t: (key, params) => ({ key, params }),
    setProjectSessionsDeleting: value => { context.busy = value; },
    setProjectSessionsDeleteError: value => { context.error = value; },
    setProjectSessionsDelete: value => { context.target = value; },
    onSessionDeleted: id => removed.push(id), loadSessions: () => { context.refreshed = true; },
    appNotify: { info: notice => notices.push(notice) },
  });
  vm.runInContext(stripTypeScriptTypes(`${declaration}\nglobalThis.run = performProjectSessionsDelete;`), context);
  return { context, removed, notices };
}

test("bulk delete rechecks live ids between requests and skips server-detected running descendants", async () => {
  const requests = [];
  const h = harness(["active", "first", "later", "raced", "missing"], async (url, options) => {
    requests.push([url, options.method]);
    if (url.includes("first")) h.context.currentRunningIdsRef.current.add("later");
    if (url.includes("raced")) return { ok: false, status: 409, json: async () => ({ code: "session_running" }) };
    return { ok: !url.includes("missing"), status: url.includes("missing") ? 404 : 200 };
  });
  h.context.currentRunningIdsRef.current.add("active");
  await h.context.run();
  assert.deepEqual(requests, [["/api/sessions/first?idleOnly=1", "DELETE"], ["/api/sessions/raced?idleOnly=1", "DELETE"], ["/api/sessions/missing?idleOnly=1", "DELETE"]]);
  assert.deepEqual(h.removed, ["first", "missing"]);
  assert.equal(h.context.target, null);
  assert.equal(h.context.busy, false);
  assert.equal(h.context.refreshed, true);
  assert.equal(h.notices[0].message.params.count, 3);
});

test("bulk delete blocks repeated submits and retains a real failure for retry", async () => {
  const pending = Promise.withResolvers();
  let requests = 0;
  const h = harness(["failed", "untouched"], async () => { requests++; return pending.promise; });
  const first = h.context.run();
  await h.context.run();
  assert.equal(requests, 1);
  pending.resolve({ ok: false, status: 409, json: async () => ({ code: "other_conflict", error: "Cannot delete" }) });
  await first;
  assert.equal(requests, 1);
  assert.equal(h.context.busy, false);
  assert.equal(h.context.projectSessionsDeletingRef.current, false);
  assert.equal(h.context.error.key, "sidebar.deleteFailed");
  assert.equal(h.context.error.params.error, "Cannot delete");
  assert.equal(h.context.target, undefined, "failed confirmation stays open");
  assert.deepEqual(h.removed, []);
});
