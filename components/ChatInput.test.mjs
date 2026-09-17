import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const { ChatInput, ModelErrorBanner, ModelScopeWarningBanner, canRestoreUserMessage, filterModelOptions, getUserMessageText, getUserMessageDraftImages, draftTextsToPastedTexts, pastedTextsToDraftTexts } = await jiti.import("./ChatInput.tsx");
const { I18nProvider } = await jiti.import("../hooks/useI18n.tsx");

/** The banner reads its title through useI18n, so it needs the provider. */
function renderWithI18n(element) {
  return renderToStaticMarkup(React.createElement(I18nProvider, null, element));
}

test("renders the upstream model error", () => {
  const html = renderWithI18n(
    React.createElement(ModelErrorBanner, {
      error: "Invalid models.json schema:\nproviders.custom.models.0.id must not be empty",
    }),
  );

  assert.match(html, /role="alert"/);
  assert.match(html, /Model error/);
  assert.match(html, /providers\.custom\.models\.0\.id must not be empty/);
});

test("does not render an empty model error", () => {
  assert.equal(renderWithI18n(React.createElement(ModelErrorBanner, { error: null })), "");
});

test("renders enabledModels scope warnings with a dismiss control", () => {
  const html = renderWithI18n(
    React.createElement(ModelScopeWarningBanner, {
      warnings: [
        { code: "no-match", pattern: "ghost-gateway/*", message: "No models match pattern \"ghost-gateway/*\"" },
      ],
      onDismiss() {},
      dismissLabel: "Dismiss",
    }),
  );

  assert.match(html, /Model scope warning/);
  assert.match(html, /No models match pattern/);
  assert.match(html, /ghost-gateway/);
  assert.match(html, /aria-label="Dismiss"/);
  // No configure entry for plain no-match warnings.
  assert.doesNotMatch(html, /Configure providers/);
  assert.equal(renderWithI18n(React.createElement(ModelScopeWarningBanner, { warnings: [] })), "");
  assert.equal(renderWithI18n(React.createElement(ModelScopeWarningBanner)), "");
});

test("rewords unauthenticated-provider warnings and offers the configure entry (#48)", () => {
  const html = renderWithI18n(
    React.createElement(ModelScopeWarningBanner, {
      warnings: [
        {
          code: "unauthenticated-provider",
          pattern: "acme-gateway/claude-opus-4-8",
          unauthenticatedProviders: ["acme-gateway"],
          message: "No models match pattern \"acme-gateway/claude-opus-4-8\"",
        },
      ],
      onDismiss() {},
      dismissLabel: "Dismiss",
      onOpenModelsConfig() {},
    }),
  );

  assert.match(html, /has no usable credentials/);
  assert.match(html, /acme-gateway/);
  // The raw resolver message must not leak through for classified warnings.
  assert.doesNotMatch(html, /No models match pattern/);
  assert.match(html, /Configure providers/);
  assert.match(html, /aria-label="Dismiss"/);
});

test("keeps the model selector visible when a model error leaves no options", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(ChatInput, {
        onSend() {},
        onAbort() {},
        onModelChange() {},
        isStreaming: false,
        modelError: "Invalid models.json schema",
        modelList: [],
        modelNames: {},
      }),
    ),
  );

  assert.match(html, />No models</);
  assert.match(html, /title="No available models"/);
});

test("filters model options by name and id", () => {
  const options = [
    { provider: "ollama", modelId: "qwen3:latest", name: "Qwen 3" },
    { provider: "anthropic", modelId: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" },
    { provider: "openai", modelId: "gpt-5.4", name: "GPT-5.4" },
  ];

  assert.deepEqual(filterModelOptions(options, "QWEN"), [options[0]]);
  assert.deepEqual(filterModelOptions(options, "claude-sonnet"), [options[1]]);
  assert.equal(filterModelOptions(options, "OpenAI").length, 0);
  assert.equal(filterModelOptions(options, "anthropic/claude").length, 0);
  assert.equal(filterModelOptions(options, "missing").length, 0);
  assert.equal(filterModelOptions(options, "  "), options);
});

test("restores text and base64 images when editing a user message", () => {
  const message = {
    role: "user",
    content: [
      { type: "text", text: "Review this image @src/example.ts " },
      { type: "image", source: { type: "base64", media_type: "image/png", data: "AQID" } },
    ],
  };

  assert.equal(getUserMessageText(message), "Review this image @src/example.ts ");
  assert.deepEqual(getUserMessageDraftImages(message), [
    { data: "AQID", mimeType: "image/png" },
  ]);
});

test("restores legacy flat image entries when editing a user message", () => {
  const message = {
    role: "user",
    content: [
      { type: "image", data: "AQID", mimeType: "image/jpeg" },
    ],
  };

  assert.deepEqual(getUserMessageDraftImages(message), [
    { data: "AQID", mimeType: "image/jpeg" },
  ]);
});

test("does not restore a historical message over a pending image attachment", () => {
  assert.equal(canRestoreUserMessage("", 0, 0), true);
  assert.equal(canRestoreUserMessage("", 1, 0), false);
  assert.equal(canRestoreUserMessage("", 0, 1), false);
  assert.equal(canRestoreUserMessage("draft", 0, 0), false);
});

test("renders compact errors above the input as a wrapping alert", () => {
  const error = "Compaction failed: OpenAI API error (403): <html>request forbidden</html>";
  const html = renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(ChatInput, {
        onSend() {},
        onAbort() {},
        onCompact() {},
        isStreaming: false,
        compactError: error,
      }),
    ),
  );

  assert.match(html, /role="alert"/);
  assert.match(html, /Compaction failed: OpenAI API error/);
  assert.match(html, /&lt;html&gt;request forbidden&lt;\/html&gt;/);
  assert.match(html, /white-space:pre-wrap/);
  assert.ok(html.indexOf('role="alert"') < html.indexOf("<textarea"));
});

test("renders ChatInput controls with responsive container classes and accessibility labels", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(ChatInput, {
        onSend() {},
        onAbort() {},
        onCompact() {},
        isStreaming: false,
      }),
    ),
  );

  assert.match(html, /class="chat-composer"/);
  assert.match(html, /class="chat-composer-controls"/);
  assert.match(html, /aria-label="Compact context"/);
  assert.doesNotMatch(html, /completion sound/i);
});

test("draft text chips round-trip through the draft shape", () => {
  const texts = [
    { id: 1, content: "State  Recv-Q\nLISTEN 0" },
    { id: 3, content: "```\nfenced\n```" },
  ];

  const chips = draftTextsToPastedTexts(texts);
  assert.deepEqual(
    chips.map((chip) => chip.token),
    ["[Pasted text 1 · 2 lines]", "[Pasted text 3 · 3 lines]"],
  );
  assert.deepEqual(pastedTextsToDraftTexts(chips), texts);
  // Round-trip is lossless so drafts restore with identical tokens.
  assert.deepEqual(pastedTextsToDraftTexts(draftTextsToPastedTexts(texts)), texts);
});
