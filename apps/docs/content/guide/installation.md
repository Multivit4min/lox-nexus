# Installation

Today Nexus runs from a source checkout. A Docker image is **not available yet** (milestone M6).
Plugins can be installed through the REST API; the UI for it is not available yet (milestone
M5e-3), see [Plugins](#plugins).

## Requirements

- **Node.js 24** or newer (Nexus uses the built-in `node:sqlite`).
- A Loxone Miniserver on the same network. Nexus and the Miniserver exchange UDP packets, so no
  firewall may block the intercommunication port (61263 by default) in either direction.
- `git` and `npm`.

## Run from source

```sh
git clone <repository-url> lox-nexus
cd lox-nexus
npm install
npm run build          # builds the web UI, the documentation site and the plugin bundles
```

Start the server with the UI and this documentation served from it:

```sh
NEXUS_WEB_DIR="$PWD/apps/web/dist" \
NEXUS_DOCS_DIR="$PWD/apps/docs/dist" \
NEXUS_DEV_PLUGINS_DIR="$PWD/plugins" \
npm start -w @lox-nexus/server
```

Then open `http://localhost:8080/`. The documentation is at `http://localhost:8080/docs/` and needs
no login.

Use absolute paths: `npm start -w` runs inside `apps/server`, so relative paths would resolve
there. The same goes for the default data directory (`./data` becomes `apps/server/data`).

For development, `npm run dev` does the same in watch mode with `NEXUS_WEB_DIR`, `NEXUS_DOCS_DIR`
and `NEXUS_DEV_PLUGINS_DIR` preset, and reads a `.env` file at the repository root if there is one.

## First run

The first visit shows a setup page: choose a username and a password (at least 8 characters). This
works once; after that the page is a login. Sessions last 30 days. Five failed logins lock the
client address for 15 minutes.

Then:

1. Add your Miniserver, see [Setting up a Miniserver](loxone.md).
2. Add a plugin instance on the **Plugins** page, if you want to connect another system.
3. Connect signals with [wires](wires.md).

## Forgot your password?

Run this on the machine where Nexus runs, as the user the server runs as, with the same
`NEXUS_DATA_DIR`:

```sh
npm run reset-password                # the only account
npm run reset-password -- admin       # name it when there are several
```

It checks the account first, then asks for the new password twice without showing it. You can
also pipe it in, for a script or over `ssh` without a terminal:

```sh
read -rs NEW_PASSWORD                 # typed without echo, and kept out of the shell history
printf '%s\n' "$NEW_PASSWORD" | npm run reset-password
```

Every session of the account is signed out. Nexus can keep running: the next request of an old
session is refused, and open pages go to the login within a minute. Having shell access to the
data directory is what proves you own the installation, so there is no reset by e-mail or from the
login page.

- The command runs inside `apps/server`, like `npm start -w`, so a relative `NEXUS_DATA_DIR`
  resolves there. The default (`./data`) is the directory `npm run dev` uses.
- Like `npm run dev`, it reads a `.env` file at the repository root. If your server gets its
  variables elsewhere (a systemd unit, a container), set `NEXUS_DATA_DIR` for the command too. It
  prints the database it opens, so check that line.
- It never changes the database's schema. If the server of this version hasn't run on that data
  directory yet (for example right after a `git pull`), it refuses and asks you to start the
  server once first.

## Configuration

Everything is configured through environment variables. Empty variables count as unset.

| Variable | Default | Meaning |
|---|---|---|
| `NEXUS_DATA_DIR` | `./data` | Where everything persistent lives: the SQLite database `nexus.db` (Miniservers, signals, wires, users, forces, plugin state). Back this directory up. |
| `NEXUS_HTTP_HOST` | `0.0.0.0` | Address the web server binds to. |
| `NEXUS_HTTP_PORT` | `8080` | Port of the web server. |
| `NEXUS_LOG_LEVEL` | `info` | `fatal`, `error`, `warn`, `info`, `debug`, `trace` or `silent`. |
| `NEXUS_WEB_DIR` | not set | Built web UI (`apps/web/dist`). Without it only the API runs. |
| `NEXUS_DOCS_DIR` | not set | Built documentation (`apps/docs/dist`), served at `/docs/`. |
| `NEXUS_SECURE_COOKIES` | `false` | `true` or `1` when users reach Nexus over https (directly or through a proxy). Accepts `true`, `false`, `1`, `0` only. |
| `NEXUS_TRUST_PROXY` | not set | Comma-separated addresses or CIDRs of reverse proxies whose `X-Forwarded-For` is believed. |
| `NEXUS_PUBLIC_ORIGINS` | not set | Comma-separated origins (for example `https://nexus.example`) the UI is reached at through a proxy that rewrites `Host`. |
| `NEXUS_DEV_PLUGINS_DIR` | not set | Directory whose subdirectories are plugins, run from source. Development only. See [Plugins](#plugins). |
| `NEXUS_PLUGIN_REPOSITORY` | `<data dir>/plugin-repository` | The local plugin repository: a folder with one built plugin per subfolder that can be installed from. See [Plugins](#plugins). |

An invalid value stops the server at startup with a message naming the variable.

The Miniserver's intercommunication port is **not** one of these settings: each Miniserver has its
own ports, set in the UI.

## Behind a reverse proxy

Nexus works under a path prefix (for example `https://home.example/nexus/`), because the UI and the
documentation use relative links. Strip the prefix in the proxy and forward WebSocket upgrades
(the live views use `/api/stream`).

- **`NEXUS_TRUST_PROXY`**: set it to the proxy's address. Otherwise every login seems to come from
  the proxy, and one person's typos lock out everyone.
- **`NEXUS_PUBLIC_ORIGINS`**: set it if the proxy rewrites the `Host` header. Nexus refuses
  state-changing requests and WebSocket connections whose `Origin` matches neither `Host` nor this
  list (HTTP 403), so logins fail without it.
- **`NEXUS_SECURE_COOKIES=true`** when the browser uses https.

## Plugins

A plugin instance needs its plugin to be known to the server. There are two ways.

- **Installed plugins** are added through the installer, described below. They live in the data
  directory and survive restarts.
- **Development plugins**: set `NEXUS_DEV_PLUGINS_DIR` to a directory of plugin packages. Nexus
  runs each one from source (`src/index.ts`) and restarts its instances when a file changes.
  `npm run dev` points it at the repository's `plugins/`. A development plugin takes precedence
  over an installed plugin with the same id. To run the installed copies instead, set the
  variable to empty (`NEXUS_DEV_PLUGINS_DIR= npm run dev`).

### Installing a plugin

The web UI for installing is **not available yet** (milestone M5e-3); until then use the REST API.
It needs a session, so log in first. The examples use `curl` with a cookie jar:

```sh
curl -c jar -H 'content-type: application/json' \
  -d '{"username":"admin","password":"..."}' http://localhost:8080/api/auth/login
```

There are three sources:

- **A ZIP file.** `package.json` is at the archive's root or in its only top-level folder, and the
  archive is at most 50 MiB.
- **A git repository.** An `https://` URL without a user name or token in it, and a branch or
  tag. The built bundle must be committed in the repository. Git LFS files are not fetched, and
  submodules are ignored. Nexus needs `git` on the server for this.
- **The local plugin repository**, see below.

Installing takes two steps, so you can look at what you are about to install. **Staging** fetches
the plugin, checks it, and starts it once in a throwaway worker to learn which sensors and
actuators it offers. It returns a `stagingId` with the plugin's name, version and checksums.
**Confirm** then installs it. A staged install that isn't confirmed within 15 minutes is
discarded, and staging another plugin discards the previous one.

```sh
# 1. stage, from a ZIP, a git repository or the local repository
curl -b jar -H 'content-type: application/zip' --data-binary @my-plugin.zip \
  'http://localhost:8080/api/plugin-packages/stage/zip?name=my-plugin.zip'
curl -b jar -H 'content-type: application/json' \
  -d '{"url":"https://github.com/owner/plugin.git","ref":"v1.2.0"}' \
  http://localhost:8080/api/plugin-packages/stage/git
curl -b jar -H 'content-type: application/json' -d '{"folder":"calendar"}' \
  http://localhost:8080/api/plugin-packages/stage/local

# 2. confirm (null: the plugin is not installed yet), or discard
curl -b jar -H 'content-type: application/json' -d '{"expectedActive":null}' \
  http://localhost:8080/api/plugin-packages/stage/<stagingId>/confirm
curl -b jar -X DELETE http://localhost:8080/api/plugin-packages/stage/<stagingId>

# what is installed, and what the local repository offers
curl -b jar http://localhost:8080/api/plugin-packages
curl -b jar http://localhost:8080/api/plugin-packages/repository
```

> **Only install plugins you trust.** A plugin is code that runs on your server. It runs in a
> worker thread with an empty environment and a memory limit, but worker threads are **not a
> sandbox**: it can read files and open network connections like Nexus itself. Staging already
> runs the plugin's code once, so do not stage a source you don't trust.

Installed plugins are stored in `<data dir>/plugins/<id>/<version>/`, and the database records
what is installed. Back up the data directory as a whole.

**Uninstalling** removes the plugin with all its files. It is refused while instances of the plugin
exist: delete those first, which also deletes their signals and wires.

```sh
curl -b jar -X DELETE http://localhost:8080/api/plugin-packages/<plugin id>
```

**Updating** works like installing: stage the new version, look at the `impact` in the answer
(instances that restart, sensors or actuators the new version no longer offers, settings it newly
requires), and confirm with the active version as `expectedActive`. Running instances restart on
the new version without a server restart, and instances that had failed start on it. Signals whose
sensor or actuator is gone stay with their wires and are marked orphaned until a version offers it
again.

**Rolling back** switches to the version that was active before; the two versions swap, so the
same call goes forward again:

```sh
curl -b jar http://localhost:8080/api/plugin-packages/<plugin id>/versions/<version>/impact
curl -b jar -H 'content-type: application/json' -d '{"version":"1.0.0","expectedActive":"1.1.0"}' \
  http://localhost:8080/api/plugin-packages/<plugin id>/activate
```

Only the active and the previous version are kept. Installing the same version again with the same
bundle changes nothing (or repairs its files when they went missing); the same version with a
different bundle is refused, so raise the version when you change a plugin. See
[Publishing a plugin](../plugins/publishing.md) for what a package must contain.

### The local plugin repository

The local plugin repository is a folder on the server with one **built** plugin per subfolder. It
is set with `NEXUS_PLUGIN_REPOSITORY` and defaults to `<data dir>/plugin-repository`. Nexus lists
its contents on every request (`GET /api/plugin-packages/repository`), so a plugin you copy there
shows up without a restart, and installs from it with the `folder` name. A subfolder that isn't
built yet is listed with the reason.

- `npm run dev` points the repository at the workspace's `plugins/`.
- `npm run plugins:build` builds the bundles of the first-party plugins, so they can be installed.
- Installing copies the files, so rebuilding a plugin in the repository never changes the
  installed version.

## Not available yet

- A Docker image (amd64 and arm64) and backups of the whole data directory: milestone M6.
- The installer's web UI (M5e-3).
