import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const { jsonResponse } = await jiti.import("./json-response.ts");

for (const acceptEncoding of ["gzip", "gzip;q=0, br", "gzip;q=invalid, *;q=1", "*"]) {
  test(`leaves large JSON unencoded for Next to negotiate compression (${acceptEncoding})`, async () => {
    const data = { value: "large payload ".repeat(200) };
    const response = jsonResponse(
      new Request("http://localhost/test", { headers: { "Accept-Encoding": acceptEncoding } }),
      data,
    );

    assert.equal(response.headers.get("Content-Encoding"), null);
    assert.equal(response.headers.get("Content-Type"), "application/json; charset=utf-8");
    assert.deepEqual(await response.json(), data);
  });
}

test("preserves caller status and cache/security headers while returning JSON", async () => {
  const data = { value: "large payload ".repeat(200) };
  const response = jsonResponse(
    new Request("http://localhost/test", { headers: { "Accept-Encoding": "gzip" } }),
    data,
    {
      status: 202,
      statusText: "Accepted",
      headers: {
        "Cache-Control": "no-store",
        "Vary": "Origin",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );

  assert.equal(response.status, 202);
  assert.equal(response.statusText, "Accepted");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("Vary"), "Origin");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(response.headers.get("Content-Type"), "application/json; charset=utf-8");
  assert.equal(response.headers.get("Content-Encoding"), null);
  assert.deepEqual(await response.json(), data);
});

test("leaves small JSON responses uncompressed", async () => {
  const response = jsonResponse(
    new Request("http://localhost/test", { headers: { "Accept-Encoding": "gzip" } }),
    { ok: true },
  );

  assert.equal(response.headers.get("Content-Encoding"), null);
  assert.deepEqual(await response.json(), { ok: true });
});
