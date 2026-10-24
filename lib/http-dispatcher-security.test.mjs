import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

// Run in a child: GHSA-xjj6-f33q-929c throws on an orphaned response stream
// after fetch rejects, so catching fetch in this test process is insufficient.
for (const target of ["web", "sdk"]) {
  test(`${target} dispatcher survives excessive encodings followed by an early close`, () => {
    const home = mkdtempSync(join(tmpdir(), "http-encoding-regression-"));
    const env = { ...process.env, HOME: home, PI_CODING_AGENT_DIR: join(home, "agent") };
    for (const key of ["PI_OFFLINE", "XDG_STATE_HOME", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "no_proxy", "all_proxy"]) delete env[key];
    const script = `
      import assert from 'node:assert/strict';
      import { createServer } from 'node:http';
      import { once } from 'node:events';
      import { dirname, join } from 'node:path';
      import { pathToFileURL, fileURLToPath } from 'node:url';
      import { createJiti } from 'jiti';
      const target = ${JSON.stringify(target)};
      const module = target === 'web'
        ? await createJiti(import.meta.url).import('./lib/http-dispatcher.ts')
        : await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.resolve('@earendil-works/pi-coding-agent'))), 'core/http-dispatcher.js')).href);
      module.configureHttpDispatcher();
      const server = createServer((req, res) => {
        if (req.url === '/healthy') { res.end('still alive'); return; }
        res.writeHead(200, { 'content-encoding': 'gzip,gzip,gzip,gzip,gzip,gzip', 'content-length': '100' });
        res.flushHeaders();
        setTimeout(() => res.destroy(), 20);
      });
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
      const url = 'http://127.0.0.1:' + server.address().port;
      try {
        await assert.rejects(fetch(url), error => /too many content-encodings/.test(error.cause?.message ?? ''));
        // Let the asynchronous peer close reach the response stream.
        await new Promise(resolve => setTimeout(resolve, 100));
        assert.equal(await (await fetch(url + '/healthy')).text(), 'still alive');
        console.log('encoding rejection handled; process remains healthy');
      } finally {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
      }
    `;
    try {
      const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
        cwd: new URL("../", import.meta.url), env, encoding: "utf8", timeout: 10_000,
      });
      assert.equal(result.error, undefined, result.error?.message);
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
      assert.match(result.stdout, /process remains healthy/);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
}
