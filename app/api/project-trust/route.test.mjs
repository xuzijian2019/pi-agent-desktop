import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { GET, POST } = await jiti.import("./route.ts");
const { allowFileRoot } = await jiti.import("../../../lib/file-access.ts");

function getRequest(cwd) {
  return new Request(`http://localhost/api/project-trust?cwd=${encodeURIComponent(cwd)}`);
}

function postRequest(cwd) {
  return new Request("http://localhost/api/project-trust", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cwd }),
  });
}

test("GET reports a missing directory as a benign status, not an error", async () => {
  const missing = path.join(tmpdir(), `pi-web-trust-missing-${Date.now()}`);
  const response = await GET(getRequest(missing));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.deepEqual(data, { requiresTrust: false, trusted: false, cwdMissing: true });
});

test("POST still rejects a missing directory and names the path", async () => {
  const missing = path.join(tmpdir(), `pi-web-trust-missing-${Date.now()}`);
  const response = await POST(postRequest(missing));
  assert.equal(response.status, 400);
  const data = await response.json();
  assert.match(data.error, /Directory does not exist/);
  assert.ok(data.error.includes(missing), `message should name the missing path, got: ${data.error}`);
});

test("GET returns trust status only after an existing directory is allowed", async (t) => {
  const cwd = await mkdtemp(path.join(tmpdir(), "pi-web-trust-exists-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const denied = await GET(getRequest(cwd));
  assert.equal(denied.status, 403);
  assert.deepEqual(await denied.json(), { error: "Access denied" });

  allowFileRoot(cwd);
  const response = await GET(getRequest(cwd));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.cwdMissing, undefined);
  assert.equal(typeof data.requiresTrust, "boolean");
  assert.equal(typeof data.trusted, "boolean");
});
