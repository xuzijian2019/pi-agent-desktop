import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { ConfigDetailNavigationContext, ConfigSplitView } = await jiti.import("./SettingsUi.tsx");

const h = React.createElement;
const noop = () => {};
const uiSource = await readFile(new URL("./SettingsUi.tsx", import.meta.url), "utf8");
const panelSource = await readFile(new URL("./SettingsPanel.tsx", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../app/settings.css", import.meta.url), "utf8");

const splitView = (navigation) => renderToStaticMarkup(navigation
  ? h(ConfigDetailNavigationContext.Provider, { value: navigation }, h(ConfigSplitView, null, "rows"))
  : h(ConfigSplitView, null, "rows"));
const navigation = (detailOpen) => ({ detailOpen, openDetail: noop, closeDetail: noop, reportDetailTitle: noop });

test("inside Settings a split view says which pane a phone shows; elsewhere it stacks as before", () => {
  assert.equal(splitView(null), '<div class="config-split-view">rows</div>');
  assert.equal(splitView(navigation(false)), '<div class="config-split-view" data-pane="list">rows</div>');
  assert.equal(splitView(navigation(true)), '<div class="config-split-view" data-pane="detail">rows</div>');
  const phone = cssSource.match(/\.config-split-view\[data-pane="list"\] > \.config-detail,\s*\.config-split-view\[data-pane="detail"\] > \.config-sidebar \{\s*display: none;/);
  assert.ok(phone, "a phone hides the other pane");
});

test("a row or the add button opens the detail unless its handler prevented that", () => {
  for (const name of ["ConfigSidebarItem", "ConfigListAction"]) {
    const block = uiSource.match(new RegExp(`export function ${name}\\([\\s\\S]*?\\n\\}\\n`))?.[0] ?? "";
    assert.match(block, /onClick=\{\(event\) => \{\s*onClick\?\.\(event\);\s*if \(!event\.defaultPrevented\) openDetail\(\);/, name);
    assert.match(block, /useReportDetailTitle\(active, ref\)/, name);
  }
});

// The fork keeps its compact section picker rather than adopting upstream's
// phone history stack. Keep shared detail-navigation coverage above, and guard
// the retained integration so a clean merge cannot hide the second pane.
test("fork Settings keeps both panes and changes sections without browser history entries", () => {
  assert.doesNotMatch(panelSource, /ConfigDetailNavigationContext.Provider|data-phone-level|history\.pushState|history\.go/);
  assert.match(panelSource, /<AppSelect[\s\S]*?className="settings-mobile-section-picker"/);
  assert.match(panelSource, /mountedSections\.has\(id\)/);
  assert.match(panelSource, /hidden=\{section !== id\}/);
  assert.match(panelSource, /onValueChange=\{\(value\) => activateSection\(value as SettingsSection\)\}/);
});
