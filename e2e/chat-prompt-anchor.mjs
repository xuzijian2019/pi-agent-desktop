import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { chromium } from "playwright";


// Exercise the actual hook callbacks against browser scroll geometry, without
// loading user sessions or invoking a model.
const source = ts.createSourceFile("useAgentSession.ts", await readFile(new URL("../hooks/useAgentSession.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
function callback(name) {
  let result;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) {
      result = ts.transpileModule(`(${node.initializer.arguments[0].getText(source)})`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(result, name);
  return result;
}
const callbacks = { tail: callback("scrollToBottom") };
const windowSource = await readFile(new URL("../components/ChatWindow.tsx", import.meta.url), "utf8");
const apply = windowSource.match(/const apply = \(\) => \{([\s\S]*?)\n    \};/)?.[1];
assert.ok(apply, "actual overlay resize callback");
const browser = await chromium.launch({ executablePath: process.env.E2E_BROWSER_EXECUTABLE, channel: process.env.E2E_BROWSER_CHANNEL || (process.platform === "win32" ? "msedge" : undefined), headless: true });
try {
  for (const width of [1280, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 760 } });
    await page.setContent(`<style>
      * { box-sizing: border-box } body { margin: 0 }
      header { height: 48px } #region { position: relative }
      #scroll { height: 600px; overflow-y: scroll; overflow-anchor: none }
      #history { height: 600px } #user { height: 64px }
      #composer { position: absolute; bottom: 0; width: 100%; background: white }
    </style><header>Title bar</header><div id="region"><div id="scroll"><div id="history"></div><div id="user">Sent message</div><div id="reply"></div><div id="spacer"></div></div><div id="composer"></div></div>`);
    await page.evaluate(({ callbacks, apply }) => {
      const container = document.querySelector("#scroll");
      const composer = document.querySelector("#composer");
      const spacer = document.querySelector("#spacer");
      const region = document.querySelector("#region");
      const context = {
        scrollContainerRef: { current: container },
        ignoreProgrammaticScrollUntilRef: { current: 0 }, PROGRAMMATIC_SCROLL_IGNORE_MS: 100,
        previousScrollTopRef: { current: 0 },
      };
      const tail = new Function(...Object.keys(context), `return ${callbacks.tail}`)(...Object.values(context));
      const resize = new Function("composer", "spacer", "region", "container", `let applied = -1; return () => {${apply}}`)(composer, spacer, region, container);
      for (const inset of [90, 148, 220, 90]) {
        tail("instant");
        composer.style.height = `${inset}px`;
        resize();
        if (Math.abs(container.scrollHeight - container.scrollTop - container.clientHeight) > 1) throw new Error("Resizing composer lost tail");
        for (const replyHeight of [0, 40, 100, 800]) {
          document.querySelector("#reply").style.height = `${replyHeight}px`;
          tail("instant");
          const end = document.querySelector(replyHeight ? "#reply" : "#user").getBoundingClientRect().bottom;
          if (Math.abs(end - composer.getBoundingClientRect().top) > 1) throw new Error(`Tail clipped: inset=${inset}, reply=${replyHeight}`);
          if (window.scrollY !== 0) throw new Error("Tail following scrolled the document");
        }
      }
      container.scrollTop = 80;
      composer.style.height = "148px";
      resize();
      if (container.scrollTop !== 80) throw new Error("Composer resize pulled reader out of history");
    }, { callbacks, apply });
    console.log(`${width}px: fork tail remains above overlay through streaming, long content and resizing; history and document scroll preserved`);
    await page.close();
  }
} finally {
  await browser.close();
}
