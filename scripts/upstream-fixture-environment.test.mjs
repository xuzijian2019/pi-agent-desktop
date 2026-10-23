import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import test from "node:test";
import ts from "typescript";

function findNode(source, predicate) {
  function visit(node) {
    if (predicate(node)) return node;
    return ts.forEachChild(node, visit);
  }
  const node = visit(source);
  assert.ok(node);
  return node;
}

test("fixture children keep sandbox HOME but use the runner's resolved browser", async () => {
  const source = ts.createSourceFile("wrapper.ts", readFileSync(new URL("../tests/e2e/upstream-075-fixtures.spec.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  const callback = findNode(source, n => ts.isArrowFunction(n));
  const script = new Script(ts.transpileModule(`(${callback.getText(source)})`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText);
  for (const channel of [undefined, "chrome"]) {
    let call;
    const fn = script.runInNewContext({
      test: { setTimeout() {}, skip() {} }, fixture: "chat-prompt-anchor",
      process: { execPath: "/node", platform: "linux", env: { HOME: "/runner", XDG_STATE_HOME: "/private", E2E_BROWSER_EXECUTABLE: "/stale/chrome" } },
      chromium: { executablePath: () => "/runner/.cache/chromium/chrome" },
      sandboxServerEnv: () => ({ HOME: "/sandbox", XDG_CACHE_HOME: "/sandbox/.cache", PI_CODING_AGENT_DIR: "/sandbox/agent" }),
      run: async (...args) => { call = args; },
    });
    await fn({}, { project: { use: { channel } } });
    const env = call[2].env;
    assert.equal(env.HOME, "/sandbox");
    assert.equal(env.PI_CODING_AGENT_DIR, "/sandbox/agent");
    assert.equal(env.XDG_STATE_HOME, undefined);
    assert.equal(env.E2E_BROWSER_CHANNEL, channel);
    assert.equal(env.E2E_BROWSER_EXECUTABLE, channel ? undefined : "/runner/.cache/chromium/chrome");
  }
});

for (const fixture of ["chat-prompt-anchor", "composer-outbox", "option-controls", "streaming-markdown"]) {
  test(`${fixture} honors the explicit browser executable and channel`, () => {
    const source = ts.createSourceFile("fixture.js", readFileSync(new URL(`../e2e/${fixture}.mjs`, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
    const launch = findNode(source, n => ts.isCallExpression(n) && n.expression.getText(source) === "chromium.launch");
    const options = new Script(`(${launch.arguments[0].getText(source)})`);
    for (const channel of [undefined, "chrome"]) {
      const result = options.runInNewContext({ process: { platform: "linux", env: { E2E_BROWSER_EXECUTABLE: "/runner/chrome", E2E_BROWSER_CHANNEL: channel } } });
      assert.equal(result.executablePath, "/runner/chrome");
      assert.equal(result.channel, channel);
      assert.equal(result.headless, true);
    }
  });
}

test("streaming Markdown replay remains wired into the fork Playwright entry", () => {
  const source = readFileSync(new URL("../tests/e2e/upstream-075-fixtures.spec.ts", import.meta.url), "utf8");
  assert.match(source, /"streaming-markdown"/);
});

test("legacy browsers cannot eagerly import the streaming vendor", () => {
  const source = readFileSync(new URL("../components/StreamingMarkdown.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /import\s*\{[^}]*Streamdown[^}]*\}\s*from/);
  assert.match(source, /lazy\(\(\) => import\("@lobehub\/streamdown"\)/);
  assert.match(source, /reducedMotion \|\| !supportsStreamingMarkdownAnimation\(\)/);
  assert.match(source, /<Suspense fallback=\{<ReactMarkdown/);
});
