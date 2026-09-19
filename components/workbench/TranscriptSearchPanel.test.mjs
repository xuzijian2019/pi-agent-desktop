import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./TranscriptSearchPanel.tsx", import.meta.url), "utf8");

// Enter runs the search explicitly instead of relying on the form's implicit
// submission, which never fires under synthetic key events (and therefore
// under browser automation) even though the markup is a valid form.
test("Enter in the query field runs the search exactly once", () => {
  const input = source.slice(source.indexOf('<input aria-label={t("wb.transcriptSearch")}'));
  const handler = input.slice(0, input.indexOf("/>"));
  assert.match(handler, /onKeyDown=\{event => \{ if \(event\.key !== "Enter"/);
  // preventDefault keeps a working implicit submission from firing search() a
  // second time; the guard mirrors the Search button's disabled condition.
  assert.match(handler, /event\.preventDefault\(\);/);
  assert.match(handler, /if \(query\.trim\(\) && !busy\) void search\(\);/);
  assert.match(handler, /event\.nativeEvent\.isComposing/);
  // The form's onSubmit stays as the click path for the Search button.
  assert.match(source, /<form onSubmit=\{event => \{ event\.preventDefault\(\); void search\(\); \}\}>/);
});
