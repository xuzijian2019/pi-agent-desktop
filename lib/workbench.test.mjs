import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createJiti } from "jiti";

const sandbox = mkdtempSync(join(tmpdir(), "pi-workbench-test-"));
process.env.PI_CODING_AGENT_DIR = join(sandbox, "agent");
const jiti = createJiti(import.meta.url, { alias: { "@": join(import.meta.dirname, "..") } });
const { prepareOutgoingMessage } = await jiti.import("./prepare-outgoing.ts");
const { buildPasteToken } = await jiti.import("./pasted-text.ts");
const { previewBranch, executeBranch, branchInventory } = await jiti.import("./git-branches.ts");
const { allowFileRoot } = await jiti.import("./allowed-roots.ts");

test("preparation expands only intended references, and preserves paste hash text", async () => {
  const paste = "#chosen should remain literal inside pasted code";
  const calls = [];
  const result = await prepareOutgoingMessage({ value: `Read #chosen\n${buildPasteToken(1, paste)}`, images: [], texts: [{ id: 1, content: paste }], references: { chosen: { id: "id-1", firstEntryId: "e1" } } }, async url => {
    calls.push(url); return new Response(JSON.stringify({ reference: "reference snapshot", revision: "rev1", leafId: "leaf1", truncated: true, entries: [] }));
  });
  assert.match(result.text, /Read reference snapshot/);
  assert.match(result.text, /#chosen should remain literal/);
  assert.match(calls[0], /firstEntryId=e1/);
  assert.deepEqual(result.images, []);
});
test("preparation fails closed for missing paste, reference failure, ambiguous title, and invalid images", async () => {
  await assert.rejects(prepareOutgoingMessage({ value: "[Pasted text 3 · 1 lines]", images: [] }), /Missing pasted/);
  await assert.rejects(prepareOutgoingMessage({ value: "#x", images: [], references: { x: { id: "1" } } }, async () => new Response("", { status: 500 })), /Unable to load/);
  await assert.rejects(prepareOutgoingMessage({ value: '#"same"', images: [] }, async () => new Response(JSON.stringify({ sessions: [{ id: "1", name: "same" }, { id: "2", name: "same" }] }))), /ambiguous/);
  await assert.rejects(prepareOutgoingMessage({ value: "hi", images: [{ data: "invalid", mimeType: "image/png" }] }), /image/);
  const literal = await prepareOutgoingMessage({ value: "!echo '#x'", images: [], references: { x: { id: "1" } } }, () => { throw new Error("should not fetch"); });
  assert.equal(literal.text, "!echo '#x'");
});
test("reviewed branch operations validate real tips, dirty fingerprints, busy checkouts, and worktree collisions", async () => {
  const cwd = join(sandbox, "repo"); mkdirSync(cwd); allowFileRoot(cwd);
  const git = (...args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "-b", "main"); git("config", "user.name", "Test"); git("config", "user.email", "test@example.com"); writeFileSync(join(cwd, "file.txt"), "base\n"); git("add", "."); git("commit", "-m", "base");
  const head = git("rev-parse", "HEAD");
  let p = await previewBranch(cwd, { action: "create", location: "current", name: "feature", baseRef: "HEAD" });
  await assert.rejects(executeBranch(p.token, true, async () => true), /run is active/);
  assert.equal(git("branch", "--show-current"), "main");
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

test("composer popovers stay above their anchor and inside the composer width", async () => {
  const { placeAboveComposer } = await jiti.import("./composer-popover.ts");
  const viewport = { width: 1440, height: 900 };
  const composer = { left: 300, right: 1100 };
  const placed = placeAboveComposer({ left: 400, top: 800 }, composer, viewport);
  assert.equal(placed.bottom, 900 - 800 + 6); // opens upward from the trigger
  assert.equal(placed.left, 400);
  assert.ok(placed.left + placed.width <= composer.right - 12);
  // A trigger near the right edge is pulled back inside the composer.
  const clamped = placeAboveComposer({ left: 1080, top: 800 }, composer, viewport);
  assert.ok(clamped.left + clamped.width <= composer.right - 12);
  assert.ok(clamped.left >= composer.left + 12);
  // A narrow phone composer shrinks the popover instead of overflowing.
  const phone = placeAboveComposer({ left: 8, top: 700 }, { left: 0, right: 375 }, { width: 375, height: 812 });
  assert.ok(phone.width <= 375 - 24);
  assert.ok(phone.left >= 12);
  // Never taller than the space above the composer.
  assert.ok(placeAboveComposer({ left: 10, top: 120 }, composer, viewport).maxHeight <= 102);
});
