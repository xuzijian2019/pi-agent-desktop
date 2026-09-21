import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createJiti } from "jiti";

const source = readFileSync(new URL("./ChatInput.tsx", import.meta.url), "utf8");

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { ChatInput } = await jiti.import("./ChatInput.tsx");
const { I18nProvider } = await jiti.import("@/hooks/useI18n");

function render(props) {
  return renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(ChatInput, {
        onSend() {},
        onAbort() {},
        isStreaming: false,
        onSetAutomation() {},
        ...props,
      }),
    ),
  );
}



// The fork's simplified composer renders no automation gear and keeps Stop
// in its own control slot, so the upstream gear/narrow-Stop render tests are
// intentionally absent here; the server/hook command surface is still pinned.


test("server supports the automation command set end to end", () => {
  const rpc = readFileSync(new URL("../lib/rpc-manager.ts", import.meta.url), "utf8");
  for (const cmd of ["set_auto_compaction", "set_auto_retry", "set_steering_mode", "set_follow_up_mode", "abort_retry"]) {
    assert.match(rpc, new RegExp(`case "${cmd}"`), cmd);
  }
  assert.match(rpc, /steeringMode: this\.inner\.steeringMode/);
  assert.match(rpc, /followUpMode: this\.inner\.followUpMode/);
  const hook = readFileSync(new URL("../hooks/useAgentSession.ts", import.meta.url), "utf8");
  assert.match(hook, /type: "set_auto_compaction", enabled: change\.autoCompaction/);
  assert.match(hook, /type: "set_steering_mode", mode: change\.steeringMode/);
});
