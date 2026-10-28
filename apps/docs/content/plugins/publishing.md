# Publishing a plugin

> Installing, updating and rolling back work in the web UI (Plugins, tab Installed) and through the
> REST API. Publishing the SDK to npm and a plugin template repository are milestone **M6**. How to
> install is described in [Installation](../guide/installation.md#installing-a-plugin).

## What exists today

- The package format below (the `loxNexus` manifest and a self-contained ESM bundle).
- **Installing** from a ZIP file, a git repository or the server's local plugin repository.
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
| `entry` | The built bundle, relative to the package. In development `src/index.ts` runs instead. To install: a relative path such as `dist/plugin.js` (no leading `/` or `./`, no `..`, backslashes or empty segments), at most 512 characters, ending in `.js` or `.mjs`. |
| `icon` | Optional icon name shown in the UI. |
| `version` (top level) | Defaults to `0.0.0` when absent. To install: required, a strict [semantic version](https://semver.org) such as `1.2.0` or `1.3.0-beta.1`, at most 64 characters. |
| `type` (top level) | To install: `"module"`, unless the entry ends in `.mjs`. A plugin is an ES module. |

To install, the manifest rules are stricter than for development. The `id` is at most 64
characters (it is also a folder name), `name` at most 100, and `icon` at most 50 (lowercase letters,
digits and `-`). Nexus names the field that is wrong when it refuses a package.

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

1. Raise `version`, build the bundle, and make it part of what you hand out: `package.json` and
   the file named by `entry` are what gets installed. A source map next to the bundle
   (`<entry>.map`) is installed too if there is one. Everything else is ignored: sources,
   `node_modules`, READMEs and other files are not installed.
2. Hand it out in one of two ways.
   - **A ZIP file.** `package.json` is at the archive's root or in its only top-level folder (as
     "download as ZIP" and most zip tools pack a folder). Up to 50 MiB; no absolute paths, `..`,
     backslashes, symbolic links, encrypted or duplicate entries, and at most 5 000 entries.
   - **A git repository.** An `https://` URL (no token or user name in it) and a branch or tag.
     **Commit the built bundle** to the repository, since installing never runs `npm`. Git LFS
     isn't fetched, so keep the bundle a normal file.
3. An admin installs it in the UI: Nexus fetches and checks the package and starts the bundle
   once in a throwaway worker to see what it offers, shows the impact on the review step, and
   installs it after confirmation. See [Installation](../guide/installation.md#installing-a-plugin).

The same version with the same bundle counts as already installed, and confirming it changes
nothing. The same version with a **different** bundle is refused, so raise the version whenever
the bundle changes. A different version is an update: running instances restart on it, and the
version before stays for a rollback.

**Keep stored data compatible.** Updates and rollbacks don't migrate an instance's config or
store. Read the formats older versions of your plugin wrote, and tolerate fields a newer version
added, so a rollback keeps working. A required setting that is new or was optional before stops
existing instances with an error until the user fills it in; give new settings a default where
you can.

## Trust

Plugins are **trusted code**. Each runs in a worker thread with an empty environment and a memory
limit, but worker threads are **not a sandbox**: a plugin can read files, open network
connections and use anything Node offers to the Nexus process. Installing is admin-only (every user is an admin in v1) and records where each version came from (the git
commit, or the ZIP's checksum). Staging a plugin already runs its code once. Only run plugins whose
code you trust, and keep secrets in `secret()` config fields: they never reach the browser or the bus.
