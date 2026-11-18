import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("ArtifactView scopes every nested markdown preview, including artifact fallbacks", async () => {
  const view = await readFile(new URL("./ArtifactView.tsx", import.meta.url), "utf8");
  const markdown = await readFile(new URL("./MarkdownBody.tsx", import.meta.url), "utf8");
  const preview = await readFile(new URL("./HtmlPreviewBlock.tsx", import.meta.url), "utf8");
  assert.match(view, /onPreviewPrompt=\{onPrompt \?\? null\}/);
  assert.match(markdown, /onPreviewPrompt === undefined \? body/);
  assert.match(markdown, /<PreviewPromptContext.Provider value=\{onPreviewPrompt\}>\{body\}<\/PreviewPromptContext.Provider>/);
  assert.match(preview, /useContext\(PreviewPromptContext\)/);
  assert.match(preview, /resolvePreviewPromptHandler\(promptOverride, conversationPrompt\)/);
});

test("calendar actions, filters and day overflow use the shared application menu", async () => {
  const calendar = await readFile(new URL("./tasks/TaskCalendar.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(calendar, /showNativeMenu/);
  assert.match(calendar, /openDomMenu\(entries, at\)/);
  assert.match(calendar, /openMenu\(entriesList,/);
  assert.match(calendar, /openMenu\(items\.map/);
});
