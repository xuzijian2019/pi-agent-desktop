import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./ChatInput.tsx", import.meta.url), "utf8");

test("clamps the upstream mobile reasoning menu to the viewport", async () => {
  assert.match(source, /composer-run-menu/);
  assert.match(source, /maxWidth: menuWidth/);
  // Evaluate the actual inline horizontal clamp, including a far-right trigger.
  const expr = source.match(/const mobileLeft = (.*);/)?.[1];
  assert.ok(expr);
  const clamp = new Function("anchorLeft", "vw", "menuWidth", `return ${expr};`);
  for (const vw of [320, 390, 600]) {
    const menuWidth = Math.min(320, vw - 24);
    for (const anchorLeft of [16, vw / 2, vw - 40]) {
      const x = anchorLeft + clamp(anchorLeft, vw, menuWidth);
      assert.ok(x >= 12);
      assert.ok(x + menuWidth <= vw - 12);
    }
  }
  assert.match(source, /isMobile \? \{ left: mobileLeft \} : \{ right: 0 \}/);
  assert.match(source, /bottom: "calc\(100% \+ 6px\)"/);
  assert.match(source, /visualViewport\?\.height \?\? window.innerHeight/);
  assert.match(source, /maxHeight: maxH, display: "flex", flexDirection: "column"/);
});
