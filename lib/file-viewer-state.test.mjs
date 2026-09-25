import assert from "node:assert/strict";
import test from "node:test";

import { resolveInitialFileDisplayMode } from "./file-viewer-state.ts";

test("a restored display mode wins over a stale open hint", () => {
  const state = {
    displayMode: "source",
    wrapLines: true,
    scrollTop: 80,
    scrollLeft: 0,
  };

  assert.equal(resolveInitialFileDisplayMode(state, "diff"), "source");
});

test("the open hint is used only before viewer state has been saved", () => {
  assert.equal(resolveInitialFileDisplayMode(undefined, "diff"), "diff");
  assert.equal(resolveInitialFileDisplayMode(), "source");
});

test("markdown and html open on their preview without a restored mode or hint", () => {
  assert.equal(resolveInitialFileDisplayMode(undefined, undefined, "/repo/AGENTS.md"), "preview");
  assert.equal(resolveInitialFileDisplayMode(undefined, undefined, "/repo/notes.MDX"), "preview");
  assert.equal(resolveInitialFileDisplayMode(undefined, undefined, "/repo/page.html"), "preview");
  assert.equal(resolveInitialFileDisplayMode(undefined, undefined, "/repo/page.htm"), "preview");
  // Only the extensions the read endpoint can render get the default.
  assert.equal(resolveInitialFileDisplayMode(undefined, undefined, "/repo/notes.markdown"), "source");
  assert.equal(resolveInitialFileDisplayMode(undefined, undefined, "/repo/index.ts"), "source");
  assert.equal(resolveInitialFileDisplayMode(undefined, undefined, "/repo/Makefile"), "source");
});

test("a restored mode and an open hint still win over the path default", () => {
  const state = {
    displayMode: "source",
    wrapLines: false,
    scrollTop: 0,
    scrollLeft: 0,
  };

  assert.equal(resolveInitialFileDisplayMode(state, undefined, "/repo/AGENTS.md"), "source");
  assert.equal(resolveInitialFileDisplayMode(undefined, "diff", "/repo/AGENTS.md"), "diff");
});
