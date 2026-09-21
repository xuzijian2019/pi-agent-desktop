import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./ChatInput.tsx", import.meta.url), "utf8");

test("anchors the mobile reasoning menu to its left edge", async () => {
  const css = await readFile(new URL("../app/native-theme.css", import.meta.url), "utf8");
  assert.match(source, /composer-dropdown-panel is-thinking/);
  assert.match(css, /\.composer-dropdown-panel\.is-thinking/);
  assert.match(css, /bottom: calc\(100% \+ 6px\)/);
});
