import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { alias: { "@": process.cwd() }, interopDefault: true });
const { POST } = await jiti.import("./route.ts");
const itemRoute = await jiti.import("./[id]/route.ts");

function request(kind, extra = {}) {
  return new Request("http://localhost/api/ephemeral", {
    method: "POST", headers: { host: "localhost", "content-type": "application/json" },
    body: JSON.stringify({ parentId: "missing-parent", ownerId: "fixture-owner", kind, ...extra }),
  });
}

test("removed side kind and arbitrary tools cannot create a temporary runner", async () => {
  for (const req of [request("side"), request("btw"), request("recap", { tools: ["read"] })]) {
    const response = await POST(req);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "Invalid request" });
  }
});

test("recap API remains available and cancellation is the only per-item operation", async () => {
  const response = await POST(request("recap"));
  assert.equal(response.status, 404);
  assert.match((await response.json()).error, /Parent session not found/);
  assert.equal(typeof itemRoute.DELETE, "function");
  assert.equal(itemRoute.POST, undefined);
  assert.equal(itemRoute.PATCH, undefined);
});
