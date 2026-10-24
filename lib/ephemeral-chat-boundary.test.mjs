import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { runToolCall } from "@earendil-works/pi-agent-core";

const root = mkdtempSync(join(tmpdir(), "ephemeral-chat-policy-"));
const agentDir = join(root, "agent");
const folder = join(agentDir, "chats", "fixture");
const legacy = join(agentDir, "chat-workspace");
const project = join(root, "project");
for (const cwd of [folder, legacy, project]) mkdirSync(cwd, { recursive: true });
const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
process.env.PI_CODING_AGENT_DIR = agentDir;
// A local fake model suffices to build actual SDK sessions; no prompt or network call.
writeFileSync(join(agentDir, "models.json"), JSON.stringify({ providers: { fixture: {
  api: "openai-completions", baseUrl: "http://127.0.0.1:1/v1", apiKey: "offline-test",
  models: [{ id: "fixture", contextWindow: 128000, maxTokens: 1024 }],
} } }));
writeFileSync(join(root, "outside.txt"), "OUTSIDE_SENTINEL");
writeFileSync(join(folder, "inside.txt"), "INSIDE_SENTINEL");
writeFileSync(join(folder, "AGENTS.md"), "CHAT_CONTEXT_MUST_NOT_LOAD");
mkdirSync(join(agentDir, "extensions"));
writeFileSync(join(agentDir, "extensions", "sentinel.ts"),
  `import {writeFileSync} from "node:fs"; writeFileSync(${JSON.stringify(join(root, "extension-executed"))}, "bad"); export default () => {};`);
const jiti = createJiti(import.meta.url);
const { createEphemeral, closeEphemeral } = await jiti.import("./ephemeral-session.ts");
const { appendChatUnlock } = await jiti.import("./chat-unlock.ts");

test.after(async () => {
  for (const record of globalThis.__piEphemeralSessions?.values() ?? []) await closeEphemeral(record.id, record.ownerId);
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  rmSync(root, { recursive: true, force: true });
});

async function create(cwd, kind = "side", unlocked = false) {
  const parent = SessionManager.inMemory(cwd);
  parent.appendModelChange("fixture", "fixture");
  parent.appendMessage({ role: "user", content: "Summarize this conversation.", timestamp: 1 });
  if (unlocked) appendChatUnlock(parent, true);
  const id = parent.getSessionId();
  globalThis.__piSessions = new Map([[id, { getSnapshotSource: () => ({ manager: parent, model: { provider: "fixture", id: "fixture" } }) }]]);
  const created = await createEphemeral({ parentId: id, ownerId: id, kind });
  return { parent, session: globalThis.__piEphemeralSessions.get(created.id).session, close: () => closeEphemeral(created.id, id) };
}

function call(session, name, args) {
  const toolCall = { type: "toolCall", id: "test-call", name, arguments: args };
  return runToolCall(toolCall, {
    tools: session.agent.state.tools,
    assistantMessage: { role: "assistant", content: [toolCall], timestamp: 2 },
    context: { messages: session.agent.state.messages, tools: session.agent.state.tools },
    beforeToolCall: session.agent.beforeToolCall,
    afterToolCall: session.agent.afterToolCall,
  });
}
const text = outcome => outcome.result.content.map(block => block.text ?? "").join("\n");

test("folder side uses actual SDK hooks to confine reads, even after unlock and relock", async () => {
  symlinkSync(join(root, "outside.txt"), join(folder, "escape.txt"));
  for (const unlocked of [false, true]) {
    const { parent, session, close } = await create(folder, "side", unlocked);
    try {
      assert.deepEqual(session.getActiveToolNames().sort(), ["find", "grep", "ls", "read"]);
      assert.deepEqual(session.getCallableToolNames().sort(), ["find", "grep", "ls", "read"]);
      assert.deepEqual(session.resourceLoader.getAgentsFiles().agentsFiles, []);
      const inside = await call(session, "read", { path: "inside.txt" });
      assert.equal(inside.isError, false);
      assert.match(text(inside), /INSIDE_SENTINEL/);
      for (const path of [join(root, "outside.txt"), "escape.txt", "../../../outside.txt"]) {
        const outside = await call(session, "read", { path });
        assert.equal(outside.isError, true);
        assert.doesNotMatch(text(outside), /OUTSIDE_SENTINEL/);
      }
      appendChatUnlock(parent, false);
      assert.equal((await call(session, "read", { path: join(root, "outside.txt") })).isError, true);
      assert.equal(existsSync(join(root, "extension-executed")), false);
    } finally { await close(); }
  }
});

test("legacy side and every recap stay transcript-only; project side retains read-only files", async () => {
  for (const [cwd, kind] of [[legacy, "side"], [legacy, "recap"], [folder, "recap"], [project, "recap"]]) {
    const { session, close } = await create(cwd, kind);
    try {
      assert.deepEqual(session.getActiveToolNames(), []);
      assert.deepEqual(session.getCallableToolNames(), []);
    } finally { await close(); }
  }
  const { session, close } = await create(project);
  try {
    assert.deepEqual(session.getActiveToolNames().sort(), ["find", "grep", "ls", "read"]);
    const result = await call(session, "read", { path: join(root, "outside.txt") });
    assert.equal(result.isError, false);
    assert.match(text(result), /OUTSIDE_SENTINEL/);
  } finally { await close(); }
});
