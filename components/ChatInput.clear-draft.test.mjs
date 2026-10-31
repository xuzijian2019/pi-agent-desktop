import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Script } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("./ChatInput.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("ChatInput.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const nodes = [];
function visit(node) { nodes.push(node); ts.forEachChild(node, visit); }
visit(ast);
function callback(name, context) {
  const node = nodes.find(node => ts.isVariableDeclaration(node) && node.name.getText(ast) === name);
  return new Script(ts.transpileModule(node.initializer.arguments[0].getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText).runInNewContext(context);
}

test("explicit clear retires prepared sends and queue submissions without sending or clearing a newer draft", async () => {
  for (const name of ["handleSend", "sendQueued"]) {
    const pending = Promise.withResolvers();
    const started = Promise.withResolvers();
    const calls = [];
    const version = { current: 0 };
    const run = callback(name, {
      invalidDraftImages: false, orphanedPaste: false, draftKey: "a", hydratedDraftKey: "a", persistenceStatus: "saved",
      value: "original", pastedTexts: [], attachedImages: [], attachedFilesRef: { current: [] },
      splicePastedTexts: text => text, dispatchBuiltin: async () => false, isStreaming: false, workspaceUnavailable: null,
      onBuiltinCommand: undefined, draftKeyRef: { current: "a" }, preparingRef: { current: false },
      attachmentClearVersionRef: version, snapshotRef: { current: () => ({ value: "original" }) },
      prepare() { started.resolve(); return pending.promise; }, setPreparationError() {},
      onSend: (...args) => calls.push(args), onSteer: (...args) => calls.push(args), onFollowUp: (...args) => calls.push(args),
      clearInput: () => calls.push("clear"),
    });
    const finished = run("steer");
    await started.promise;
    version.current += 1;
    pending.resolve({ text: "resolved original", images: [] });
    await finished;
    assert.deepEqual(calls, [], name);
  }
});

test("explicit clear discards pending image previews and text imports", async () => {
  const pending = Promise.withResolvers();
  const version = { current: 0 };
  const revoked = [], appended = [];
  const count = { current: 0 };
  const images = callback("processImageFiles", {
    compact: false, MAX_ATTACHED_IMAGES: 5, MAX_ATTACHED_IMAGE_BYTES: 1000,
    attachedImagesRef: { current: [] }, pendingImageCountRef: count, attachmentClearVersionRef: version,
    compressImageFile: () => pending.promise, URL: { createObjectURL: () => "blob:pending" },
    revokeImagePreview: image => revoked.push(image.previewUrl), appendAttachedImages: images => appended.push(images),
  });
  const finished = images([{ type: "image/png", size: 10 }]);
  assert.equal(count.current, 1);
  version.current += 1;
  pending.resolve({ data: "AQID", mimeType: "image/png" });
  await finished;
  assert.deepEqual(revoked, ["blob:pending"]);
  assert.deepEqual(appended, []);
  assert.equal(count.current, 0);

  const method = nodes.find(node => ts.isMethodDeclaration(node) && node.name.getText(ast) === "addTextFiles");
  const textRead = Promise.withResolvers();
  const context = {
    draftKeyRef: { current: "a" }, attachedFilesRef: { current: [] }, attachmentClearVersionRef: version,
    readChatTextAttachments: () => textRead.promise, extractDocxText() {},
    attachmentDraftAliasesRef: { current: new Map() }, attachmentClearedDraftsRef: { current: new Map() }, getDraft() { throw new Error("cleared imports must not read drafts"); },
  };
  const texts = new Script(ts.transpileModule(`(async function${method.getText(ast).slice("async addTextFiles".length)})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText).runInNewContext(context);
  const finishedText = texts([]);
  version.current += 1;
  context.attachmentClearedDraftsRef.current.set("a", version.current);
  textRead.resolve({ accepted: [{ name: "note.txt", text: "late", size: 4 }], rejected: [] });
  assert.equal((await finishedText).length, 0);
});

test("clear button invalidates pending work, clears the draft and leaves history edit without aborting or sending", () => {
  const button = nodes.find(node => ts.isJsxOpeningElement(node) && node.attributes.properties.some(attribute => ts.isJsxAttribute(attribute) && attribute.name.getText(ast) === "className" && attribute.initializer?.getText(ast) === '"composer-clear-button"'));
  const click = button.attributes.properties.find(attribute => attribute.name?.getText(ast) === "onClick").initializer.expression;
  const calls = [], version = { current: 0 };
  const run = new Script(ts.transpileModule(click.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText).runInNewContext({
    attachmentClearVersionRef: version, attachmentClearedDraftsRef: { current: new Map() }, draftKeyRef: { current: "a" }, clearInput: () => calls.push("clear"), onClearDraft: () => calls.push("leave-edit"), textareaRef: { current: { focus: () => calls.push("focus") } },
  });
  run();
  assert.equal(version.current, 1);
  assert.deepEqual(calls, ["clear", "leave-edit", "focus"]);
});
