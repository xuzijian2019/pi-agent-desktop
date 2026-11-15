import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const { ChatInput } = await jiti.import("./ChatInput.tsx");
const { I18nProvider } = await jiti.import("@/hooks/useI18n");

function renderComposer(props) {
  return renderToStaticMarkup(
    React.createElement(I18nProvider, null, React.createElement(ChatInput, {
      onSend() {}, onAbort() {}, isStreaming: false, ...props,
    })),
  );
}

const stats = {
  totalMessages: 2,
  tokens: { input: 18000, output: 1000, cacheRead: 5000, cacheWrite: 0, total: 24000 },
  cost: 0.3,
};

test("fresh sessions keep input hints and hide usage controls", () => {
  const html = renderComposer({ showInputHints: true });
  assert.match(html, /placeholder="Message… Type \/ for commands, @ for files, # for sessions"/);
  assert.doesNotMatch(html, /aria-label="Compact context"|context-usage-ring|send-preview/);
});

test("existing sessions use the same upstream hints and clickable context ring", () => {
  const html = renderComposer({ showInputHints: false, sessionStats: stats,
    contextUsage: { percent: 12, contextWindow: 200000, tokens: 24000 }, onCompact() {} });
  assert.match(html, /placeholder="Message… Type \/ for commands, @ for files, # for sessions"/);
  assert.match(html, /aria-label="Message"/);
  assert.match(html, /aria-label="Session automation"/);
  assert.match(html, /12\.0% ctx/);
  assert.match(html, /aria-haspopup="dialog"/);
});

test("project and tool setup remain available in both new and continued sessions", () => {
  for (const showInputHints of [true, false]) {
    const html = renderComposer({ showInputHints, projectPath: "/repo/project", onSelectProject() {},
      toolPreset: "full", onToolPresetChange() {} });
    assert.match(html, /chat-project-context/);
    assert.match(html, /Change tool preset/);
    assert.match(html, />All tools<\/span>/);
  }
});

test("unknown context reports an unknown numerator rather than a misleading zero", () => {
  const html = renderComposer({ sessionStats: stats, contextUsage: { percent: null, contextWindow: 200000, tokens: null } });
  assert.match(html, /— \/ 200k/);
  assert.doesNotMatch(html, /0\.0% ctx/);
});
