import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const { userMessageKey } = await createJiti(import.meta.url).import("./prompt-recovery.ts");

function textMessage(content) {
  return { role: "user", content, timestamp: 1 };
}

test("builds stable keys for matching optimistic text messages", () => {
  assert.equal(userMessageKey(textMessage("repeat this")), userMessageKey(textMessage("repeat this")));
  assert.notEqual(userMessageKey(textMessage("first")), userMessageKey(textMessage("second")));
});

test("includes attached images in optimistic message keys", () => {
  const submitted = {
    role: "user",
    content: [
      { type: "text", text: "inspect" },
      { type: "image", source: { type: "base64", media_type: "image/png", data: "AQID" } },
    ],
    timestamp: 1,
  };
  const differentImage = {
    ...submitted,
    content: [
      { type: "text", text: "inspect" },
      { type: "image", source: { type: "base64", media_type: "image/png", data: "BAUG" } },
    ],
  };
  assert.notEqual(userMessageKey(submitted), userMessageKey(differentImage));
});

const { reconcileDeliveredUserMessage } = await createJiti(import.meta.url).import("./prompt-recovery.ts");
const systemUpdate = { role: "system", content: "", sections: { docs: "changed" }, timestamp: 2 };

test("consumes the optimistic bubble when it is still the last message", () => {
  const prev = [textMessage("hi")];
  assert.equal(reconcileDeliveredUserMessage(prev, textMessage("hi"), userMessageKey(textMessage("hi"))), prev);
});

test("consumes the optimistic bubble behind a system-prompt update pi emitted first", () => {
  // pi unshifts a role:"system" section update ahead of the user message whenever
  // the system prompt changed, so its message_end arrives before the user's.
  const prev = [textMessage("hi"), systemUpdate];
  const next = reconcileDeliveredUserMessage(prev, textMessage("hi"), userMessageKey(textMessage("hi")));
  assert.equal(next, prev);
  assert.equal(next.filter((m) => m.role === "user").length, 1);
});

test("replaces the optimistic bubble with differing delivered content, even behind a system update", () => {
  const optimistic = textMessage("/template");
  const delivered = textMessage("expanded template text");
  const next = reconcileDeliveredUserMessage([optimistic, systemUpdate], delivered, userMessageKey(optimistic));
  assert.deepEqual(next, [delivered, systemUpdate]);
});

test("appends queued deliveries once the optimistic bubble is consumed or not adjacent", () => {
  const prompt = textMessage("same");
  assert.equal(reconcileDeliveredUserMessage([prompt], textMessage("same"), null).length, 2);
  const assistant = { role: "assistant", content: [], timestamp: 3 };
  assert.equal(reconcileDeliveredUserMessage([prompt, assistant], textMessage("same"), userMessageKey(prompt)).length, 3);
});
