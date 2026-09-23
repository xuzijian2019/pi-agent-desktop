import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const chatWindow = await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8");
const chatInput = await readFile(new URL("./ChatInput.tsx", import.meta.url), "utf8");
const settingsPanel = await readFile(new URL("./SettingsPanel.tsx", import.meta.url), "utf8");
const globals = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const chatAppearanceHook = await readFile(new URL("../hooks/useChatAppearance.ts", import.meta.url), "utf8");
const jiti = createJiti(import.meta.url);
const { clampChatContentWidth, clampChatContentFontSize } = await jiti.import("../hooks/useChatAppearance.ts");

const widthVariable = /var\(--chat-content-max-width, 820px\)/g;

test("chat content keeps the existing 820px default behind one shared variable", async () => {
  assert.ok((chatWindow.match(widthVariable) ?? []).length >= 2);
  assert.ok((chatInput.match(widthVariable) ?? []).length >= 1);
  assert.match(globals, /--chat-content-max-width: 820px;/);
  assert.doesNotMatch(chatWindow, /max-w-\[820px\]|maxWidth: 820/);
});

test("General chat settings own the chat width preference", () => {
  assert.match(chatInput, /useChatAppearance\(\)/);
  assert.match(settingsPanel, /useChatAppearance\(\)/);
  assert.match(settingsPanel, /type="range"/);
  assert.match(settingsPanel, /min=\{CHAT_CONTENT_WIDTH_MIN\}/);
  assert.match(settingsPanel, /max=\{CHAT_CONTENT_WIDTH_MAX\}/);
  assert.match(settingsPanel, /step=\{10\}/);
  assert.match(chatAppearanceHook, /pi-chat-content-width/);
  assert.match(chatAppearanceHook, /localStorage\.setItem/);
});

test("chat width validation preserves the default and supported range", () => {
  assert.equal(clampChatContentWidth(undefined), 820);
  assert.equal(clampChatContentWidth("invalid"), 820);
  assert.equal(clampChatContentWidth(700), 820);
  assert.equal(clampChatContentWidth(1104), 1104);
  assert.equal(clampChatContentWidth(2400), 2000);
});

test("chat font size preserves the default and bounds stored or supplied values", () => {
  for (const value of [undefined, null, "invalid", Infinity, NaN]) {
    assert.equal(clampChatContentFontSize(value), 14);
  }
  assert.equal(clampChatContentFontSize(8), 12);
  assert.equal(clampChatContentFontSize("18"), 18);
  assert.equal(clampChatContentFontSize(18.7), 19);
  assert.equal(clampChatContentFontSize(30), 24);
});

test("markdown tables wrap to the chat width instead of running on one line", async () => {
  const nativeTheme = await readFile(new URL("../app/native-theme.css", import.meta.url), "utf8");
  // globals.css (upstream) keeps `width: max-content`, and native-theme.css must override it.
  // With max-content, cells never wrap, so a table of sentences scrolls past any chat width.
  assert.match(nativeTheme, /\.markdown-table-wrap > table \{ width: auto; \}/);
  // Cells keep tokens whole (`anywhere` shrinks columns to one character, #649) and keep
  // a minimum width so prose/CJK columns are not starved by long-token columns.
  const cellRule = nativeTheme.match(/\.markdown-table-wrap :is\(th, td\) \{([^}]*)\}/)?.[1] ?? "";
  assert.match(cellRule, /overflow-wrap: normal;/);
  assert.match(cellRule, /word-break: normal;/);
  assert.match(cellRule, /min-width: \d+(\.\d+)?em;/);
  const baseCellRule = nativeTheme.match(/\.markdown-body th, \.markdown-body td \{([^}]*)\}/)?.[1] ?? "";
  assert.doesNotMatch(baseCellRule, /overflow-wrap: anywhere/);
});
