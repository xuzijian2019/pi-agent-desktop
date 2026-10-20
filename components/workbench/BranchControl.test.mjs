import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Script } from "node:vm";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("./BranchControl.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("BranchControl.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const helper = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "containsBranchControlTarget");
assert.ok(helper);
const containsTarget = new Script(ts.transpileModule(`${helper.getText(ast)}\ncontainsBranchControlTarget;`, {
  compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText).runInNewContext({});

test("branch base and location use app-themed selects without changing operation values", () => {
  assert.equal((source.match(/<AppSelect /g) ?? []).length, 2);
  assert.doesNotMatch(source, /<select\b|<datalist\b/);
  assert.match(source, /aria-label=\{t\("wb\.base"\)\} value=\{baseRef\} onValueChange=\{setBase\}/);
  assert.match(source, /value: "HEAD", label: `HEAD/);
  assert.match(source, /value: b\.ref, label: b\.name/);
  assert.match(source, /aria-label=\{t\("wb\.location"\)\} value=\{location\}/);
  assert.match(source, /value: "current", label: t\("wb\.currentCheckout"\)/);
  assert.match(source, /value: "worktree", label: t\("wb\.newWorktree"\)/);
  assert.match(source, /action: "create", name, baseRef, location/);
});

test("branch dialog keeps its own portaled select open but dismisses unrelated clicks", () => {
  const inside = {}, option = {}, outside = {}, unrelatedOption = {};
  const panel = { contains: target => target === option };
  const unrelated = { contains: target => target === unrelatedOption };
  const root = {
    contains: target => target === inside,
    querySelectorAll: () => [{ getAttribute: () => "base-options" }],
    ownerDocument: { getElementById: id => id === "base-options" ? panel : unrelated },
  };
  assert.equal(containsTarget(root, inside), true);
  assert.equal(containsTarget(root, option), true);
  assert.equal(containsTarget(root, outside), false);
  assert.equal(containsTarget(root, unrelatedOption), false);
  assert.equal(containsTarget(null, option), false);
  root.querySelectorAll = () => [{ getAttribute: () => null }];
  assert.equal(containsTarget(root, option), false);
  assert.match(source, /if \(!containsBranchControlTarget\(anchor\.current, event\.target as Node\)\) setOpen\(false\)/);
});
