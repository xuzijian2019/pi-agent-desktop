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
    React.createElement(
      I18nProvider,
      null,
      React.createElement(ChatInput, {
        onSend() {},
        onAbort() {},
        onCompact() {},
        isStreaming: false,
        ...props,
      }),
    ),
  );
}

// A blank composer has nothing to compact and no context to measure; both
// controls were rendered unconditionally and only ever read as noise there.
test("a session without a transcript hides Compact and the context ring", () => {
  const html = renderComposer({});
  assert.doesNotMatch(html, /aria-label="Compact context"/);
  assert.doesNotMatch(html, /context-usage-ring|Context usage/i);
});

test("both return as soon as the session has messages", () => {
  const html = renderComposer({
    sessionStats: {
      totalMessages: 2,
      tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 24000 },
      cost: 0,
    },
    contextUsage: { percent: 12, contextWindow: 200000, tokens: 24000 },
  });
  assert.match(html, /aria-label="Compact context"/);
  assert.match(html, /12\.0% ctx/);
});
