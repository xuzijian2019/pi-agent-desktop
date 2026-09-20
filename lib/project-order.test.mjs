import assert from "node:assert/strict";
import test from "node:test";
import { moveProject, orderProjects } from "./project-order.ts";

const roots = (projects) => projects.map((project) => project.projectRoot);
const projects = (...paths) => paths.map((projectRoot) => ({ projectRoot }));

test("saved order survives activity changes and new projects append in default order", () => {
  assert.deepEqual(roots(orderProjects(projects("new-b", "c", "a", "new-a", "b"), ["a", "b", "c"])),
    ["a", "b", "c", "new-b", "new-a"]);
});

test("projects can move above and below another project in either direction", () => {
  assert.deepEqual(moveProject(["a", "b", "c"], "c", "a", "before"), ["c", "a", "b"]);
  assert.deepEqual(moveProject(["a", "b", "c"], "a", "c", "after"), ["b", "c", "a"]);
  assert.deepEqual(moveProject(["a", "b", "c"], "a", "c", "before"), ["b", "a", "c"]);
  assert.deepEqual(moveProject(["a", "b", "c"], "c", "a", "after"), ["a", "c", "b"]);
});

test("moving filtered projects preserves hidden projects and does not mutate the input", () => {
  const order = ["a", "hidden", "b", "archived"];
  assert.deepEqual(moveProject(order, "b", "a", "before"), ["b", "a", "hidden", "archived"]);
  assert.deepEqual(order, ["a", "hidden", "b", "archived"]);
  assert.deepEqual(roots(orderProjects(projects("b", "a"), order)), ["a", "b"]);
});

test("self and stale drop targets leave order intact", () => {
  const order = ["a", "b"];
  assert.equal(moveProject(order, "a", "a", "after"), order);
  assert.equal(moveProject(order, "missing", "b", "before"), order);
  assert.equal(moveProject(order, "a", "missing", "after"), order);
});
