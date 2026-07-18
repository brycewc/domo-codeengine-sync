# domo-codeengine-sync

A GitHub Action (and CLI) that syncs a Domo Code Engine package definition from its JSDoc and deploys a new version. Add it to any repo that holds a Code Engine package's source, and on push it regenerates the function manifest from the source's JSDoc, creates a new package version, and (by default) releases it.

It is the headless equivalent of the Domo Toolkit extension's "Generate Definition from JSDoc" feature, sharing the exact same parser via the [`domo-codeengine-manifest`](../domo-codeengine-manifest) package, so CI and the extension produce identical definitions.

## What it does on each run

1. Reads the package source file from your repo.
2. Fetches the current package version from Domo as the diff baseline.
3. Parses the source's JSDoc into a function manifest (same parser as the extension).
4. If any JSDoc has a blocking error, fails the run.
5. If nothing changed, exits cleanly (no new version).
6. Otherwise creates a new version (regenerating the required `module.exports` block) and, unless `release: false`, releases it.

## Usage

```yaml
# .github/workflows/deploy-code-engine.yml
name: Deploy Code Engine Package
on:
  push:
    branches: [main]
    paths: ['src/**.js', 'domo-codeengine.json']
jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: brycewc/domo-codeengine-sync@v1
        env:
          DOMO_DEVELOPER_TOKEN: ${{ secrets.DOMO_DEVELOPER_TOKEN }}
        with:
          instance: acme
```

### Configuration

Provide a committed `domo-codeengine.json` (supports multiple packages):

```json
{
  "instance": "acme",
  "packages": [{ "packageId": "…", "sourcePath": "src/my-package.js", "release": true }]
}
```

Or use single-package inputs (`instance`, `package-id`, `source-path`, `release`) directly in the workflow. The config file wins when present; inputs are the fallback.

The **developer token** always comes from the `DOMO_DEVELOPER_TOKEN` secret/env, never the config file. Create one in Domo under Admin > Authentication > Access Tokens; it must permit Code Engine version create and release.

### Inputs

| Input             | Description                                                        | Default |
| ----------------- | ------------------------------------------------------------------ | ------- |
| `instance`        | Domo subdomain (`acme`) or full base URL. Optional if in config.   |         |
| `developer-token` | Prefer the `DOMO_DEVELOPER_TOKEN` env from a secret over this.     |         |
| `config-path`     | Path to the config file. Defaults to `./domo-codeengine.json`.     |         |
| `package-id`      | Package UUID (single-package mode).                                |         |
| `source-path`     | Path to the package source `.js` (single-package mode).            |         |
| `release`         | Release (deploy) after creating. Set `false` to stage unreleased. | `true`  |

### Outputs

| Output     | Description                                                     |
| ---------- | -------------------------------------------------------------- |
| `versions` | Comma-separated `packageId@version` list of synced packages.   |
| `results`  | JSON array of per-package results.                             |

## CLI

```bash
DOMO_DEVELOPER_TOKEN=… npx domo-codeengine-sync \
  --instance acme --package-id <uuid> --source-path src/pkg.js
# or, with a config file in the cwd:
DOMO_DEVELOPER_TOKEN=… npx domo-codeengine-sync --config domo-codeengine.json
# stage without releasing:
DOMO_DEVELOPER_TOKEN=… npx domo-codeengine-sync --instance acme --package-id <uuid> --source-path src/pkg.js --no-release
```

## Development

```bash
yarn            # install (consumes ../domo-codeengine-manifest via file: until it is published)
yarn test       # node --test
yarn build      # bundle to dist/index.js with ncc (commit the result)
```

A JS GitHub Action runs the committed `dist/index.js`, so **run `yarn build` and commit `dist/` whenever `src/` changes**. CI enforces this.

> Note: until `domo-codeengine-manifest` is published to npm, the dependency is `file:../domo-codeengine-manifest` and CI checks the package out as a sibling. After publishing, point the dependency at the registry version and drop the sibling checkout step.
