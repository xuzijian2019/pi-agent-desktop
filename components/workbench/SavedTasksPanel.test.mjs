import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";
import { join } from "node:path";

const jiti = createJiti(import.meta.url, { alias: { "@": join(import.meta.dirname, "..", "..") } });
const { workbenchEn, workbenchZh } = await jiti.import("../../lib/i18n/messages/workbench.ts");

// "No saved tasks match" reads like a broken filter when the library is simply
// empty; the first-run copy points at the two ways to create one.
test("an empty library gets first-run copy, a filtered one keeps the match copy", async () => {
  const source = await readFile(new URL("./SavedTasksPanel.tsx", import.meta.url), "utf8");
  assert.match(
    source,
    /t\(!tasks\.length && !search\.trim\(\) && scope === "all" \? "wb\.noTasksYet" : "wb\.noTasks"\)/,
  );
});

// A search box and a scope picker over an empty library are two controls that
// can only ever return nothing. They appear with the first saved task.
test("the search and scope toolbar is gated on the library having a task", async () => {
  const source = await readFile(new URL("./SavedTasksPanel.tsx", import.meta.url), "utf8");
  assert.match(source, /\{tasks\.length > 0 && <div className="workbench-toolbar">/);
  // The first-run copy is not part of the gate — it is what fills the gap.
  assert.match(source, /workbench-empty">\{t\(!tasks\.length/);
});

test("both locales define the first-run copy", () => {
  for (const messages of [workbenchEn, workbenchZh]) {
    assert.ok(messages["wb.noTasksYet"], "wb.noTasksYet is missing");
    assert.notEqual(messages["wb.noTasksYet"], messages["wb.noTasks"]);
    assert.ok(messages["wb.untitledSession"], "wb.untitledSession is missing");
  }
});
