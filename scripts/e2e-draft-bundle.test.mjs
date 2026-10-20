import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';

test('the E2E draft store bundles its real attachment dependencies without Node globals', async () => {
  const result = await build({ entryPoints: ['lib/draft-store.ts'], bundle: true,
    platform: 'browser', format: 'iife', globalName: '__e2eDraftStore', write: false });
  // No require/module shim: this is the same restriction as page.addScriptTag.
  const sandbox = { Map, Set, Promise, structuredClone, setTimeout, clearTimeout };
  vm.runInNewContext(result.outputFiles[0].text, sandbox);
  assert.equal(typeof sandbox.__e2eDraftStore.loadDraft, 'function');
  assert.equal(typeof sandbox.__e2eDraftStore.setDraft, 'function');
  assert.equal(typeof sandbox.__e2eDraftStore.getDraftStatus, 'function');
  assert.equal(sandbox.__e2eDraftStore.getDraftStatus('fresh-context'), 'loading');
});
