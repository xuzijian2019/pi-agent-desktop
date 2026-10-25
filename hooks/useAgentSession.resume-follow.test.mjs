import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = ts.createSourceFile("useAgentSession.ts", await readFile(new URL("./useAgentSession.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
function callback(name, context) {
  let expression;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) expression = node.initializer.arguments[0].getText(source);
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(expression, `production callback ${name}`);
  const js = ts.transpileModule(`(${expression})`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  return new Function(...Object.keys(context), `return ${js}`)(...Object.values(context));
}

test("explicit jump resumes live follow even while its programmatic scroll events are ignored", () => {
  const container = { scrollTop: 80, clientHeight: 400, scrollHeight: 1000, scrollTo({ top }) { this.scrollTop = top - this.clientHeight; } };
  const context = {
    scrollContainerRef: { current: container }, isNearBottomRef: { current: false },
    ignoreProgrammaticScrollUntilRef: { current: 0 }, PROGRAMMATIC_SCROLL_IGNORE_MS: 700,
    previousScrollTopRef: { current: 80 }, userScrollIntentUntilRef: { current: 0 },
    agentRunningRef: { current: true }, completionScrollAllowedRef: { current: false },
    CHAT_SCROLL_TAIL_TOLERANCE: 8, shouldShowScrollToLatest: () => true,
    setShowScrollToBottom(value) { context.visible = typeof value === "function" ? value(context.visible) : value; }, visible: true,
  };
  context.scrollToBottom = callback("scrollToBottom", context);
  const resume = callback("resumeLiveFollow", context);
  const onScroll = callback("handleScrollPositionChange", context);
  // Ordinary history/programmatic positioning must not attach the reader.
  context.scrollToBottom("instant");
  assert.equal(context.isNearBottomRef.current, false);
  resume();
  onScroll(); // ignored during smooth-scroll suppression, as in the browser
  assert.equal(context.isNearBottomRef.current, true);
  assert.equal(context.visible, false);
  container.scrollHeight += 300;
  // This is the actual gate used by the production ResizeObserver.
  if (context.isNearBottomRef.current) context.scrollToBottom("auto");
  assert.equal(container.scrollTop, 900);
  // A subsequent intentional scroll up must still detach.
  context.ignoreProgrammaticScrollUntilRef.current = 0;
  context.userScrollIntentUntilRef.current = Date.now() + 1200;
  container.scrollTop = 100;
  onScroll();
  assert.equal(context.isNearBottomRef.current, false);
  assert.equal(context.visible, true);
});
