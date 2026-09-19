import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createJiti } from "jiti";

const sandbox = mkdtempSync(join(tmpdir(), "pi-workbench-test-"));
process.env.PI_CODING_AGENT_DIR = join(sandbox, "agent");
const jiti = createJiti(import.meta.url, { alias: { "@": join(import.meta.dirname, "..") } });
const { prepareOutgoingMessage, taskPromptFromDraft } = await jiti.import("./prepare-outgoing.ts");
const { buildPasteToken } = await jiti.import("./pasted-text.ts");
const { validateTask, saveTask, listSavedTasks, deleteTask } = await jiti.import("./saved-tasks.ts");
const { emptyTask } = await jiti.import("./task-types.ts");
const { discoverOutputs } = await jiti.import("./session-outputs.ts");
const { previewBranch, executeBranch, branchInventory } = await jiti.import("./git-branches.ts");
const { allowFileRoot } = await jiti.import("./allowed-roots.ts");
const { beginActivity, patchActivity, finishActivity, activitySnapshot } = await jiti.import("./activity.ts");

test("preparation expands only intended references, and preserves paste hash text", async () => {
  const paste = "#chosen should remain literal inside pasted code";
  const calls = [];
  const result = await prepareOutgoingMessage({ value: `Read #chosen\n${buildPasteToken(1, paste)}`, images: [], texts: [{ id: 1, content: paste }], references: { chosen: { id: "id-1", firstEntryId: "e1" } } }, async url => {
    calls.push(url); return new Response(JSON.stringify({ reference: "reference snapshot", revision: "rev1", leafId: "leaf1", truncated: true, entries: [] }));
  });
  assert.match(result.text, /Read reference snapshot/);
  assert.match(result.text, /#chosen should remain literal/);
  assert.equal(result.references[0].truncated, true);
  assert.match(calls[0], /firstEntryId=e1/);
  assert.equal(result.bytes, Buffer.byteLength(result.text));
  assert.equal(result.references[0].selection.leafId, "leaf1");
});
test("preparation fails closed for missing paste, reference failure, ambiguous title, and invalid images", async () => {
  await assert.rejects(prepareOutgoingMessage({ value: "[Pasted text 3 · 1 lines]", images: [] }), /Missing pasted/);
  await assert.rejects(prepareOutgoingMessage({ value: "#x", images: [], references: { x: { id: "1" } } }, async () => new Response("", { status: 500 })), /Unable to load/);
  await assert.rejects(prepareOutgoingMessage({ value: '#"same"', images: [] }, async () => new Response(JSON.stringify({ sessions: [{ id: "1", name: "same" }, { id: "2", name: "same" }] }))), /ambiguous/);
  await assert.rejects(prepareOutgoingMessage({ value: "hi", images: [{ data: "invalid", mimeType: "image/png" }] }), /image/);
  const literal = await prepareOutgoingMessage({ value: "!echo '#x'", images: [], references: { x: { id: "1" } } }, () => { throw new Error("should not fetch"); });
  assert.equal(literal.text, "!echo '#x'"); assert.equal(literal.command, true);
});
test("saved tasks use revisions and keep scope and settings independent from sessions", async () => {
  const input = { ...emptyTask(), name: "Review", prompt: "Review the diff", effort: "high", tools: "default" };
  const a = await saveTask(input);
  const edits = await Promise.allSettled([saveTask({ ...a, prompt: "A" }, a.id), saveTask({ ...a, prompt: "B" }, a.id)]);
  assert.equal(edits.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(edits.find(r => r.status === "rejected").reason.status, 409);
  assert.equal(listSavedTasks(null)[0].revision, 2);
  await assert.rejects(deleteTask(a.id, 1), /changed/);
  await deleteTask(a.id, 2); assert.deepEqual(listSavedTasks(null), []);
  assert.throws(() => validateTask({ ...input, prompt: "a".repeat(131073) }), /Invalid task/);
  assert.throws(() => validateTask({ ...input, tools: "exec-everything" }), /Invalid task/);
});
test("output discovery pairs successful writes and excludes reads, failed writes and arbitrary shell text", () => {
  const messages = [
    { role: "assistant", content: [{ type: "toolCall", toolCallId: "w1", toolName: "write", input: { path: "report.md" } }, { type: "toolCall", toolCallId: "w2", toolName: "write", input: { path: "failure.pdf" } }] },
    { role: "toolResult", toolCallId: "w1", content: [] },
    { role: "toolResult", toolCallId: "w2", isError: true, content: [] },
    { role: "assistant", content: [{ type: "text", text: "[Report](report.md) [Another](other/report.md)" }] },
    { role: "bashExecution", command: "echo", output: "unrelated.pdf" },
  ];
  const items = discoverOutputs("session", sandbox, messages, ["a", "b", "c", "d", "e"], "e");
  assert.equal(items.length, 2); assert.deepEqual(items.find(i => i.path.endsWith("/report.md") && !i.path.endsWith("/other/report.md")).sourceEntryIds, ["a", "d"]);
  assert.equal(new Set(items.map(i => i.id)).size, 2);
});
test("activity ignores late settlement and bounds terminal history", () => {
  beginActivity("a", "first", sandbox, "Task"); beginActivity("a", "second", sandbox, "Task"); finishActivity("a", "first", "failed");
  assert.equal(activitySnapshot().runs.find(r => r.sessionId === "a").status, "running");
  patchActivity("a", "second", { pendingInput: true, status: "waiting" });
  assert.equal(activitySnapshot().runs[0].pendingInput, true);
  finishActivity("a", "second", "stopped"); patchActivity("a", "second", { status: "running" });
  assert.equal(activitySnapshot().runs[0].status, "stopped");
  for (let i = 0; i < 103; i++) { beginActivity(`session-${i}`, `run-${i}`, sandbox, "Bounded"); finishActivity(`session-${i}`, `run-${i}`, "completed"); }
  assert.equal(activitySnapshot().runs.length, 100);
});
test("activity titles stay empty rather than falling back to the session id", () => {
  // The panel renders "Untitled session" for an empty title; a raw uuid as the
  // card heading is the bug this guards.
  beginActivity("untitled-session-id", "run-untitled", sandbox, "");
  const run = activitySnapshot().runs.find(r => r.sessionId === "untitled-session-id");
  assert.equal(run.title, "");
  // A name generated while the run is still active replaces the placeholder.
  patchActivity("untitled-session-id", "run-untitled", { title: "Named later" });
  assert.equal(activitySnapshot().runs.find(r => r.sessionId === "untitled-session-id").title, "Named later");
  finishActivity("untitled-session-id", "run-untitled", "completed");
});
test("reviewed branch operations validate real tips, dirty fingerprints, busy checkouts, and worktree collisions", async () => {
  const cwd = join(sandbox, "repo"); mkdirSync(cwd); allowFileRoot(cwd);
  const git = (...args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "-b", "main"); git("config", "user.name", "Test"); git("config", "user.email", "test@example.com"); writeFileSync(join(cwd, "file.txt"), "base\n"); git("add", "."); git("commit", "-m", "base");
  const head = git("rev-parse", "HEAD");
  let p = await previewBranch(cwd, { action: "create", location: "current", name: "feature", baseRef: "HEAD" });
  await assert.rejects(executeBranch(p.token, true, async () => true), /run is active/);
  assert.equal(git("branch", "--show-current"), "main");
  const scoped = await saveTask({ ...emptyTask(), name: "Scoped", projectRoot: realpathSync(cwd) });
  assert.ok(listSavedTasks(scoped.projectRoot).some(t => t.id === scoped.id));
  await deleteTask(scoped.id, scoped.revision);
  p = await previewBranch(cwd, { action: "create", location: "current", name: "feature", baseRef: "HEAD" });
  await executeBranch(p.token, false, async () => false); assert.equal(git("branch", "--show-current"), "feature"); assert.equal(git("rev-parse", "HEAD"), head);
  await assert.rejects(executeBranch(p.token, false, async () => false), /expired|already/);
  writeFileSync(join(cwd, "file.txt"), "dirty one\n");
  p = await previewBranch(cwd, { action: "switch", location: "current", ref: "refs/heads/main" });
  writeFileSync(join(cwd, "file.txt"), "dirty two\n");
  await assert.rejects(executeBranch(p.token, true, async () => false), /Checkout changed/);
  assert.equal(readFileSync(join(cwd, "file.txt"), "utf8"), "dirty two\n");
  p = await previewBranch(cwd, { action: "create", location: "worktree", name: "new/tree", baseRef: "refs/heads/main" });
  const result = await executeBranch(p.token, false, async () => true); assert.equal(execFileSync("git", ["-C", result.path, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(), head);
  await assert.rejects(previewBranch(cwd, { action: "create", location: "worktree", name: "new-tree" }), /already exists/);
  await assert.rejects(previewBranch(cwd, { action: "create", location: "current", name: "--bad" }), /Invalid branch/);
  assert.ok((await branchInventory(cwd)).branches.some(b => b.name === "new/tree" && b.worktree === result.path));
});

test("task capture removes references while retaining ordinary hashes and pasted instructions", () => {
  assert.equal(taskPromptFromDraft({value: 'Review #Selected #issue \"quoted\" #"Other session" <referenced-session id="x">private history</referenced-session>', images: [], references: {Selected: {id:"x"}}}), 'Review  #issue "quoted"');
});
