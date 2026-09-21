import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { alias: { "@": join(import.meta.dirname, "..") } });
const { hasForks } = await jiti.import("./session-forks.ts");

/** Minimal SessionTreeNode — hasForks only ever reads `children`. */
function node(id, children = []) {
  return { entry: { type: "message", id }, children };
}

test("an empty tree has no forks", () => {
  assert.equal(hasForks([]), false);
});

test("a linear chain is not a fork", () => {
  assert.equal(hasForks([node("a", [node("b", [node("c")])])]), false);
});

test("a node with two children is a fork", () => {
  assert.equal(hasForks([node("a", [node("b"), node("c")])]), true);
});

test("a fork buried deep in the chain still counts", () => {
  const tree = [node("a", [node("b", [node("c", [node("d"), node("e")])])])];
  assert.equal(hasForks(tree), true);
});

// Upstream supports branching at the first message, which creates multiple roots.
test("first-message branches have multiple roots", () => {
  assert.equal(hasForks([node("a"), node("b")]), true);
});

test("a fork in a sibling subtree is found, not only in the first branch", () => {
  const tree = [node("root", [
    node("left", [node("left-child")]),
    node("right", [node("r1"), node("r2")]),
  ])];
  assert.equal(hasForks(tree), true);
});

test("a long linear session does not overflow the stack", () => {
  let root = node("leaf");
  for (let i = 0; i < 20000; i++) root = node(String(i), [root]);
  assert.equal(hasForks([root]), false);
});
