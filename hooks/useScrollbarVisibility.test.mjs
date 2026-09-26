import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./useScrollbarVisibility.ts", import.meta.url), "utf8");

test("only user-driven scrolling reveals the thumb", () => {
  // Loading a session, restoring its position and following a streaming reply
  // all scroll programmatically; revealing the thumb for those flashed it on
  // every load.
  const onScroll = source.slice(source.indexOf("const onScroll = () => {"));
  assert.match(
    onScroll.slice(0, onScroll.indexOf("};")),
    /if \(performance\.now\(\) - lastUserIntent > USER_SCROLL_INTENT_MS\) return;/,
  );
  for (const type of ["wheel", "touchmove", "pointerdown", "keydown"]) {
    assert.match(source, new RegExp(`"${type}"`), `${type} counts as user scroll intent`);
  }
});
