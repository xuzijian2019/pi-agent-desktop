import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createJiti } from "jiti";

const source = readFileSync(new URL("./ChatInput.tsx", import.meta.url), "utf8");

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { ChatInput } = await jiti.import("./ChatInput.tsx");
const { I18nProvider } = await jiti.import("@/hooks/useI18n");

function render(props) {
  return renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(ChatInput, {
        onSend() {},
        onAbort() {},
        isStreaming: false,
        onSetAutomation() {},
        ...props,
      }),
    ),
  );
}



// The fork's simplified composer renders no automation gear and keeps Stop
// in its own control slot, so the upstream gear/narrow-Stop render tests are
// intentionally absent here; the server/hook command surface is still pinned.


test("server supports the automation command set end to end", () => {
  const rpc = readFileSync(new URL("../lib/rpc-manager.ts", import.meta.url), "utf8");
  for (const cmd of ["set_auto_compaction", "set_auto_retry", "set_steering_mode", "set_follow_up_mode", "abort_retry"]) {
    assert.match(rpc, new RegExp(`case "${cmd}"`), cmd);
  }
  assert.match(rpc, /steeringMode: this\.inner\.steeringMode/);
  assert.match(rpc, /followUpMode: this\.inner\.followUpMode/);
  const hook = readFileSync(new URL("../hooks/useSessionAutomation.ts", import.meta.url), "utf8");
  assert.match(hook, /type: "set_auto_compaction", enabled: change\.autoCompaction/);
  assert.match(hook, /type: "set_steering_mode", mode: change\.steeringMode/);
});

test("known automation never restores the removed gear, compaction or steering buttons", () => {
  const html = render({
    automation: { autoCompactionEnabled: true, autoRetryEnabled: true, steeringMode: "all", followUpMode: "one-at-a-time" },
    onCompact() {}, onAbortCompaction() {}, onSteer() {}, onFollowUp() {},
    isCompacting: true, isStreaming: true,
  });
  assert.doesNotMatch(html, /aria-label="(?:Session automation|Compact context|Stop compaction)"/);
  assert.doesNotMatch(source, /<SessionAutomationMenu\b|onAudioUnlock|<SelectorRow\b/);
  assert.match(html, /data-action="stop"/);
});

test("extracted mention and project menus preserve the fork's classes and project disambiguation", async () => {
  const { SessionMentionMenu } = await jiti.import("./SessionMentionMenu.tsx");
  const { ComposerProjectChip, getProjectLabel } = await jiti.import("./ComposerProjectChip.tsx");
  const projectOptions = ["/work/company/app", "/work/personal/app"];
  const label = getProjectLabel(projectOptions[0], projectOptions);
  assert.notEqual(label, getProjectLabel(projectOptions[1], projectOptions));
  const html = renderToStaticMarkup(React.createElement(I18nProvider, null,
    React.createElement(ComposerProjectChip, {
      menuRef: { current: null }, open: true, onOpenChange() {}, label,
      projectPath: projectOptions[0], isCompact: true, projectOptions, onProjectChange() {},
    }),
    React.createElement(SessionMentionMenu, {
      loaded: true, matches: [{ id: "one", name: "Session one", firstMessage: "First message" }],
      activeIndex: 0, itemRefs: { current: [] }, onPick() {}, onHover() {}, showHints: false,
    }),
  ));
  assert.match(html, /class="chat-project-context is-compact"/);
  assert.match(html, /class="native-popover app-menu composer-project-menu"/);
  assert.match(html, /class="composer-project-option is-current"/);
  assert.match(html, /class="native-popover app-menu composer-completion-popover is-front"/);
  assert.match(html, /class="composer-completion-item is-session is-active"/);
  assert.doesNotMatch(html, /composer-completion-hint/);
  const palette = readFileSync(new URL("../hooks/useSessionMentionPalette.ts", import.meta.url), "utf8");
  assert.match(palette, /el\.style\.height = `\$\{el\.scrollHeight\}px`/);
  assert.doesNotMatch(palette, /Math\.min\(el\.scrollHeight, 200\)/);
  assert.match(source, /sessionMentionTargetsRef\.current = new Map\(Object\.entries\(draft\?\.references/);
  assert.match(source, /if \(preparingRef\.current\) return;[\s\S]*?onSend\(prepared\.text,/);
  assert.doesNotMatch(source, /onSend\(resolvedMessage/);
});

test("prepared composer sends remain single-shot and never clear a newer draft", async () => {
  const ts = (await import("typescript")).default;
  const { Script } = await import("node:vm");
  const ast = ts.createSourceFile("ChatInput.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function findSend(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "handleSend") return node.initializer.arguments[0];
    return ts.forEachChild(node, findSend);
  }
  const callback = findSend(ast);
  assert.ok(callback, "actual composer send callback is present");
  const script = new Script(ts.transpileModule(callback.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText);
  for (const scenario of ["unchanged", "edited", "switched"]) {
    let resolve;
    const preparation = new Promise((done) => { resolve = done; });
    let started;
    const preparing = new Promise((done) => { started = done; });
    const calls = [];
    let clearCount = 0;
    let prepareCount = 0;
    let draft = { value: "original" };
    const draftKeyRef = { current: "a" };
    const handler = script.runInNewContext({
      invalidDraftImages: false, orphanedPaste: false, draftKey: "a", hydratedDraftKey: "a", persistenceStatus: "saved",
      attachedFilesRef: { current: [] }, value: "original", pastedTexts: [], attachedImages: [], isStreaming: false, workspaceUnavailable: false,
      splicePastedTexts: (text) => text, dispatchBuiltin: async () => false, onBuiltinCommand: undefined,
      draftKeyRef, preparingRef: { current: false }, snapshotRef: { current: () => draft },
      setPreparationError(message) { assert.equal(message, ""); },
      prepare() { prepareCount += 1; started(); return preparation; },
      onSend(...args) { calls.push(args); }, clearInput() { clearCount += 1; },
    });
    const first = handler();
    const duplicate = handler();
    await preparing;
    assert.equal(prepareCount, 1, scenario);
    if (scenario === "edited") draft = { value: "newer input" };
    if (scenario === "switched") draftKeyRef.current = "b";
    resolve({ text: "resolved session reference", images: [] });
    await Promise.all([first, duplicate]);
    assert.equal(calls.length, scenario === "switched" ? 0 : 1, scenario);
    if (calls.length) assert.equal(calls[0][0], "resolved session reference");
    assert.equal(clearCount, scenario === "unchanged" ? 1 : 0, scenario);
  }
});

test("async text attachments revalidate limits and follow a rekey without resurrecting the old draft", async () => {
  const ts = (await import("typescript")).default;
  const { Script } = await import("node:vm");
  const ast = ts.createSourceFile("ChatInput.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let method;
  function visit(node) {
    if (ts.isMethodDeclaration(node) && node.name.getText(ast) === "addTextFiles") method = node;
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(method);
  const script = new Script(ts.transpileModule(`(async function${method.getText(ast).slice("async addTextFiles".length)})`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText);
  const pending = [];
  const refs = { current: [] };
  const key = { current: "new" };
  const aliases = { current: new Map() };
  const stored = new Map();
  const fn = script.runInNewContext({
    draftKeyRef: key, attachedFilesRef: refs, attachmentDraftAliasesRef: aliases,
    readChatTextAttachments: () => new Promise(resolve => pending.push(resolve)), extractDocxText() {},
    getDraft: k => stored.get(k), setDraft: (k, value) => stored.set(k, value),
    setAttachedFiles: files => { refs.current = files; },
    CHAT_ATTACHMENT_MAX_FILES: 5, CHAT_ATTACHMENT_MAX_TOTAL_BYTES: 512 * 1024,
  });
  const file = n => ({ id: String(n), name: `${n}.txt`, size: 100, text: "x" });
  const first = fn([]), second = fn([]);
  aliases.current.set("new", "session"); key.current = "session";
  pending[0]({ accepted: [1,2,3,4].map(file), rejected: [] });
  assert.equal((await first).length, 0);
  pending[1]({ accepted: [5,6].map(file), rejected: [] });
  assert.equal((await second)[0].reason, "too-many");
  assert.equal(refs.current.length, 5);
  assert.equal(stored.has("new"), false);
  refs.current = [{ ...file(7), size: 512 * 1024 - 10 }];
  const third = fn([]);
  pending[2]({ accepted: [file(8)], rejected: [] });
  assert.equal((await third)[0].reason, "total-too-large");
  assert.equal(refs.current.length, 1);
});
