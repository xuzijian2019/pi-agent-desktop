import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./useAgentSession.ts", import.meta.url), "utf8");

function callbackBody(name) {
  const start = source.indexOf(`const ${name} = useCallback(`);
  assert.ok(start >= 0, `${name} not found`);
  return source.slice(start, source.indexOf("\n  }, [", start));
}

// Fork and branch switches are user actions whose failures used to end in a
// console.error only: the spinner stopped and nothing said why.
test("fork and branch-switch failures surface as error notices", () => {
  assert.match(callbackBody("handleFork"), /addNotice\(\{ type: "error", message: t\("chat\.forkFailed"/);
  assert.match(callbackBody("handleNavigate"), /addNotice\(\{ type: "error", message: t\("chat\.navigateFailed"/);
  const leafChange = callbackBody("handleLeafChange");
  assert.doesNotMatch(leafChange, /\.catch\(\(\) => \{\}\)/, "the agent-side branch sync must not fail silently");
  assert.match(leafChange, /t\("chat\.navigateFailed"/);
});
