import * as core from '@actions/core';

import { resolveConfig } from './config.js';
import { createDomoClient } from './domoClient.js';
import { runSync } from './sync.js';

// Parse the optional `release` input: empty -> undefined (config decides, default
// true), otherwise a boolean. Avoids core.getBooleanInput throwing on empty.
function parseRelease(raw) {
  if (raw == null || raw === '') return undefined;
  return /^(true|1|yes)$/i.test(raw.trim());
}

async function main() {
  const inputs = {
    instance: core.getInput('instance'),
    packageId: core.getInput('package-id'),
    release: parseRelease(core.getInput('release')),
    sourcePath: core.getInput('source-path'),
    token: core.getInput('developer-token') || process.env.DOMO_DEVELOPER_TOKEN || ''
  };
  const configPath = core.getInput('config-path');

  const config = resolveConfig({ configPath, inputs });
  if (config.token) core.setSecret(config.token);
  core.info(`Domo instance: ${config.baseUrl}`);
  core.info(`Packages to sync: ${config.targets.length}`);

  const client = createDomoClient({ baseUrl: config.baseUrl, token: config.token });
  const results = await runSync({ client, cwd: process.cwd(), log: (m) => core.info(m), targets: config.targets });

  const synced = results.filter((r) => r.mode !== 'noop');
  const released = synced.filter((r) => r.released);
  core.setOutput('results', JSON.stringify(results));
  core.setOutput('versions', synced.map((r) => `${r.packageId}@${r.version}`).join(','));
  core.info(`Done. ${synced.length} synced (${released.length} released), ${results.length - synced.length} unchanged.`);
}

main().catch((err) => {
  if (Array.isArray(err?.partialResults) && err.partialResults.length) {
    core.setOutput('results', JSON.stringify(err.partialResults));
  }
  core.setFailed(err?.message || String(err));
});
