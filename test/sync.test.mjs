import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { resolveConfig } from '../src/config.js';
import { syncPackage } from '../src/sync.js';

const fixturesDir = fileURLToPath(new URL('../fixtures', import.meta.url));

// A fake client that records calls and returns canned responses.
function fakeClient({ envelope, version } = {}) {
  const calls = { created: [], released: [] };
  return {
    calls,
    createVersion: (def) => {
      calls.created.push(def);
      return { version: def.version };
    },
    getPackageEnvelope: () => envelope ?? { configuration: { accountsMapping: [] }, name: 'Test', versions: [] },
    getPackageVersion: () => version ?? null,
    releaseVersion: (id, v) => {
      calls.released.push({ packageId: id, version: v });
      return null;
    }
  };
}

test('creates and releases v1.0.0 for a fresh package, with a valid POST payload', async () => {
  const client = fakeClient();
  const result = await syncPackage({
    client,
    cwd: fixturesDir,
    packageId: 'pkg-1',
    release: true,
    sourcePath: 'pkg.js'
  });

  assert.equal(result.mode, 'create');
  assert.equal(result.version, '1.0.0');
  assert.equal(result.released, true);
  assert.equal(result.added, 2);

  assert.equal(client.calls.created.length, 1);
  const def = client.calls.created[0];
  assert.equal(def.id, 'pkg-1');
  assert.equal(def.version, '1.0.0');
  assert.match(def.code, /module\.exports\s*=\s*\{add,greet\};\s*$/);
  assert.deepEqual(
    def.manifest.functions.map((f) => f.name),
    ['add', 'greet']
  );
  // editorStartIndex is emitted but inert (always 0 headless).
  assert.ok(def.manifest.functions.every((f) => f.editorStartIndex === 0));

  assert.deepEqual(client.calls.released, [{ packageId: 'pkg-1', version: '1.0.0' }]);
});

test('release:false stages an unreleased version (no release call)', async () => {
  const client = fakeClient();
  const result = await syncPackage({
    client,
    cwd: fixturesDir,
    packageId: 'pkg-1',
    release: false,
    sourcePath: 'pkg.js'
  });
  assert.equal(result.released, false);
  assert.equal(client.calls.created.length, 1);
  assert.equal(client.calls.released.length, 0);
});

test('no-op when the source already matches the baseline version', async () => {
  // First run against a fresh package to capture the exact manifest Domo would store.
  const capture = fakeClient();
  await syncPackage({ client: capture, cwd: fixturesDir, packageId: 'pkg-1', release: false, sourcePath: 'pkg.js' });
  const storedFunctions = capture.calls.created[0].manifest.functions;

  // Second run: baseline already has those functions -> nothing to sync.
  const client = fakeClient({
    envelope: { configuration: { accountsMapping: [] }, name: 'Test', versions: [{ released: null, version: '1.0.0' }] },
    version: { code: '', functions: storedFunctions }
  });
  const result = await syncPackage({
    client,
    cwd: fixturesDir,
    packageId: 'pkg-1',
    release: true,
    sourcePath: 'pkg.js'
  });
  assert.equal(result.mode, 'noop');
  assert.equal(client.calls.created.length, 0);
  assert.equal(client.calls.released.length, 0);
});

test('blocking JSDoc errors abort the sync', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ce-sync-'));
  // A syntax error makes the acorn parse fail -> a severity:"error" warning.
  writeFileSync(join(dir, 'broken.js'), 'function oops( { return 1 }\nmodule.exports = {};');
  const client = fakeClient();
  await assert.rejects(
    () => syncPackage({ client, cwd: dir, packageId: 'pkg-1', release: true, sourcePath: 'broken.js' }),
    /refusing to sync|blocking/i
  );
  assert.equal(client.calls.created.length, 0);
});

test('resolveConfig: inputs fallback (single package)', () => {
  const cfg = resolveConfig({
    cwd: tmpdir(), // no config file here
    inputs: { instance: 'acme', packageId: 'p1', release: undefined, sourcePath: 'src/x.js', token: 't' }
  });
  assert.equal(cfg.baseUrl, 'https://acme.domo.com');
  assert.equal(cfg.token, 't');
  assert.deepEqual(cfg.targets, [{ packageId: 'p1', release: true, sourcePath: 'src/x.js' }]);
});

test('resolveConfig: full base URL and missing token both handled', () => {
  const cfg = resolveConfig({
    cwd: tmpdir(),
    inputs: { instance: 'https://acme.domo.com/', packageId: 'p1', sourcePath: 'x.js', token: 't' }
  });
  assert.equal(cfg.baseUrl, 'https://acme.domo.com');
  assert.throws(() => resolveConfig({ cwd: tmpdir(), inputs: { instance: 'acme', packageId: 'p1', sourcePath: 'x.js' } }), /token/i);
});
