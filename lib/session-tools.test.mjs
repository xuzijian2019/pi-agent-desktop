import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { assertSessionToolsEditable, readSessionToolNames, saveSessionToolNames } from "./session-tools.ts";
import { PRESET_DEFAULT, PRESET_FULL } from "./tool-presets.ts";

const assistant = {
  role: "assistant", content: [{ type: "text", text: "Done" }], api: "openai-completions",
  provider: "test", model: "test", stopReason: "stop", timestamp: Date.now(),
  usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
};

for (const [mode, names] of [["default", PRESET_DEFAULT], ["full", PRESET_FULL], ["off", []]]) {
  test(`${mode} tools survive reopening, conversation navigation, and a fork`, () => {
    const directory = mkdtempSync(join(tmpdir(), "pi-session-tools-"));
    try {
      const manager = SessionManager.create(directory, directory);
      saveSessionToolNames(manager, names);
      const user = manager.appendMessage({ role: "user", content: "Hello", timestamp: Date.now() });
      manager.appendMessage(assistant);
      const reopened = SessionManager.open(manager.getSessionFile(), directory);
      assert.deepEqual(readSessionToolNames(reopened), names);
      reopened.branch(user);
      assert.deepEqual(readSessionToolNames(reopened), names);
      const fork = reopened.createBranchedSession(user);
      assert.deepEqual(readSessionToolNames(reopened), names);
      // Pi defers writing a fork with no assistant messages until its first reply.
      reopened.appendMessage(assistant);
      assert.deepEqual(readSessionToolNames(SessionManager.open(fork, directory)), names);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
}

test("new-session changes replace the saved selection without duplicate entries", () => {
  const manager = SessionManager.inMemory();
  assert.equal(readSessionToolNames(manager), undefined);
  assertSessionToolsEditable(manager);
  saveSessionToolNames(manager, PRESET_DEFAULT);
  saveSessionToolNames(manager, PRESET_FULL);
  saveSessionToolNames(manager, PRESET_FULL);
  assert.deepEqual(readSessionToolNames(manager), PRESET_FULL);
  assert.equal(manager.getEntries().length, 2);
});

test("tool changes are blocked after any conversation message, even when navigated earlier", () => {
  const manager = SessionManager.inMemory();
  saveSessionToolNames(manager, PRESET_FULL);
  const config = manager.getLeafId();
  manager.appendMessage({ role: "user", content: "Hello", timestamp: Date.now() });
  assert.throws(() => assertSessionToolsEditable(manager), /fixed after the conversation starts/);
  manager.branch(config);
  assert.throws(() => assertSessionToolsEditable(manager), /fixed after the conversation starts/);
});
