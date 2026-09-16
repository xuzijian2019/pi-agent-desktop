import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

for (const file of ["FileViewer.tsx", "MessageView.tsx", "MermaidBlock.tsx"]) {
  test(`${file} uses backgroundColor for syntax highlighter background`, () => {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    const styles = [...source.matchAll(/<SyntaxHighlighter\b[\s\S]*?customStyle=\{\{([\s\S]*?)\}\}/g)];
    assert.ok(styles.length > 0, `missing SyntaxHighlighter customStyle in ${file}`);
    for (const [, style] of styles) {
      assert.match(style, /\bbackgroundColor:/);
      assert.doesNotMatch(style, /\bbackground:/);
    }
  });
}
