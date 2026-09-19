import test from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { SessionManager } from "@earendil-works/pi-coding-agent";

const jiti = createJiti(import.meta.url, { interopDefault: true });
const { protocolSafePrefix } = await jiti.import("./ephemeral-session.ts");
const { parseLocalChatCommand } = await jiti.import("./local-chat-command.ts");

const message = (id, parentId, value) => ({ type: "message", id, parentId, timestamp: new Date().toISOString(), message: value });

test("in-memory snapshots get a fresh identity without mutating the selected parent branch", () => {
  const parent = SessionManager.inMemory("/tmp", { id: "parent" });
  const first = parent.appendMessage({ role: "user", content: "hello", timestamp: Date.now() });
  const leaf = parent.appendCompaction("summary", first, 100);
  const entries = structuredClone(parent.getBranch(leaf));
  const child = SessionManager.inMemory("/tmp", undefined, entries);
  child.appendCustomMessageEntry("boundary", "reference only", false);
  assert.notEqual(child.getSessionId(), parent.getSessionId());
  assert.equal(parent.getLeafId(), leaf);
  assert.equal(parent.getEntries().length, 2);
  assert.equal(child.buildSessionContext().messages.some((item) => item.role === "compactionSummary"), true);
  assert.equal(child.isPersisted(), false);
});

test("protocol-safe snapshots discard an unmatched trailing tool group", () => {
  const entries = [
    message("u", null, { role: "user", content: "inspect", timestamp: 1 }),
    message("a", "u", { role: "assistant", content: [{ type: "toolCall", id: "call", name: "read", arguments: {} }], timestamp: 2 }),
  ];
  assert.deepEqual(protocolSafePrefix(entries), [entries[0]]);
  const completed = [...entries, message("r", "a", { role: "toolResult", toolCallId: "call", toolName: "read", content: [{ type: "text", text: "ok" }], isError: false, timestamp: 3 })];
  assert.equal(protocolSafePrefix(completed).length, 3);
  assert.notEqual(protocolSafePrefix(completed)[0], completed[0]);
  const orphan = message("orphan", "r", { role: "toolResult", toolCallId: "missing", content: [], timestamp: 4 });
  assert.deepEqual(protocolSafePrefix([...completed, orphan]), completed);
  const aborted = message("aborted", "r", { role: "assistant", content: [], stopReason: "aborted", timestamp: 5 });
  assert.deepEqual(protocolSafePrefix([...completed, aborted]), completed);
  assert.deepEqual(protocolSafePrefix([...entries, aborted]), [entries[0]]);
});

test("side, btw and recap are parsed locally with strict argument boundaries", () => {
  assert.deepEqual(parseLocalChatCommand("/side why?"), { kind: "side", question: "why?" });
  assert.deepEqual(parseLocalChatCommand("/btw   为什么？"), { kind: "side", question: "为什么？" });
  assert.deepEqual(parseLocalChatCommand("/recap"), { kind: "recap", question: "" });
  assert.equal(parseLocalChatCommand("/sideways no"), null);
  assert.equal(parseLocalChatCommand("hello /recap"), null);
});
