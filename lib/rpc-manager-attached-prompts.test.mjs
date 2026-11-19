import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { AgentSession } from "@earendil-works/pi-coding-agent";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { AgentSessionWrapper } = await jiti.import("./rpc-manager.ts");
const { composeMessageWithAttachedFiles } = await jiti.import("./chat-attachments.ts");
async function waitForPrepared(prepared, count) {
  const end = Date.now() + 5000;
  while (prepared.length < count && Date.now() < end) await delay(10);
  assert.equal(prepared.length, count, "the asynchronous prompt admission must complete");
}

function setup(t) {
  const listeners = new Set();
  const prepared = [], commands = [], legacyQueues = [];
  const inner = {
    sessionId: randomUUID(), sessionFile: "", agent: { state: {} },
    isStreaming: true, isIdle: false, isBashRunning: false, isCompacting: false,
    extensionRunner: {},
    sessionManager: { getCwd: () => process.cwd(), getEntries: () => [], getSessionName: () => "Fixture session" },
    settingsManager: { getDefaultTools: () => [] },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    dispose() {}, getContextUsage: () => null,
    getSteeringMessages: () => [], getFollowUpMessages: () => [],
    // Execute the actual SDK dispatch before the model-preparation seam. It
    // must not call extension commands for an attached prompt, but must keep
    // dispatching explicit commands that have no attachment.
    prompt: AgentSession.prototype.prompt,
    async _tryExecuteExtensionCommand(text) { commands.push(text); return true; },
    async _preparePrompt(text, options) {
      prepared.push({ text, options });
      options.preflightResult?.(inner.isStreaming ? "queued" : "started");
      return undefined; // no network/provider call
    },
    async steer(text) { legacyQueues.push(["steer", text]); },
    async followUp(text) { legacyQueues.push(["followUp", text]); },
    emit(event) { for (const fn of listeners) fn(event); },
  };
  const wrapper = new AgentSessionWrapper(inner);
  wrapper.start();
  t.after(() => wrapper.destroy());
  return { inner, wrapper, prepared, commands, legacyQueues };
}
const attached = (prefix) => composeMessageWithAttachedFiles(prefix, [{ name: "Pasted text.txt", text: "/command is literal file content" }]);

test("RPC uses SDK literal admission for attached slash/skill prompts, preserving plain commands", async (t) => {
  const f = setup(t);
  for (const prefix of ["/fixture-command", "/skill:example", "!echo text"]) {
    const text = attached(prefix);
    await f.wrapper.send({ type: "prompt", message: text });
    assert.equal(f.prepared.at(-1).text, text);
    assert.equal(f.prepared.at(-1).options.expandPromptTemplates, false);
  }
  assert.deepEqual(f.commands, []);
  await f.wrapper.send({ type: "prompt", message: "/fixture-command" });
  assert.deepEqual(f.commands, ["/fixture-command"]);
  await f.wrapper.send({ type: "prompt", message: "ordinary text" });
  assert.equal(f.prepared.at(-1).options.expandPromptTemplates, undefined);
});

test("outbox send-now and legacy queue routes preserve attachment options", { timeout: 10000 }, async (t) => {
  const f = setup(t);
  const text = attached("/fixture-command");
  const item = await f.wrapper.send({ type: "queue_composer", message: text });
  await f.wrapper.send({ type: "send_composer_message", id: item.id });
  assert.equal(f.prepared.at(-1).options.streamingBehavior, "steer");
  for (const [type, behavior] of [["steer", "steer"], ["follow_up", "followUp"]]) {
    assert.equal(await f.wrapper.send({ type, message: text }), null);
    assert.equal(f.prepared.at(-1).options.streamingBehavior, behavior);
    assert.equal(f.prepared.at(-1).options.expandPromptTemplates, false);
  }
  assert.deepEqual(f.commands, []);
  assert.deepEqual(f.legacyQueues, []);
  await f.wrapper.send({ type: "steer", message: "plain steer" });
  await f.wrapper.send({ type: "follow_up", message: "plain followup" });
  assert.deepEqual(f.legacyQueues, [["steer", "plain steer"], ["followUp", "plain followup"]]);
});

test("automatic outbox delivery and compaction replay do not re-enable expansion", async (t) => {
  const f = setup(t);
  const text = attached("/fixture-command");
  await f.wrapper.send({ type: "queue_composer", message: text });
  f.inner.isStreaming = false; f.inner.isIdle = true;
  f.inner.emit({ type: "agent_settled" });
  await waitForPrepared(f.prepared, 1);
  assert.equal(f.prepared.at(-1).options.streamingBehavior, "followUp");
  assert.equal(f.prepared.at(-1).options.expandPromptTemplates, false);

  const beforeReplay = f.prepared.length;
  // SDK's actual prompt checks its abort-controller field for compaction; the
  // wrapper parks a refusal then replays through a separate prompt call site.
  f.inner._compactionAbortController = {};
  f.inner.isCompacting = true;
  await f.wrapper.send({ type: "prompt", message: text });
  f.inner._compactionAbortController = undefined;
  f.inner.isCompacting = false;
  assert.equal(f.prepared.length, beforeReplay, "compacting submission must be parked");
  f.inner.emit({ type: "compaction_end" });
  await waitForPrepared(f.prepared, beforeReplay + 1);
  assert.equal(f.prepared.at(-1).text, text);
  assert.equal(f.prepared.at(-1).options.expandPromptTemplates, false);
  assert.deepEqual(f.commands, []);
});
