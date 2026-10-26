import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// The checkout may use CRLF (Windows); normalize so the multiline
// assertions below match regardless of line endings.
const source = (await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
const inputSource = (await readFile(new URL("./ChatInput.tsx", import.meta.url), "utf8")).replace(/\r\n/g, "\n");

test("the overlay composer and message list share one column axis", () => {
  assert.match(
    source,
    /Composer overlays the scrollport/,
    "the fork keeps its overlay composer",
  );
  assert.match(
    source,
    /className="chat-scroll-container scrollbar-subtle min-w-0 flex-1 overflow-x-hidden overflow-y-scroll pt-4"/,
    "the message scrollport must always show its track, whether or not the session overflows yet",
  );
  assert.match(source, /paddingLeft: scrollbarGutter > 0 \? scrollbarGutter : undefined/);
  assert.match(source, /paddingInline: scrollbarGutter/);
  assert.match(source, /ref=\{bottomComposerRef\}/);
  assert.match(source, /className="absolute inset-x-0 bottom-0 z-20"/);
  assert.match(source, /scrollbarGutterProbeRef/);
  assert.doesNotMatch(
    source,
    /CHAT_MINIMAP_WIDTH/,
    "ChatMinimap stays declined; do not size the scroll-to-latest control around it",
  );
});

test("the new-session screen has no header row above the composer", () => {
  assert.doesNotMatch(source, /NewSessionUpdateLink|apple-touch-icon|PRODUCT_NAME/);
  assert.doesNotMatch(source, /\/api\/app-update/);
});

test("composer and message columns share one padding and one max width", () => {
  assert.match(
    source,
    /padding: "0 var\(--chat-column-padding, 16px\)"/,
    "the overlay composer insets the same column padding as the message list",
  );

  const maxWidth = "var(--chat-content-max-width, 820px)";
  assert.ok(
    source.split(maxWidth).length - 1 >= 2,
    "message list and overlay composer share the appearance width",
  );
  assert.equal(inputSource.split(maxWidth).length - 1, 1, "the composer shares the appearance width");
});

test("session controls follow the input card instead of sitting inside it", () => {
  assert.match(inputSource, /Session controls sit below the input card, not inside it\. \*\/\}\s*<\/div>\s*\{\/\* Bash mode status label/);
});


test("fork composer placeholder follows the actual responsive text line box", async () => {
  const css = (await readFile(new URL("../app/native-theme.css", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  assert.match(inputSource, /<textarea[\s\S]*?className="composer-textarea"/);
  assert.match(css, /\.chat-composer textarea \{[^}]*line-height: var\(--composer-line-height\) !important/);
  assert.match(css, /\.chat-composer textarea::placeholder \{[^}]*line-height: var\(--composer-line-height\)/);
  assert.match(css, /@media \(max-width: 640px\) \{\s*\.chat-composer \{[^}]*--composer-font-size: max\(16px, var\(--chat-content-font-size, 14px\)\);[^}]*--composer-line-height: calc\(var\(--composer-font-size\) \* 1\.5\)/);
  assert.doesNotMatch(css, /\.chat-composer \.chat-input-textarea::placeholder/, "upstream's unused class cannot carry the fork placeholder fix");
});
