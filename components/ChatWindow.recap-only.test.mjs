import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const { parseLocalChatCommand } = await createJiti(import.meta.url).import("../lib/local-chat-command.ts");

test("only recap is intercepted as a fork temporary command", () => {
  assert.deepEqual(parseLocalChatCommand("/recap"), { kind: "recap", question: "" });
  assert.deepEqual(parseLocalChatCommand("/RECAP extra"), { kind: "recap", question: "extra" });
  for (const text of ["/side question", "/btw question", "/side", "/btw", "hello /recap"]) {
    assert.equal(parseLocalChatCommand(text), null);
  }
});

test("removed side UI and client request paths stay absent while recap remains wired", async () => {
  const window = await read("components/ChatWindow.tsx");
  const shell = await read("components/AppShell.tsx");
  const hook = await read("hooks/useEphemeralConversation.ts");
  assert.doesNotMatch(window + shell + hook, /\b(?:SideChatPanel|sendSide|closeSide|sideModeOpen|onSideModeChange|sideRef)\b/);
  assert.match(window, /aria-label=\{t\("recap.title"\)\}/);
  assert.match(window, /onClick=\{cancelRecap\}/);
  assert.match(window, /recapBusy/);
  assert.match(hook, /recapRef\.current = operation/);
  assert.match(hook, /operation\.controller\.abort\(\)/);
  assert.match(hook, /data\.parentId === parentId/);
  assert.match(hook, /viewRef\.current === operation\.view/);
  assert.doesNotMatch(hook, /method: "PATCH"|setInterval/);
  await assert.rejects(access(new URL("./SideChatPanel.tsx", import.meta.url)), { code: "ENOENT" });
});

test("three-language fork locale no longer advertises removed side features", async () => {
  const locale = await read("lib/i18n/locale-plugins.ts");
  assert.doesNotMatch(locale, /"side\.|"chat\.commandSide"/);
  assert.equal((locale.match(/"recap\.needsSession"/g) ?? []).length, 3);
});
