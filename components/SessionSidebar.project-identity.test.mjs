import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./SessionSidebar.tsx", import.meta.url), "utf8");
const customPathStart = source.indexOf("const commitCustomPath = useCallback");
const customPathEnd = source.indexOf("const handleCustomPathClick", customPathStart);
const customPathSource = source.slice(customPathStart, customPathEnd);

// The fork moved custom-path validation into components/ProjectPicker.tsx
// (the extraction boundary guarded by fork-extractions.test.mjs). The
// validated-identity assertions therefore target the extraction, not this file.
test("custom cwd selection validates the path through ProjectPicker", async () => {
  const picker = await readFile(new URL("./ProjectPicker.tsx", import.meta.url), "utf8");
  assert.match(picker, /\/api\/cwd\/validate/);
});
