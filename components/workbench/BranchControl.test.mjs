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

const positionHelper = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "getBranchPopoverPosition");
const place = new Script(ts.transpileModule(`${positionHelper.getText(ast).replace("export ", "")}\ngetBranchPopoverPosition;`, {
  compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText).runInNewContext({});

test("branch menu opens below the header and above a bottom toolbar without clipping", () => {
  const header = place({ left: 16, top: 48, bottom: 76 }, { width: 1280, height: 800 });
  assert.equal(header.top, 82);
  assert.equal(header.bottom, undefined);
  assert.equal(header.maxHeight, 420);
  const footer = place({ left: 16, top: 720, bottom: 748 }, { width: 1280, height: 800 });
  assert.equal(footer.bottom, 86);
  assert.equal(footer.top, undefined);
  assert.equal(footer.maxHeight, 420);
});

test("branch menu clamps to a narrow viewport and available vertical space", () => {
  for (const width of [320, 390]) {
    for (const top of [0, 48, 200, 350]) {
      const viewport = { width, height: 400 };
      const p = place({ left: width - 32, top, bottom: top + 28 }, viewport);
      assert.ok(p.left >= 12);
      assert.ok(p.left + p.width <= width - 12);
      assert.ok(p.maxHeight > 0);
      const y = p.top ?? viewport.height - p.bottom - p.maxHeight;
      assert.ok(y >= 12);
      assert.ok(y + p.maxHeight <= viewport.height - 12);
    }
  }
  const constrained = place({ left: 900, top: 80, bottom: 108 }, { width: 1280, height: 800 }, { left: 400, right: 800 });
  assert.equal(constrained.left + constrained.width, 788);
});
