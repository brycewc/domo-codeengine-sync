import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Resolve run configuration. A committed config file (domo-codeengine.json) is
// preferred and supports multiple packages; single-package inputs are the
// fallback. The developer token always comes from a secret/env, never the file.
//
// Config file shape (either form):
//   { "instance": "acme", "packages": [ { "packageId": "...", "sourcePath": "src/pkg.js", "release": true } ] }
//   { "instance": "acme", "packageId": "...", "sourcePath": "src/pkg.js", "release": true }
export function resolveConfig({ configPath = '', cwd = process.cwd(), inputs = {} }) {
  const token = inputs.token;
  if (!token) throw new Error('Missing Domo developer token (set the DOMO_DEVELOPER_TOKEN secret / env).');

  let instance = inputs.instance || '';
  let targets = [];

  const file = configPath ? resolve(cwd, configPath) : resolve(cwd, 'domo-codeengine.json');
  if (existsSync(file)) {
    let cfg;
    try {
      cfg = JSON.parse(readFileSync(file, 'utf8'));
    } catch (err) {
      throw new Error(`Failed to parse config file ${file}: ${err.message}`);
    }
    instance = cfg.instance || instance;
    const list = Array.isArray(cfg.packages) ? cfg.packages : cfg.packageId ? [cfg] : [];
    targets = list.map((p) => ({
      packageId: p.packageId,
      release: p.release ?? cfg.release ?? true,
      sourcePath: p.sourcePath
    }));
  }

  if (targets.length === 0) {
    if (!inputs.packageId || !inputs.sourcePath) {
      throw new Error(
        'No packages to sync. Provide a domo-codeengine.json config file, or the package-id and source-path inputs.'
      );
    }
    targets = [{ packageId: inputs.packageId, release: inputs.release ?? true, sourcePath: inputs.sourcePath }];
  }

  if (!instance) throw new Error('Missing Domo instance (e.g. "acme" for acme.domo.com), set it in the config or inputs.');
  const baseUrl = /^https?:\/\//i.test(instance) ? instance.replace(/\/+$/, '') : `https://${instance}.domo.com`;

  for (const t of targets) {
    if (!t.packageId) throw new Error('A package target is missing packageId.');
    if (!t.sourcePath) throw new Error(`Package ${t.packageId} is missing sourcePath.`);
    t.release = t.release !== false; // normalize to boolean, default true
  }

  return { baseUrl, instance, targets, token };
}
