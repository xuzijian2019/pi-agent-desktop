import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { openSessionManager, buildSessionContext, invalidateSessionManagerCache } = await jiti.import("./session-reader.ts");

test("large-session fast path preserves fork thinking durations and summaries without rewriting source data", () => {
  const dir = mkdtempSync(join(tmpdir(), "slim-fork-"));
  const file = join(dir, "session.jsonl");
  const timestamp = new Date(2000).toISOString();
  const entry = (id, parentId, fields) => ({ id, parentId, timestamp, ...fields });
  const entries = [
    { type: "session", version: 3, id: "slim-fork", timestamp, cwd: dir },
    entry("u", null, { type: "message", message: { role: "user", content: "inspect", timestamp: 1000 } }),
    entry("t", "u", { type: "message", message: { role: "toolResult", toolCallId: "call", toolName: "browser", content: [{ type: "text", text: "done" }], details: { outline: "x".repeat(17 * 1024 * 1024) }, isError: false, timestamp: 1500 } }),
    entry("d", "t", { type: "custom", customType: "compact-thinking-duration", data: { messageTimestamp: 2000, contentIndex: 0, durationMs: 9439 } }),
    entry("a", "d", { type: "message", message: { role: "assistant", content: [{ type: "thinking", thinking: "hmm" }, { type: "text", text: "done" }], timestamp: 2000 } }),
    entry("s", "a", { type: "custom", customType: "agent-summary", data: { commands: 1, reads: 0, edits: 0, writes: 0, others: 0, failed: 0, durationMs: 1200 } }),
  ];
  try {
    writeFileSync(file, entries.map(value => JSON.stringify(value)).join("\n") + "\n");
    const original = readFileSync(file);
    const view = openSessionManager(file);
    assert.equal(view.getEntry("t").message.details, undefined);
    const context = buildSessionContext(view.getEntries(), "s");
    assert.deepEqual(context.entryIds, ["u", "t", "a", "s"]);
    assert.equal(context.messages[2].content[0].durationMs, 9439);
    assert.equal(context.messages[3].details.commands, 1);
    view.appendCustomEntry("read-only-test", {});
    assert.deepEqual(readFileSync(file), original);
    // Editing/forking callers must still get the unslimmed authoritative file.
    const mutable = openSessionManager(file, { mutable: true });
    assert.equal(mutable.getEntry("t").message.details.outline.length, 17 * 1024 * 1024);
    assert.equal(mutable.getEntries().some(value => value.customType === "read-only-test"), false);
  } finally {
    invalidateSessionManagerCache(file);
    rmSync(dir, { recursive: true, force: true });
  }
});
