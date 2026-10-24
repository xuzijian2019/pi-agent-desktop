import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import test from "node:test";
import ts from "typescript";

const text = readFileSync(new URL("./ChatInput.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/native-theme.css", import.meta.url), "utf8");
const source = ts.createSourceFile("ChatInput.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(predicate, node = source) {
  if (predicate(node)) return node;
  return ts.forEachChild(node, child => find(predicate, child));
}
function evaluate(node, context) {
  return new Script(ts.transpileModule(`(${node.getText(source)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText).runInNewContext(context);
}

test("composer remeasures current draft content and clears its inline height when empty", () => {
  const callback = find(node => ts.isVariableDeclaration(node) && node.name.getText(source) === "resizeTextarea").initializer.arguments[0];
  const textareaRef = { current: { value: "four lines", scrollHeight: 88, style: {} } };
  const resize = evaluate(callback, { textareaRef });
  resize();
  assert.equal(textareaRef.current.style.height, "88px");
  textareaRef.current.scrollHeight = 600;
  resize();
  assert.equal(textareaRef.current.style.height, "600px", "CSS, not a second JS constant, owns the 200px cap");
  textareaRef.current.value = "short restored draft";
  textareaRef.current.scrollHeight = 24;
  resize();
  assert.equal(textareaRef.current.style.height, "24px");
  textareaRef.current.value = "";
  resize();
  assert.equal(textareaRef.current.style.height, "auto");
  textareaRef.current = null;
  assert.doesNotThrow(resize);
});

test("width observer remeasures wrapping, ignores height-only notifications and disconnects", () => {
  const effect = find(node => ts.isCallExpression(node) && node.expression.getText(source) === "useEffect" && node.arguments[0]?.getText(source).includes("let previousWidth = -1"));
  let notify;
  let measured = 0;
  let disconnected = false;
  const textarea = {};
  const start = evaluate(effect.arguments[0], {
    textareaRef: { current: textarea },
    resizeTextarea() { measured++; },
    ResizeObserver: class {
      constructor(callback) { notify = callback; }
      observe(target) { assert.equal(target, textarea); }
      disconnect() { disconnected = true; }
    },
  });
  const cleanup = start();
  for (const width of [800, 800, 350, 350, 800]) notify([{ contentRect: { width } }]);
  assert.equal(measured, 3);
  cleanup();
  assert.equal(disconnected, true);
  assert.match(text, /useLayoutEffect\(resizeTextarea, \[value, fontSize, resizeTextarea\]\)/);
});

test("new tasks share the chat column and the normal 24–200px editor limits", () => {
  assert.match(text, /className="chat-composer-wrap" style=\{\{ maxWidth: "var\(--chat-content-max-width, 820px\)" \}\}/);
  assert.match(css, /\.composer-textarea \{[^}]*min-height: 24px;[^}]*max-height: 200px;/);
  assert.doesNotMatch(css, /\.chat-empty-state \.composer-textarea\s*\{/);
  assert.doesNotMatch(css, /\.chat-empty-state \.chat-composer-wrap\s*\{/);
  assert.match(css, /\.chat-empty-state \{[^}]*max-width: none;/);
  assert.doesNotMatch(text, /className="composer-trigger-hint"/);
});
