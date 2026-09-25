import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8");
const inputSource = await readFile(new URL("./ChatInput.tsx", import.meta.url), "utf8");

test("the overlay composer and message list share one column axis", () => {
  assert.match(
    source,
    /Composer overlays the scrollport/,
    "the fork keeps an overlay composer rather than a sibling column that needs a scrollbar-gutter probe",
  );
  assert.match(
    source,
    /className="scrollbar-subtle min-w-0 flex-1 overflow-x-hidden overflow-y-auto pt-4"/,
  );
  assert.match(source, /scrollbarGutter: "stable both-edges"/);
  assert.match(source, /ref=\{bottomComposerRef\}/);
  assert.match(source, /className="absolute inset-x-0 bottom-0 z-20"/);
  assert.doesNotMatch(
    source,
    /scrollbarGutterProbeRef/,
    "do not re-adopt upstream's sibling-composer gutter probe into the overlay layout",
  );
  assert.doesNotMatch(
    source,
    /CHAT_MINIMAP_WIDTH/,
    "ChatMinimap stays declined; do not size the scroll-to-latest control around it",
  );
});

test("the new-session empty state keeps only the update chip above the composer", () => {
  const start = source.indexOf("{isEmptyNew ? (");
  assert.notEqual(start, -1, "the empty-session branch must still exist");
  const block = source.slice(start, source.indexOf(") : (", start));

  assert.match(block, /<NewSessionUpdateLink /, "the update chip is the empty state's only chrome");
  assert.match(block, /\{chatInputElement\}/);
  assert.doesNotMatch(block, /apple-touch-icon|PRODUCT_NAME/, "the product branding must not come back above the composer");
});

test("composer and message columns share one padding and one max width", () => {
  const columnPadding = Number(/const CHAT_COLUMN_PADDING = (\d+);/.exec(source)?.[1]);
  assert.ok(Number.isFinite(columnPadding), "CHAT_COLUMN_PADDING must be a number");
  assert.match(
    source,
    /padding: `0 \$\{CHAT_COLUMN_PADDING\}px`/,
    "the overlay composer insets the same column padding as the message list",
  );

  const maxWidth = "var(--chat-content-max-width, 820px)";
  assert.ok(
    source.split(maxWidth).length - 1 >= 2,
    "message list and overlay composer share the appearance width",
  );
  assert.equal(inputSource.split(maxWidth).length - 1, 1, "the composer shares the appearance width");
});
