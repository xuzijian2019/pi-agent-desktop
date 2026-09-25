import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./AppShell.tsx", import.meta.url), "utf8");

/**
 * Layout sentinels.
 *
 * The first two guard upstream segment D regressions (0e36743):
 *
 * 1. The "Center: chat" column closed right after the topbar, turning the
 *    chat wrapper into a second flex:1 ROW child: the viewport split 50/50
 *    between an empty topbar column and the chat (the "huge blank middle").
 * 2. The right-panel toggle/backdrop/resizer/panel block sat AFTER the row
 *    close, i.e. as flex-COLUMN children of .app-shell: the closed panel's
 *    content height still stole vertical space from the chat row.
 *
 * The third pins the 2026-09 full-height sidebar restructure: the sidebar is
 * a direct child of the outer row and the topbar moved into the main column
 * that follows it, so the topbar starts at the center column and the sidebar
 * runs the full window height (no blank strip above the sidebar).
 */
test("chat wrapper stays inside the center column (no 50/50 topbar split)", () => {
  // The column must NOT close between the topbar and the chat content block:
  // the early close looked like `</div>` directly between the mobile trust
  // warning and the Chat content comment.
  assert.doesNotMatch(
    source,
    /renderProjectTrustWarning\(true\)\}\n\s*<\/div>\n\s*\{\/\* Chat content \*\//,
    "column closed before the chat wrapper — chat would split 50/50 with the topbar column",
  );
});

test("topbar dropdowns reserve sidebar and split file-panel space", () => {
  assert.match(source, /const sidebarReserved = sidebarOpen && !isMobile \? sidebarResizer\.width : 0/);
  assert.match(source, /const panelReserved = rightPanelOpen && !isMobile && wideSplitLayout \? rightPanelWidth : 0/);
  assert.match(source, /width: Math\.min\(AGENT_PANEL_WIDTH, available\)/);
  assert.match(source, /reserveLeft=\{sidebarOpen && !isMobile \? sidebarResizer\.width : 0\}/);
  assert.match(source, /reserveRight=\{rightPanelOpen && !isMobile && wideSplitLayout \? rightPanelWidth : 0\}/);
});

test("right panel block is a row child (row closes after the panel, not before)", () => {
  const rowOpen = source.indexOf('display: "flex", flex: 1, minHeight: 0, overflow: "hidden"');
  assert.ok(rowOpen !== -1, "row container not found");
  const panelIdx = source.indexOf("right-panel-container");
  assert.ok(panelIdx > rowOpen, "right panel JSX must come after the row opens");
});

test("topbar sits in the main column after the sidebar (sidebar runs full height)", () => {
  const sidebarHandle = source.indexOf('data-resize-handle="sidebar"');
  assert.ok(sidebarHandle !== -1, "sidebar resize handle not found");
  const topbar = source.indexOf("Top bar with sidebar toggle");
  assert.ok(topbar > sidebarHandle, "topbar must render after the sidebar, inside the main column");

  // The tail must close the file-tree split, panel, inner row, main column,
  // outer row, and shell. The fork's always-on file tree adds a wrapper, so
  // the whitespace differs from upstream's five-close sequence; dropping a
  // close still fails this match.
  const panelIdx = source.indexOf("right-panel-container");
  const tail = source.slice(panelIdx);
  const nesting = tail.indexOf("        </div>\n        </div>\n      </div>\n        </div>\n      </div>\n      </div>\n    </div>\n    {settingsSection");
  assert.ok(nesting !== -1, "panel close must be followed by inner row, main column, outer row, then shell close");
});
