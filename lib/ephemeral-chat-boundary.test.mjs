import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";
import { SessionManager } from "@earendil-works/pi-coding-agent";

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

test.after(async () => {
  for (const record of globalThis.__piEphemeralSessions?.values() ?? []) await closeEphemeral(record.id, record.ownerId);
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  rmSync(root, { recursive: true, force: true });
});

async function create(cwd) {
  const parent = SessionManager.inMemory(cwd);
  parent.appendModelChange("fixture", "fixture");
  parent.appendMessage({ role: "user", content: "Summarize this conversation.", timestamp: 1 });
  const id = parent.getSessionId();
  globalThis.__piSessions = new Map([[id, { getSnapshotSource: () => ({ manager: parent, model: { provider: "fixture", id: "fixture" } }) }]]);
  const created = await createEphemeral({ parentId: id, ownerId: id, kind: "recap" });
  return { parent, session: globalThis.__piEphemeralSessions.get(created.id).session, close: () => closeEphemeral(created.id, id) };
}


test("recap stays tool-free with no chat context or external extensions", async () => {
  for (const cwd of [folder, legacy, project]) {
    const { session, close } = await create(cwd);
    try {
      assert.deepEqual(session.getActiveToolNames(), []);
      assert.deepEqual(session.getCallableToolNames(), []);
      if (cwd !== project) assert.deepEqual(session.resourceLoader.getAgentsFiles().agentsFiles, []);
      assert.equal(existsSync(join(root, "extension-executed")), false);
      assert.equal(session.sessionManager.isPersisted(), false);
    } finally { await close(); }
  }
});

test("removed side kind is rejected before creating a runner", async () => {
  await assert.rejects(createEphemeral({ parentId: "missing", ownerId: "removed", kind: "side" }), /Only recap/);
  assert.equal(globalThis.__piEphemeralSessions?.has("removed"), false);
});
