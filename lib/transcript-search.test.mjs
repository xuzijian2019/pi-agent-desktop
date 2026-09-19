import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJiti } from "jiti";
process.env.PI_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "pi-search-test-"));
const jiti = createJiti(import.meta.url, { alias: { "@": join(import.meta.dirname, "..") } });
const { searchTerms, matchesTranscript, transcriptSnippet, transcriptDocuments, searchTranscripts } = await jiti.import("./transcript-search.ts");
test("transcript queries match literal terms and quoted phrases without executing regex", () => {
  assert.deepEqual(searchTerms('OAuth "bad token" [error]'), ["oauth", "bad token", "[error]"]);
  assert.equal(matchesTranscript("[error] BAD TOKEN from OAuth", searchTerms('oauth "bad token" [error]')), true);
  assert.equal(matchesTranscript("token was bad", searchTerms('"bad token"')), false);
  assert.equal(matchesTranscript("anything", []), false);
  assert.match(transcriptSnippet("x".repeat(200) + "OAuth failure" + "z".repeat(400), ["oauth"]), /OAuth failure/);
});
test("index includes inactive branch arguments and paired output but excludes images and thinking", () => {
  const docs = transcriptDocuments([
    { id: "u", parentId: null, type: "message", message: { role: "user", content: "Investigate login" } },
    { id: "a", parentId: "u", type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: "call", name: "bash", arguments: { command: "curl auth.local" } }, { type: "thinking", thinking: "private thought" }] } },
    { id: "r", parentId: "a", type: "message", message: { role: "toolResult", toolCallId: "call", content: [{ type: "text", text: "OAuth token error" }, { type: "image", data: "not searchable" }] } },
    { id: "b", parentId: "u", type: "message", message: { role: "assistant", content: [{ type: "text", text: "Other branch answer" }] } },
    { id: "bash", parentId: "b", type: "message", message: { role: "bashExecution", command: "git status", output: "clean" } },
  ]);
  assert.ok(docs.some(d => d.kind === "tool_arguments" && d.text.includes("curl auth.local")));
  assert.equal(docs.find(d => d.entryId === "r").displayEntryId, "a");
  assert.ok(docs.some(d => d.text === "Other branch answer"));
  assert.ok(docs.some(d => d.kind === "command" && d.text === "git status"));
  assert.ok(!docs.some(d => /private thought|not searchable/.test(d.text)));
});
test("search rejects unbounded queries and invalid cursors", async () => {
  await assert.rejects(searchTranscripts("x".repeat(257), null, null, null, new AbortController().signal), /256/);
  await assert.rejects(searchTranscripts("hello", null, null, "invalid", new AbortController().signal), /cursor/);
});

test("search paginates and filters, reindexes rewritten files, and rejects stale result identities", async () => {
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const { randomUUID } = await import("node:crypto");
  const { invalidateSessionListCache } = await jiti.import("./session-reader.ts");
  const { validateTranscriptResult } = await jiti.import("./transcript-search.ts");
  const cwd = join(process.env.PI_CODING_AGENT_DIR, "project"); mkdirSync(cwd);
  const dir = join(process.env.PI_CODING_AGENT_DIR, "sessions", "fixture"); mkdirSync(dir, { recursive: true });
  const id = randomUUID(); const timestamp = new Date().toISOString(); const file = join(dir, `fixture_${id}.jsonl`);
  const entries = [{ type: "session", version: 3, id, cwd, timestamp }, ...Array.from({ length: 61 }, (_, i) => ({ type: "message", id: `entry-${i}`, parentId: i ? `entry-${i - 1}` : null, timestamp, message: { role: "user", content: `OAuth match ${i}`, timestamp: Date.now() } }))];
  entries.push({ type: "compaction", id: "compact", parentId: "entry-60", timestamp, summary: "Compressed history", firstKeptEntryId: "entry-60", tokensBefore: 20000 });
  const save = () => writeFileSync(file, entries.map(e => JSON.stringify(e)).join("\n") + "\n"); save(); invalidateSessionListCache();
  const signal = new AbortController().signal;
  const first = await searchTranscripts("OAuth", null, id, null, signal);
  assert.equal(first.results.length, 50); assert.ok(first.nextCursor);
  const second = await searchTranscripts("OAuth", null, id, first.nextCursor, signal);
  assert.equal(second.results.length, 11); assert.equal(second.nextCursor, null);
  assert.equal((await searchTranscripts("OAuth", "unrelated-project", null, null, signal)).results.length, 0);
  const hit = await validateTranscriptResult(id, "entry-0", "text", "OAuth");
  assert.deepEqual(hit.target.context.entryIds, ["entry-0"]);
  entries[1].message.content = "Changed to a completely different result"; save();
  await assert.rejects(searchTranscripts("OAuth", null, id, first.nextCursor, signal), /changed/);
  await assert.rejects(validateTranscriptResult(id, "entry-0", "text", "OAuth"), /changed/);
  assert.equal((await searchTranscripts("OAuth", null, id, null, signal)).results[0].entryId, "entry-1");
});
