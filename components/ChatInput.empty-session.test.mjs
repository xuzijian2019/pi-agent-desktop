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
const { I18nProvider } = await jiti.import("../hooks/useI18n.tsx");

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

test("existing sessions have no placeholder hints or Compact button and show a visible percentage", () => {
  const html = renderComposer({
    showInputHints: false,
    sessionStats: stats,
    contextUsage: { percent: 12, contextWindow: 200000, tokens: 24000 },
  });
  assert.match(html, /placeholder=""/);
  assert.match(html, /aria-label="Message"/);
  assert.doesNotMatch(html, /aria-label="Compact context"|Type \/ for commands|send-preview/);
  assert.match(html, /class="context-usage-percent"[^>]*>12\.0%<\/span>/);
  const usageButton = html.match(/<button[^>]*class="context-usage-ring"[^>]*>/)?.[0];
  assert.ok(usageButton);
  assert.doesNotMatch(usageButton, /\btitle=/);
  assert.match(usageButton, /aria-haspopup="dialog"/);
});

test("existing sessions with unknown context show a dash, not a misleading zero", () => {
  const html = renderComposer({ showInputHints: false, sessionStats: stats, contextUsage: { percent: null, contextWindow: 200000, tokens: null } });
  assert.match(html, /class="context-usage-percent"[^>]*>—<\/span>/);
  assert.doesNotMatch(html, />0\.0%</);
});
