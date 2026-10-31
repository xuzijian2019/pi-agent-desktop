import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Script } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("./ChatWindow.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("ChatWindow.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let prompt;
function visit(node) {
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === "ChatShellPrompt") prompt = node;
  ts.forEachChild(node, visit);
}
visit(ast);
const handler = prompt.attributes.properties.find(attribute => attribute.name?.getText(ast) === "onAllow").initializer.expression;
const script = new Script(ts.transpileModule(handler.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText);

test("shell permission continues once only after success in the same session generation", async () => {
  for (const scenario of ["accepted", "refused", "switched", "returned", "editing"]) {
    const pending = Promise.withResolvers();
    const calls = [];
    const sessionIdRef = { current: "a" }, sessionGenerationRef = { current: 0 };
    const editEntryIdRef = { current: null };
    const run = script.runInNewContext({
      sessionIdRef, sessionGenerationRef, editEntryIdRef,
      chatAccess: { setUnlocked(unlocked) { calls.push(["unlock", unlocked]); return pending.promise; } },
      sendMain: text => calls.push(["send", text]), t: key => key,
    });
    const finished = run();
    assert.deepEqual(calls, [["unlock", true]]);
    if (scenario === "switched") { sessionIdRef.current = "b"; sessionGenerationRef.current += 1; }
    if (scenario === "returned") sessionGenerationRef.current += 2;
    if (scenario === "editing") editEntryIdRef.current = "earlier-user";
    pending.resolve(scenario !== "refused");
    await finished;
    assert.deepEqual(calls, scenario === "accepted" ? [["unlock", true], ["send", "chat.chatShellPromptContinue"]] : [["unlock", true]], scenario);
  }
});

test("shell continuation refuses a pending history edit before requesting access", async () => {
  const run = script.runInNewContext({ editEntryIdRef: { current: "earlier-user" } });
  await run();
});

test("shell prompt uses server availability and the existing fork overlay, not a second composer", () => {
  assert.ok(source.includes("chatAccess?.state.available && !chatAccess.state.unlocked && !sessionBusy && !editEntryId && lastTurnHitChatShellBlock(messages)"));
  assert.equal((source.match(/ref={bottomComposerRef}/g) ?? []).length, 1);
  assert.doesNotMatch(source, /chatUnlockDialog|CHAT_MINIMAP_WIDTH|ref={composerOverlayRef}/);
  assert.match(source, /onSend={sendMain}/);
  assert.match(source, /onClearDraft={cancelEdit}/);
});
