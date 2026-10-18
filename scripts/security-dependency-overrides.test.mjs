import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));

test("mammoth resolves argparse 2 without reintroducing vulnerable sprintf-js", () => {
  assert.equal(pkg.overrides.mammoth.argparse, "^2.0.1");
  assert.equal(Object.keys(lock.packages).some(name => name.endsWith("/sprintf-js")), false);
  const require = createRequire(import.meta.url);
  const mammothRequire = createRequire(require.resolve("mammoth/package.json"));
  assert.match(mammothRequire("argparse/package.json").version, /^2\./);
});
