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
| `apiVersion` | `1`. The version of this manifest format, not of the SDK: a Nexus refuses a format it can't read. The protocol your bundle speaks comes from the SDK it was built with; Nexus checks that at every start and says whether to update Nexus or the plugin. |
| `id` | The plugin's topic segment and stable reference (`example/<instance>/sensor/...`). Lowercase letters, digits, `.`, `_` and `-`, starting with a letter or digit. `loxone` and `system` are **reserved** for Nexus. Never change it after release: instances and topics refer to it. |
| `name` | Display name, not empty. |
| `entry` | The built bundle, relative to the package. In development `src/index.ts` runs instead. To install: a relative path such as `dist/plugin.js` (no leading `/` or `./`, no `..`, backslashes or empty segments), at most 512 characters, ending in `.js` or `.mjs`. |
| `heapMb` | Optional: the worker's heap limit in MB, 128 to 512 (default 128), for plugins that need more, such as a Matter stack. The install review shows it as "needs up to N MB of memory per instance". |
| `icon` | Optional icon shown in the UI: `bell`, `calendar`, `camera`, `cloud`, `code`, `database`, `gauge`, `home`, `lightbulb`, `music`, `plug`, `solar` (or `sun`), `thermometer`, `webhook`, `wifi` or `zap`. Other names, or none, show a plug. |
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
- **CommonJS dependencies** (an MQTT client, for example) make esbuild write `__require("events")`
  into the ESM bundle, which fails when Nexus loads it with `Dynamic require of "stream" is not
  supported`. Define `require` with a banner in the build script:

  ```json
  "build": "esbuild src/index.ts --bundle --platform=node --format=esm --target=node24 --banner:js=\"import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);\" --outfile=dist/plugin.js"
  ```

  This works because Nexus loads the entry by file URL, so `import.meta.url` is the bundle's own
  path. Before you publish, load the built bundle once from a small `.mjs`
  (`await import("./dist/plugin.js")`) to catch this error early.
- The code runs in a worker with an **empty environment** (no `process.env` values) and a 128 MB
  heap, or the `heapMb` its manifest asks for.

## Releasing

1. Raise `version`, build the bundle, and make it part of what you hand out: `package.json` and
   the file named by `entry` are what gets installed. A source map next to the bundle
   (`<entry>.map`) is installed too if there is one, and so is the README (see below).
   Everything else is ignored: sources, `node_modules` and other files are not installed.
   - **Write a README for the people who install the plugin.** Put `README.md` (or `readme.md`,
     `Readme.md`) at the package root. Nexus keeps it, from a ZIP, a git repository and the local
     repository alike, and the Installed page shows it rendered as Markdown under **Read me** on
     the plugin's card. Say what the plugin does, its settings, its sensors and actuators, and its
     limits. A README larger than 512 KiB is left out and the install goes on. Raw HTML is shown
     as text, images show only their alt text, and links open in a new tab.
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
the bundle changes. Only the local plugin repository stamps versions itself: it installs `1.2.0` as
`1.2.0+<hash of the bundle and the README>`, so a rebuilt plugin, or one whose README changed, installs there as a new version. A different version is an update: running instances restart on it (stopped, then started as a new worker, see the [lifecycle](authoring.md#the-lifecycle-of-a-plugin)), and the
version before stays for a rollback.

**Keep stored data compatible.** Updates and rollbacks don't migrate an instance's config or
store. Read the formats older versions of your plugin wrote, and tolerate fields a newer version
added, so a rollback keeps working. A required setting that is new or was optional before stops
existing instances with an error until the user fills it in; give new settings a default where
you can.

## License

The plugin SDK is under the MIT License, and your plugin only depends on the SDK and talks to
Nexus over messages. So you choose your plugin's license freely, closed source included; Nexus
itself is GPL-3.0-or-later, which doesn't extend to plugins. The first-party plugins are MIT as
well, so you may copy from them. Put a `LICENSE` file and the `license` field in `package.json`,
so users can see what they install.

## Trust

Plugins are **trusted code**. Each runs in a worker thread with an empty environment and a memory
limit, but worker threads are **not a sandbox**: a plugin can read files, open network
connections and use anything Node offers to the Nexus process. Installing is admin-only (every user is an admin in v1) and records where each version came from (the git
commit, or the ZIP's checksum). Staging a plugin already runs its code once. Only run plugins whose
code you trust, and keep secrets in `secret()` config fields: they never reach the browser or the bus.
