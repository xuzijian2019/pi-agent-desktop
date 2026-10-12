import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const {
  AGENT_SUMMARY_MESSAGE_TYPE,
  agentSummaryParts,
  formatRunDuration,
  parseAgentSummary,
} = await jiti.import("./cc-extension-entries.ts");
const { buildSessionContext } = await jiti.import("./session-reader.ts");

const ts = (ms) => new Date(ms).toISOString();

// Mirrors a real pi-cc-extensions transcript: the thinking-duration entry is written
// before pi persists the assistant message it describes, the run summary after it.
function sessionEntries() {
  return [
    { type: "message", id: "u1", parentId: null, timestamp: ts(1000), message: { role: "user", content: "hi", timestamp: 1000 } },
    { type: "custom", id: "d1", parentId: "u1", timestamp: ts(1500), customType: "compact-thinking-duration", data: { messageTimestamp: 2000, contentIndex: 1, durationMs: 9439 } },
    {
      type: "message", id: "a1", parentId: "d1", timestamp: ts(2000),
      message: {
        role: "assistant", timestamp: 2000,
        content: [{ type: "text", text: "before" }, { type: "thinking", thinking: "hmm" }, { type: "text", text: "done" }],
      },
    },
    { type: "custom", id: "s1", parentId: "a1", timestamp: ts(3000), customType: "agent-summary", data: { commands: 9, reads: 1, edits: 0, writes: 0, others: 8, failed: 1, durationMs: 207955 } },
  ];
}

test("annotates the thinking block the duration entry names and adds the run summary after the answer", () => {
  const context = buildSessionContext(sessionEntries(), "s1");
  assert.deepEqual(context.entryIds, ["u1", "a1", "s1"]);
  const assistant = context.messages[1];
  assert.equal(assistant.content[1].durationMs, 9439);
  assert.equal(assistant.content[0].durationMs, undefined);
  const summary = context.messages[2];
  assert.equal(summary.role, "custom");
  assert.equal(summary.customType, AGENT_SUMMARY_MESSAGE_TYPE);
  assert.equal(summary.details.commands, 9);
});

test("keeps the duration when the window starts below the entry that recorded it", () => {
  const entries = sessionEntries();
  const context = buildSessionContext(entries, "a1", { tail: 1 });
  assert.deepEqual(context.entryIds, ["a1"]);
  assert.equal(context.messages[0].content[1].durationMs, 9439);
});

test("drops malformed summaries and runs without tool activity", () => {
  const entries = sessionEntries();
  entries[3].data = { commands: "9" };
  assert.deepEqual(buildSessionContext(entries, "s1").entryIds, ["u1", "a1"]);
  entries[3].data = { commands: 0, reads: 0, edits: 0, writes: 0, others: 0, failed: 0, durationMs: 500 };
  assert.deepEqual(buildSessionContext(entries, "s1").entryIds, ["u1", "a1"]);
  assert.equal(parseAgentSummary(null), null);
  assert.equal(parseAgentSummary({ commands: -1, reads: 0, edits: 0, writes: 0, others: 0, failed: 0, durationMs: 1 }), null);
});

test("ignores duration entries that do not match a thinking block", () => {
  const entries = sessionEntries();
  entries[1].data = { messageTimestamp: 2000, contentIndex: 0, durationMs: 100 };
  const context = buildSessionContext(entries, "s1");
  assert.equal(context.messages[1].content[0].durationMs, undefined);
  assert.equal(context.messages[1].content[1].durationMs, undefined);
});

test("summary parts follow the package order and skip zero counts", () => {
  assert.deepEqual(
    agentSummaryParts({ commands: 2, reads: 0, edits: 1, writes: 0, others: 3, failed: 1, durationMs: 0 }),
    [{ key: "commands", count: 2 }, { key: "edits", count: 1 }, { key: "others", count: 3 }, { key: "failed", count: 1 }],
  );
});

test("formats run durations", () => {
  assert.equal(formatRunDuration(400), "");
  assert.equal(formatRunDuration(42_000), "42s");
  assert.equal(formatRunDuration(207_955), "3m 28s");
  assert.equal(formatRunDuration(120_000), "2m");
  assert.equal(formatRunDuration(3_900_000), "1h 5m");
});
