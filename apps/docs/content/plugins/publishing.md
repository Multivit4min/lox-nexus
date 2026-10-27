# Publishing a plugin

> **Not available yet.** Installing a plugin from a ZIP file or a git URL is milestone **M5e**.
> Publishing the SDK to npm and a plugin template repository are milestone **M6**. This page
> describes the package format Nexus already reads, and what you can do today.

## What exists today

- The package format below (the `loxNexus` manifest and a self-contained ESM bundle).
- **Development loading**: Nexus runs every plugin in the directory named by `NEXUS_DEV_PLUGINS_DIR`
  from source (`src/index.ts`) and restarts its instances when a file changes. `npm run dev` points
  it at the repository's `plugins/` directory. Because the SDK is a workspace package and is not on
  npm yet, a plugin is developed inside a Nexus checkout, in `plugins/<name>/`, and can later be
  moved out. See the [quick start](index.md).

## The manifest

A plugin is an npm package whose `package.json` has a `loxNexus` block:

```json
{
  "name": "nexus-plugin-example",
  "version": "1.2.0",
  "type": "module",
  "loxNexus": {
    "apiVersion": 1,
    "id": "example",
    "entry": "dist/plugin.js",
    "name": "Example",
    "icon": "plug"
  }
}
```

| Field | Rules |
|---|---|
| `apiVersion` | Must be `1`, the plugin API this Nexus implements. Another number is refused. |
| `id` | The plugin's topic segment and stable reference (`example/<instance>/sensor/...`). Lowercase letters, digits, `.`, `_` and `-`, starting with a letter or digit. `loxone` and `system` are **reserved** for Nexus. Never change it after release: instances and topics refer to it. |
| `name` | Display name, not empty. |
| `entry` | The built bundle, relative to the package. In development `src/index.ts` runs instead. |
| `icon` | Optional icon name shown in the UI. |
| `version` (top level) | Defaults to `0.0.0` when absent. |

## Building the bundle

A plugin ships a **prebuilt, self-contained ESM bundle**, so installing never runs `npm`. Build it
with esbuild, as the first-party plugins do:

```json
"scripts": {
  "build": "esbuild src/index.ts --bundle --platform=node --format=esm --target=node24 --conditions=@lox-nexus/source --outfile=dist/plugin.js"
}
```

`--conditions=@lox-nexus/source` makes the workspace SDK resolve to its TypeScript source. Once the
SDK is published, a plugin outside the repository drops that flag and bundles the published
package instead.

### What may be bundled

- **Bundled in:** the SDK, zod and any pure JavaScript dependency (an iCal parser, a client
  library). The Hello example in the quick start comes to about 780 KB because zod is included.
- **Not possible:** native modules (`.node` addons) and anything that needs `npm install` at run
  time. Mark nothing as `--external`: the bundle must be a single file, with no `node_modules`
  next to it.
- Node built-ins (`node:fs`, `node:net`, ...) are available.
- The code runs in a worker with an **empty environment** (no `process.env` values) and a 128 MB
  heap.

## Releasing

The intended flow, once the installer exists (M5e):

1. Build the bundle and commit it, or attach it to a ZIP: the package must contain `package.json`
   with the manifest and the file named by `entry`.
2. An admin installs it from a ZIP upload or a git URL plus a ref (only https; the ref must contain
   the built bundle). Nexus checks the manifest, asks the bundle to describe itself in a throwaway
   worker, and moves it into the data directory. The previous version is kept for rollback, and
   running instances restart on the new version without a server restart.
3. ZIP uploads are limited (no absolute paths, `..`, symlinks, more than 5 000 entries or more than
   50 MB uncompressed).

Until then, share the plugin as source for use under `plugins/` of a checkout.

## Trust

Plugins are **trusted code**. Each runs in a worker thread with an empty environment and a memory
limit, but worker threads are **not a sandbox**: a plugin can read files, open network
connections and use anything Node offers to the Nexus process. Once installing is available
(M5e), it will be admin-only and the UI will show a plugin's source and commit. Only run plugins
whose code you trust, and keep secrets in
`secret()` config fields: they never reach the browser or the bus.
