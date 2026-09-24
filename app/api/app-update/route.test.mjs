import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  alias: { "@": process.cwd() },
  interopDefault: true,
});
const { GET } = await jiti.import("./route.ts");

test("invalidates a hot-reload cache created for a different app version", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalCache = globalThis.__piWebAppUpdateCache;
  t.after(() => {
    globalThis.fetch = originalFetch;
    globalThis.__piWebAppUpdateCache = originalCache;
  });

  globalThis.__piWebAppUpdateCache = {
    currentVersion: "0.0.0",
    value: {
      currentVersion: "0.0.0",
      latestVersion: "0.9.1",
      updateAvailable: true,
      releaseUrl: "https://github.com/agegr/pi-web/releases/tag/v0.9.1",
    },
    expiresAt: Date.now() + 60_000,
  };
  globalThis.fetch = async () => new Response(JSON.stringify({ version: "0.9.1" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

  const response = await GET();
  const body = await response.json();

  assert.equal(body.currentVersion, "0.10.0");
  assert.equal(body.latestVersion, "0.9.1");
  assert.equal(body.updateAvailable, false);
  assert.equal(globalThis.__piWebAppUpdateCache.currentVersion, "0.10.0");
});
