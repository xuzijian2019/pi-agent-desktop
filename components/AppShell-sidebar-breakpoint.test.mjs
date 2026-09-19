import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// The mobile drawer and the desktop sidebar share one `sidebarOpen` flag, so
// closing the drawer used to leave the desktop sidebar hidden after a resize
// back across the breakpoint. The desktop state is kept in its own ref and
// restored on the mobile -> desktop transition.
test("the desktop sidebar state survives closing the mobile drawer", async () => {
  const source = await readFile(new URL("./AppShell.tsx", import.meta.url), "utf8");
  assert.match(source, /const desktopSidebarOpenRef = useRef\(true\)/);
  assert.match(
    source,
    /setSidebarOpen\(isMobile \? false : desktopSidebarOpenRef\.current\)/,
  );
});

test("only an explicit desktop toggle records a new desktop sidebar state", async () => {
  const source = await readFile(new URL("./AppShell.tsx", import.meta.url), "utf8");
  const start = source.indexOf("const handleSidebarToggle = useCallback");
  assert.notEqual(start, -1);
  const handler = source.slice(start, source.indexOf("}, [isMobile]);", start));
  assert.match(handler, /if \(!isMobile\) desktopSidebarOpenRef\.current = next/);

  // Every other close is drawer-only and must stay guarded by `isMobile`, or
  // it would silently overwrite the remembered desktop state.
  for (const line of source.split("\n")) {
    if (!line.includes("setSidebarOpen(false)")) continue;
    assert.ok(
      /isMobile/.test(line) || line.includes("onClick={() => setSidebarOpen(false)}"),
      `unguarded sidebar close: ${line.trim()}`,
    );
  }
});
