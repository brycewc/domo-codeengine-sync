#!/usr/bin/env node
// Standalone CLI (no GitHub Actions runtime). Same orchestrator as the action.
//
// Usage:
//   DOMO_DEVELOPER_TOKEN=... domo-codeengine-sync \
//     --instance acme --package-id <uuid> --source-path src/pkg.js [--no-release]
//   DOMO_DEVELOPER_TOKEN=... domo-codeengine-sync --config domo-codeengine.json
//
// Reads a domo-codeengine.json in the cwd by default; flags fill in single-package mode.

import { resolveConfig } from '../src/config.js';
import { createDomoClient } from '../src/domoClient.js';
import { runSync } from '../src/sync.js';

function parseArgs(argv) {
  const args = { flags: {}, release: undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--no-release') args.release = false;
    else if (a === '--release') args.release = true;
    else if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      args.flags[key] = val;
    }
  }
  return args;
}

async function main() {
  const { flags, release } = parseArgs(process.argv.slice(2));
  const inputs = {
    instance: flags.instance || process.env.DOMO_INSTANCE || '',
    packageId: flags['package-id'] || '',
    release,
    sourcePath: flags['source-path'] || '',
    token: flags['developer-token'] || process.env.DOMO_DEVELOPER_TOKEN || ''
  };

  const config = resolveConfig({ configPath: flags.config || '', inputs });
  console.log(`Domo instance: ${config.baseUrl}`);
  console.log(`Packages to sync: ${config.targets.length}`);

  const client = createDomoClient({ baseUrl: config.baseUrl, token: config.token });
  const results = await runSync({ client, cwd: process.cwd(), log: (m) => console.log(m), targets: config.targets });

  const synced = results.filter((r) => r.mode !== 'noop');
  console.log(`\nDone. ${synced.length} synced, ${results.length - synced.length} unchanged.`);
  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error(`Error: ${err?.message || err}`);
  process.exit(1);
});
