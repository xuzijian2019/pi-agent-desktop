import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./AppShell.tsx", import.meta.url), "utf8");

/**
 * Merge sentinel (upstream segment D regression, 0e36743): the restructure
 * introduced two breaks the fork's layout depends on never having —
 *
 * 1. The "Center: chat" column closed right after the topbar, turning the
 *    chat wrapper into a second flex:1 ROW child: the viewport split 50/50
 *    between an empty topbar column and the chat (the "huge blank middle").
 * 2. The right-panel toggle/backdrop/resizer/panel block sat AFTER the row
 *    close, i.e. as flex-COLUMN children of .app-shell: the closed panel's
 *    content height still stole vertical space from the chat row.
 *
 * Both are pinned here so the next merge cannot silently re-introduce them.
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

test("right panel block is a row child (row closes after the panel, not before)", () => {
  const rowOpen = source.indexOf('display: "flex", flex: 1, minHeight: 0, overflow: "hidden"');
  assert.ok(rowOpen !== -1, "row container not found");
  const panelIdx = source.indexOf("right-panel-container");
  assert.ok(panelIdx > rowOpen, "right panel JSX must come after the row opens");

  // The tail must close panel → row → shell in direct succession.
  const tail = source.slice(panelIdx);
  const nesting = tail.indexOf("      </div>\n      </div>\n    </div>\n    {settingsSection");
  assert.ok(nesting !== -1, "panel close must be followed by row close, then shell close");
});
