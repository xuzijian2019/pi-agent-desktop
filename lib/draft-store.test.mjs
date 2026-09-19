import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
const { loadDraft, setDraft, getDraft, getDraftStatus } = await createJiti(import.meta.url, { tsconfigPaths: true }).import("./draft-store.ts");
test("unavailable storage reports failure while retaining all input", async () => {
  await loadDraft("denied");
  assert.equal(getDraftStatus("denied"), "failed");
  const draft = { value: "[Pasted text 1 · 1 lines]", images: [{ data: "a".repeat(600_000), mimeType: "image/png" }], texts: [{ id: 1, content: "x".repeat(131_073) }] };
  setDraft("denied", draft);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(getDraftStatus("denied"), "failed");
  assert.deepEqual(getDraft("denied"), draft);
});
