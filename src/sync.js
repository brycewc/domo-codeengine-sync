import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  appendModuleExports,
  extractFunctionNames,
  findVersionForBaseline,
  parseSourceToManifest,
  preparePackagePayload,
  resolveTargetVersion
} from 'domo-codeengine-manifest';

// Sync one package: read its source, diff against the current baseline version,
// and (if anything changed) POST a new version, optionally releasing it. Mirrors
// the extension's loadData + handleSync, headlessly.
export async function syncPackage({ client, cwd = process.cwd(), log = () => {}, packageId, release = true, sourcePath }) {
  const code = readFileSync(resolve(cwd, sourcePath), 'utf8');

  const envelope = await client.getPackageEnvelope(packageId);
  const label = envelope?.name || packageId;

  const target = resolveTargetVersion({ versions: envelope?.versions });
  const baseline = findVersionForBaseline(envelope?.versions, target.version);
  let baseVersion = null;
  if (baseline?.version) {
    try {
      baseVersion = await client.getPackageVersion(packageId, baseline.version);
    } catch (err) {
      log(`  warning: could not fetch baseline v${baseline.version} (${err.message}); treating all functions as new`);
    }
  }

  const parsed = parseSourceToManifest(code, baseVersion?.functions || [], {});
  const errors = parsed.warnings.filter((w) => w.severity === 'error');
  if (errors.length) {
    const detail = errors.map((e) => `    - ${e.functionName ? `${e.functionName}: ` : ''}${e.message}`).join('\n');
    throw new Error(`Blocking JSDoc errors in ${sourcePath}, refusing to sync ${label}:\n${detail}`);
  }

  const added = parsed.decisions.filter((d) => d.action === 'added').length;
  const updated = parsed.decisions.filter((d) => d.action === 'updated').length;
  const rewrites = parsed.jsdocRewrites?.length || 0;

  if (added === 0 && updated === 0 && rewrites === 0) {
    log(`  ${label}: already up to date, nothing to sync`);
    return { added: 0, mode: 'noop', packageId, released: false, updated: 0, version: null, warnings: warningCount(parsed) };
  }

  const functionNames = extractFunctionNames(code);
  const definition = preparePackagePayload({
    baseVersion,
    // Domo's IDE strips the trailing module.exports on load and regenerates it on
    // save; reattach it so the runtime can resolve every function by name.
    code: appendModuleExports(parsed.reconciledSource, functionNames),
    existingDefinition: envelope,
    manifestFunctions: parsed.mergedFunctions,
    newVersion: target.version,
    packageId
  });

  await client.createVersion(definition);
  log(`  ${label}: ${target.mode === 'overwrite' ? 'saved to' : 'created'} v${target.version} (+${added} added, ~${updated} updated${rewrites ? `, ${rewrites} JSDoc rewrite(s)` : ''})`);

  let released = false;
  if (release) {
    await client.releaseVersion(packageId, target.version);
    released = true;
    log(`  ${label}: released v${target.version}`);
  } else {
    log(`  ${label}: left v${target.version} unreleased (release: false)`);
  }

  return { added, mode: target.mode, packageId, released, updated, version: target.version, warnings: warningCount(parsed) };
}

// Sync every configured package in sequence. One package's failure aborts the run
// (a partial deploy is worse than a clear failure); results so far are attached.
export async function runSync({ client, cwd = process.cwd(), log = () => {}, targets }) {
  const results = [];
  for (const t of targets) {
    log(`Syncing ${t.packageId} from ${t.sourcePath}...`);
    try {
      results.push(await syncPackage({ client, cwd, log, ...t }));
    } catch (err) {
      err.partialResults = results;
      throw err;
    }
  }
  return results;
}

function warningCount(parsed) {
  return (parsed.warnings || []).filter((w) => w.severity !== 'error').length;
}
