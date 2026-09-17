import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createJiti } from "jiti";

const storage = new Map();
globalThis.window = {
  localStorage: {
    getItem(key) { return storage.get(key) ?? null; },
    setItem(key, value) { storage.set(key, value); },
    removeItem(key) { storage.delete(key); },
  },
};

const { setDraft } = await createJiti(import.meta.url, { tsconfigPaths: true })
  .import("./draft-store.ts");

after(() => {
  delete globalThis.window;
});

test("the persistence cap keeps the most recently edited drafts", async () => {
  for (let index = 0; index < 41; index++) {
    setDraft(`session-${index}`, { value: `draft-${index}`, images: [] });
  }
  setDraft("session-0", { value: "edited-most-recently", images: [] });

  await new Promise((resolve) => setTimeout(resolve, 300));
  const persisted = JSON.parse(storage.get("pi-chat-drafts-v1"));
  assert.equal(Object.keys(persisted).length, 40);
  assert.equal(persisted["session-0"].value, "edited-most-recently");
  assert.equal(persisted["session-1"], undefined);
});

test("draft texts persist; oversize texts are dropped", async () => {
  const { getDraft } = await createJiti(import.meta.url, { tsconfigPaths: true })
    .import("./draft-store.ts");
  const oversize = "x".repeat(131_073);

  setDraft("session-texts", {
    value: "look [Pasted text 1 · 2 lines]",
    images: [],
    texts: [
      { id: 1, content: "State  Recv-Q\nLISTEN 0" },
      { id: 2, content: oversize },
    ],
  });

  await new Promise((resolve) => setTimeout(resolve, 300));
  const persisted = JSON.parse(storage.get("pi-chat-drafts-v1"));
  assert.deepEqual(persisted["session-texts"].texts, [{ id: 1, content: "State  Recv-Q\nLISTEN 0" }]);

  // The in-memory draft keeps everything; the cap only guards localStorage.
  const draft = getDraft("session-texts");
  assert.deepEqual(draft?.texts, [
    { id: 1, content: "State  Recv-Q\nLISTEN 0" },
    { id: 2, content: oversize },
  ]);
});

test("a draft holding only texts survives the empty-draft check", async () => {
  const { setDraft, getDraft } = await createJiti(import.meta.url, { tsconfigPaths: true })
    .import("./draft-store.ts");

  setDraft("session-texts-only", { value: "", images: [], texts: [{ id: 1, content: "data" }] });
  assert.ok(getDraft("session-texts-only"), "texts-only draft must not be treated as empty");
});
