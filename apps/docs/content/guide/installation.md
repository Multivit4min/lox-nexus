# Installation

Today Nexus runs from a source checkout. A Docker image and an installer for plugins are **not
available yet** (both are planned for milestone M6 and M5e, see [Plugins](#plugins)).

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
| `NEXUS_DEV_PLUGINS_DIR` | not set | Directory whose subdirectories are plugins, run from source. See [Plugins](#plugins). |

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

A plugin instance needs the plugin to be known to the server. Today there is one way:

- Set `NEXUS_DEV_PLUGINS_DIR` to a directory that contains plugin packages. Nexus runs each one
  from source (`src/index.ts`) and restarts its instances when a file changes. The first-party
  plugins in the repository's `plugins/` directory are loaded this way.

Installing a plugin from a ZIP file or a git URL is **not available yet** (milestone M5e). See
[Publishing a plugin](../plugins/publishing.md).

## Not available yet

- A Docker image (amd64 and arm64) and backups of the whole data directory: milestone M6.
- The plugin installer (ZIP upload, git URL, rollback): milestone M5e.
