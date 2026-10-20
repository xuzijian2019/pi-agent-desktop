import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
const { loadDraft, setDraft, getDraft, getDraftStatus, clearDraft, restoreDraftSubmission, rekeyDraft } = await createJiti(import.meta.url, { tsconfigPaths: true }).import("./draft-store.ts");
test("unavailable storage reports failure while retaining all input", async () => {
  await loadDraft("denied");
  assert.equal(getDraftStatus("denied"), "failed");
  const draft = { value: "[Pasted text 1 · 1 lines]", images: [{ data: "a".repeat(600_000), mimeType: "image/png" }], texts: [{ id: 1, content: "x".repeat(131_073) }] };
  setDraft("denied", draft);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(getDraftStatus("denied"), "failed");
  assert.deepEqual(getDraft("denied"), draft);
});

const file = (id, name, text) => ({ id, name, size: text.length, text });

test("attached files belong to their draft, survive hydration, and never reach IndexedDB", async () => {
  const records = new Map();
  const previousWindow = globalThis.window;
  const previousIndexedDB = globalThis.indexedDB;
  const previousChannel = globalThis.BroadcastChannel;
  globalThis.window = { localStorage: { getItem: () => null } };
  globalThis.BroadcastChannel = undefined;
  globalThis.indexedDB = {
    open() {
      const request = {};
      queueMicrotask(() => {
        request.result = {
          transaction() {
            const tx = {
              objectStore: () => ({
                get(key) {
                  const read = {};
                  queueMicrotask(() => {
                    read.result = records.get(key);
                    read.onsuccess?.();
                    queueMicrotask(() => tx.oncomplete?.());
                  });
                  return read;
                },
                put(value, key) { records.set(key, structuredClone(value)); },
              }),
              abort() { tx.onabort?.(); },
            };
            return tx;
          },
          close() {},
        };
        request.onsuccess?.();
      });
      return request;
    },
  };
  try {
    await loadDraft("chat-a");
    setDraft("chat-a", { value: "draft", images: [], files: [file("f1", "notes.md", "SECRET A")] });
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(getDraftStatus("chat-a"), "saved");
    assert.equal(getDraft("chat-b"), null);
    assert.deepEqual(getDraft("chat-a").files.map((f) => f.name), ["notes.md"]);
    assert.equal(records.get("chat-a").draft.value, "draft");
    assert.equal(JSON.stringify([...records]).includes("SECRET A"), false);
    assert.deepEqual((await loadDraft("chat-a")).files.map((f) => f.text), ["SECRET A"]);
    setDraft("chat-a", { value: "", images: [], files: [file("f1", "notes.md", "SECRET A")] });
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(records.get("chat-a").draft, null);
    assert.deepEqual((await loadDraft("chat-a")).files.map((f) => f.text), ["SECRET A"]);
    clearDraft("chat-a");
    assert.equal(getDraft("chat-a"), null);
    await new Promise((resolve) => setTimeout(resolve, 10));
  } finally {
    globalThis.window = previousWindow;
    globalThis.indexedDB = previousIndexedDB;
    globalThis.BroadcastChannel = previousChannel;
  }
});

test("a restored file submission retains task setup, references and pasted text", () => {
  const setup = { model: { provider: "test", modelId: "model" }, effort: "high", tools: "inherit" };
  const references = { foo: { id: "session-a" } };
  setDraft("chat-r", { value: "newer", images: [], setup, references, texts: [{ id: 1, content: "paste" }], files: [file("f2", "other.md", "OTHER")] });
  const message = 'look\n\n<attached_file name="a.txt">\nBODY\n</attached_file>';
  const restored = restoreDraftSubmission("chat-r", message);
  assert.equal(restored.value, "look\n\nnewer");
  assert.deepEqual(restored.files.map((f) => [f.name, f.text]), [["a.txt", "BODY"], ["other.md", "OTHER"]]);
  assert.deepEqual(restored.setup, setup);
  assert.deepEqual(restored.references, references);
  assert.deepEqual(restored.texts, [{ id: 1, content: "paste" }]);
  clearDraft("chat-r");
});

test("rekey preserves a file-only draft and merges existing destination attachments", () => {
  setDraft("chat-old", { value: "", images: [], files: [file("f1", "a.md", "A")] });
  setDraft("chat-new", { value: "new", images: [], files: [file("f2", "b.md", "B")] });
  const merged = rekeyDraft("chat-old", "chat-new");
  assert.equal(getDraft("chat-old"), null);
  assert.deepEqual(merged.files.map((f) => f.text), ["B", "A"]);
  assert.equal(merged.value, "new");
});
