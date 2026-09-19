import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { NewTaskGuideView, loadRecentTasks, recentTasks, RECENT_TASK_LIMIT } = await jiti.import("./NewTaskGuide.tsx");
const { I18nProvider } = await jiti.import("../../hooks/useI18n.tsx");
const { invalidateUiCache } = await jiti.import("../../lib/web-ui-client.ts");
const { workbenchEn, workbenchZh } = await jiti.import("../../lib/i18n/messages/workbench.ts");

const task = (id, over = {}) => ({
  id, revision: 1, name: `Task ${id}`, description: `Description ${id}`, prompt: "p",
  projectRoot: null, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  model: null, effort: "inherit", tools: "inherit", ...over,
});

const render = props =>
  renderToStaticMarkup(
    React.createElement(I18nProvider, null, React.createElement(NewTaskGuideView, { onUse() {}, ...props })),
  );

/** uiFetch only ever calls global fetch, so stubbing it exercises the caching
 *  wrapper the component actually uses rather than a hand-rolled double. */
async function withFetch(payload, fn) {
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), method: init?.method ?? "GET" });
    return { ok: true, json: async () => payload };
  };
  invalidateUiCache();
  try { return await fn(calls); } finally { globalThis.fetch = real; invalidateUiCache(); }
}

// A blank area told a first-time user nothing. One dim line is the whole
// affordance when the library is empty: no heading, no logo, no empty box.
test("an empty library shows the guidance line and nothing else", () => {
  const html = render({ tasks: [] });
  assert.match(html, /Describe a task, or start from a saved one\./);
  assert.doesNotMatch(html, /new-task-chip/);
  assert.doesNotMatch(html, /All saved tasks/);
  assert.doesNotMatch(html, /<h[1-6]/);
});

test("saved tasks render as chips with a name, a description and the panel link", () => {
  const html = render({ tasks: [task("a"), task("b")], onOpenTasks() {} });
  assert.match(html, /Describe a task, or start from a saved one\./);
  assert.match(html, /<strong>Task a<\/strong><span>Description a<\/span>/);
  assert.match(html, /<strong>Task b<\/strong><span>Description b<\/span>/);
  assert.match(html, /class="new-task-guide-all"[^>]*>All saved tasks</);
  // Grouped for screen readers without swallowing the buttons' own role.
  assert.match(html, /role="group" aria-label="Recent saved tasks"/);
});

test("a task without a description renders only its name", () => {
  const html = render({ tasks: [task("a", { description: "" })] });
  assert.match(html, /<strong>Task a<\/strong><\/button>/);
});

test("applying a task disables the chips and surfaces the failure", () => {
  assert.match(render({ tasks: [task("a")], busy: true }), /class="new-task-chip" disabled=""/);
  const html = render({ tasks: [task("a")], error: "Task changed" });
  assert.match(html, /role="alert"[^>]*>Task changed</);
});

// The panel's own list is unsorted; "recent" here has to mean updatedAt.
test("recentTasks takes the most recently updated three, list order as tiebreak", () => {
  assert.equal(RECENT_TASK_LIMIT, 3);
  const picked = recentTasks([
    task("old", { updatedAt: "2026-01-01T00:00:00.000Z" }),
    task("newest", { updatedAt: "2026-03-01T00:00:00.000Z" }),
    task("mid", { updatedAt: "2026-02-01T00:00:00.000Z" }),
    task("oldest", { updatedAt: "2025-01-01T00:00:00.000Z" }),
  ]);
  assert.deepEqual(picked.map(t => t.id), ["newest", "mid", "old"]);
});

test("tasks with no usable timestamp keep their list order instead of jumping ahead", () => {
  const picked = recentTasks([
    task("first", { updatedAt: undefined }),
    task("second", { updatedAt: "not a date" }),
    task("stamped", { updatedAt: "2026-05-01T00:00:00.000Z" }),
  ]);
  assert.deepEqual(picked.map(t => t.id), ["stamped", "first", "second"]);
});

test("the guide reads the saved-task library once, scoped to the cwd", async () => {
  await withFetch({ tasks: [task("a"), task("b"), task("c"), task("d")], projectRoot: null }, async calls => {
    const loaded = await loadRecentTasks("/tmp/my project");
    assert.equal(loaded.length, RECENT_TASK_LIMIT);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, "GET");
    assert.equal(calls[0].url, "/api/saved-tasks?cwd=%2Ftmp%2Fmy%20project");
    // uiFetch coalesces the Saved Tasks panel's identical GET; no poller here.
    await loadRecentTasks("/tmp/my project");
    assert.equal(calls.length, 1);
  });
});

test("both locales define the new-task copy", () => {
  for (const messages of [workbenchEn, workbenchZh]) {
    for (const key of ["wb.newTaskHint", "wb.recentTasks", "wb.allSavedTasks"]) {
      assert.ok(messages[key], `${key} is missing`);
    }
  }
  assert.notEqual(workbenchEn["wb.newTaskHint"], workbenchZh["wb.newTaskHint"]);
});
