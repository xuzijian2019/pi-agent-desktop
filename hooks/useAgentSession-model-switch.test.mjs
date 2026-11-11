import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("./useAgentSession.ts", import.meta.url), "utf8");
const start = source.indexOf("  const handleModelChange = useCallback");
const end = source.indexOf("  const handleCompact = useCallback", start);
const callback = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function fixture(running = true) {
  let resolve;
  const selected = new Promise((done) => { resolve = done; });
  const calls = { live: [], loads: [], sync: [], notices: [], switching: [] };
  const env = {
    useCallback: (fn) => fn,
    isNew: false,
    sessionIdRef: { current: "a" },
    sessionGenerationRef: { current: 1 },
    sessionHookMountedRef: { current: true },
    modelSwitchPendingRef: { current: false },
    currentModelOverride: null,
    agentRunningRef: { current: running },
    bashRunningRef: { current: false },
    setCurrentModelOverride() {},
    setModelSwitching: (value) => calls.switching.push(value),
    setLiveModel: (value) => calls.live.push(value),
    setNewSessionModel() {},
    sendAgentCommand: () => selected,
    loadSession: async (...args) => calls.loads.push(args),
    syncLiveModel: (value) => calls.sync.push(value),
    addNotice: (value) => calls.notices.push(value),
    fetch: async () => ({ ok: true, json: async () => ({ state: { model: { provider: "p", id: "new" } } }) }),
    console,
  };
  const change = runInNewContext(`${callback}\nhandleModelChange`, env);
  return { env, calls, change, resolve: () => resolve({ provider: "p", id: "new" }) };
}

test("a mid-run model switch refreshes live settings without replacing streaming messages", async () => {
  const f = fixture();
  const pending = f.change("p", "new");
  f.resolve();
  await pending;
  assert.equal(f.calls.live.length, 1);
  assert.equal(f.calls.sync.length, 1);
  assert.equal(f.calls.loads.length, 0);
  assert.equal(f.env.modelSwitchPendingRef.current, false);
});

test("an idle model switch reloads canonical session state", async () => {
  const f = fixture(false);
  const pending = f.change("p", "new");
  f.resolve();
  await pending;
  assert.equal(f.calls.loads.length, 1);
  assert.equal(f.calls.loads[0][0], "a");
  assert.equal(f.calls.sync.length, 0);
});

test("a slow switch from an earlier A view cannot mutate a later A view after A-B-A", async () => {
  const f = fixture();
  const pending = f.change("p", "new");
  f.env.sessionGenerationRef.current += 2;
  // The newer view may already have its own switch pending.
  f.env.modelSwitchPendingRef.current = true;
  f.resolve();
  await pending;
  assert.equal(f.calls.live.length, 0);
  assert.equal(f.calls.loads.length, 0);
  assert.equal(f.calls.sync.length, 0);
  assert.equal(f.env.modelSwitchPendingRef.current, true);
  assert.deepEqual(f.calls.switching, [true]);
});
