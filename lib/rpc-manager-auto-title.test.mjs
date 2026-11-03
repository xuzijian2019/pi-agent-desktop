import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Exercise the two actual title methods without booting an SDK session or making
// model requests. Keep their async ordering: the answer can finish before the
// first-prompt title resolves.
const source = readFileSync(new URL("./rpc-manager.ts", import.meta.url), "utf8");
const first = source.slice(source.indexOf("  private async autoNameSession()"), source.indexOf("  private emit(event:"));
const after = source.slice(source.indexOf("  private autoTitleAfterRun()"), source.indexOf("  getTaskSnapshot()"));
const methods = (first + after)
  .replace(/private /g, "")
  .replace(/: Promise<void>/g, "")
  .replace(/: void/g, "")
  .replace(/let named: boolean/g, "let named")
  .replace(/ as unknown as AgentSession/g, "");

function fixture() {
  let requests = 0;
  let resolve;
  let reject;
  let name;
  let enabled = true;
  let invalidations = 0;
  const generate = () => {
    requests++;
    return new Promise((ok, fail) => { resolve = ok; reject = fail; });
  };
  const Wrapper = new Function("generateSessionTitle", "invalidateSessionListCache", "isAutoTitleEnabled", "console", `return class { ${methods} }`)(
    generate, () => invalidations++, () => enabled, { warn() {} },
  );
  const wrapper = new Wrapper();
  Object.assign(wrapper, {
    _alive: true,
    isAlive: () => wrapper._alive,
    autoNameInProgress: false,
    autoTitleAllowedForRun: true,
    autoTitleSettled: false,
    lastRunOutcome: { status: "done" },
    inner: { sessionManager: { getSessionName: () => name }, setSessionName: (next) => { name = next; } },
  });
  return {
    wrapper,
    get requests() { return requests; },
    get name() { return name; },
    get invalidations() { return invalidations; },
    resolve: () => resolve({ title: "Generated title" }),
    reject: () => reject(new Error("Provider unavailable")),
    rename: (next) => { name = next; },
    disable: () => { enabled = false; },
  };
}
const settled = () => new Promise((resolve) => setImmediate(resolve));

test("first-prompt and completed-run auto titles share one paid request", async () => {
  const f = fixture();
  const first = f.wrapper.autoNameSession();
  f.wrapper.autoTitleAfterRun();
  await f.wrapper.autoNameSession();
  assert.equal(f.requests, 1);
  f.resolve();
  await first;
  assert.equal(f.name, "Generated title");
  assert.equal(f.invalidations, 1);
  assert.equal(f.wrapper.autoNameInProgress, false);
  f.wrapper.autoTitleAfterRun();
  assert.equal(f.requests, 1);
});

test("post-run title also excludes a simultaneous first-prompt request", async () => {
  const f = fixture();
  f.wrapper.autoTitleAfterRun();
  await f.wrapper.autoNameSession();
  assert.equal(f.requests, 1);
  f.resolve();
  await settled();
  assert.equal(f.name, "Generated title");
  assert.equal(f.wrapper.autoNameInProgress, false);
});

test("explicit command opt-out wins over enabled server post-run naming", () => {
  const f = fixture();
  f.wrapper.autoTitleAllowedForRun = false;
  f.wrapper.autoTitleAfterRun();
  assert.equal(f.requests, 0);
  assert.match(source, /if \(!streamingBehavior\) this\.autoTitleAllowedForRun = command\.autoName !== false/);
  assert.match(source, /this\.autoNamePending = command\.autoName !== false/);
});

test("post-run naming still requires opt-in and a successful run", () => {
  const f = fixture();
  f.disable();
  f.wrapper.autoTitleAfterRun();
  assert.equal(f.requests, 0);
  const failed = fixture();
  failed.wrapper.lastRunOutcome = { status: "failed" };
  failed.wrapper.autoTitleAfterRun();
  assert.equal(failed.requests, 0);
});

test("failed first-prompt naming releases the guard for a later opted-in retry", async () => {
  const f = fixture();
  const first = f.wrapper.autoNameSession();
  f.reject();
  await first;
  assert.equal(f.wrapper.autoNameInProgress, false);
  f.wrapper.autoTitleAfterRun();
  assert.equal(f.requests, 2);
  f.resolve();
  await settled();
  assert.equal(f.name, "Generated title");
});

test("a user rename during either generation is never overwritten", async () => {
  for (const method of ["autoNameSession", "autoTitleAfterRun"]) {
    const f = fixture();
    const pending = f.wrapper[method]();
    f.rename("User's title");
    f.resolve();
    await pending;
    await settled();
    assert.equal(f.name, "User's title");
    assert.equal(f.invalidations, 0);
  }
});
