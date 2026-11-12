import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = async (file) => (await readFile(new URL(file, import.meta.url), "utf8")).replace(/\r\n/g, "\n");
// Upstream C1 is deliberately declined: this fork removed side-chat UI and
// keeps recap plus quote-to-new-chat. Guard the merge against resurrecting it.
test("upstream persistent side-chat entries stay absent in the recap-only fork", async () => {
  const [shell, chat, input, hook] = await Promise.all([
    read("./AppShell.tsx"), read("./ChatWindow.tsx"), read("./ChatInput.tsx"), read("../hooks/useAgentSession.ts"),
  ]);
  assert.doesNotMatch(shell + chat + input + hook, /\b(?:onSideSession|startSideChat|SessionChatPanel|askInSideChat|activeSideTab)\b/);
  assert.doesNotMatch(input, /name: "side"|name: "side-chat"/);
  assert.match(chat, /onAskInNewChat\([\s\S]*?sourceSessionId,[\s\S]*?quotedSelection\.sourceEntryId/);
  assert.match(chat, /useEphemeralConversation/);
  assert.match(chat, /cancelRecap/);
});
