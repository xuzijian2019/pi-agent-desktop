import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import semver from "semver";

// Remediation floors, including nested copies. Live npm audit is still needed.
const floors = { next: ">=16.4.1", zod: ">=4.6.6", dompurify: ">=3.4.17", "decode-uri-component": ">=0.5.1", glob: ">=14.0.2" };
for (const path of ["../package-lock.json", "../demo/package-lock.json", "../relay/package-lock.json"]) {
  test(`${path} retains patched dependency versions`, () => {
    const lock = JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
    for (const [location, pkg] of Object.entries(lock.packages)) {
      const name = location.split("node_modules/").at(-1);
      if (floors[name]) assert.ok(semver.satisfies(pkg.version, floors[name]), `${location}@${pkg.version} must satisfy ${floors[name]}`);
    }
  });
}
for (const path of ["../package.json", "../demo/package.json"]) {
  test(`${path} aligns Next.js and its lint config`, () => {
    const pkg = JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
    assert.equal(pkg.dependencies.next, pkg.devDependencies["eslint-config-next"]);
  });
}
