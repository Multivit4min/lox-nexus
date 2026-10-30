# Installation

Nexus runs in Docker or from a source checkout. Plugins are installed, updated and rolled back in
the web UI, see [Plugins](#plugins).

The image is published at `ghcr.io/multivit4min/lox-nexus` for amd64 and arm64: `latest` is the
newest release, `edge` follows the `main` branch.

## Requirements

- **Node.js 24** or newer (Nexus uses the built-in `node:sqlite`).
- A Loxone Miniserver on the same network. Nexus and the Miniserver exchange UDP packets, so no
  firewall may block the intercommunication port (61263 by default) in either direction.
- `git` and `npm`.

## Run with Docker

The image runs on amd64 and arm64 (a Raspberry Pi 4 or 5 with a 64-bit OS). It contains the
server, the web UI, this documentation and the first-party plugins, ready to install. Start it with
the repository's `compose.yaml`, which lists every setting as a comment:

```sh
mkdir lox-nexus && cd lox-nexus
curl -fsSLO https://raw.githubusercontent.com/Multivit4min/lox-nexus/main/compose.yaml
docker compose up -d
```

Then open `http://<host>:8080/`. Without compose:

```sh
docker run -d --name nexus --restart unless-stopped --network host --init \
  -v nexus-data:/data ghcr.io/multivit4min/lox-nexus:latest
```

**Building it yourself.** The `Dockerfile` at the repository root builds the same image. In a
checkout, replace `image:` in `compose.yaml` with `build: .` and run `docker compose up -d --build`,
or without compose:

```sh
git clone https://github.com/Multivit4min/lox-nexus.git
cd lox-nexus
docker build -t lox-nexus .
```

To build for both architectures at once, for example to push to your own registry:

```sh
docker buildx build --platform linux/amd64,linux/arm64 -t <registry>/lox-nexus --push .
```

The web UI, the documentation and the plugin bundles are built once on the build machine. Only the
server's dependencies are installed per architecture, so a cross build needs little emulation.

**Host networking.** Run the container with `--network host` (`network_mode: host` in compose).
Each Miniserver sends its UDP packets to a port of the host, and each Miniserver can have its own
port, set in the UI. With host networking these ports work without publishing each one, and Nexus
sees the Miniservers' real addresses. Host networking needs Docker on Linux. With a bridged network
you have to publish the web port and every intercommunication port yourself
(`-p 8080:8080 -p 61263:61263/udp`).

**Data.** Everything persistent is in the volume mounted at `/data`. The container runs as the user
`node` (uid 1000). If you mount a host directory instead of a named volume, that user must be able
to write to it (`chown 1000:1000 <dir>`). Use the [backup](backup.md) page to back it up or to move
an installation.

**Settings.** Set the [variables](#configuration) with `-e` or under `environment:` in
`compose.yaml`. The image presets `NEXUS_DATA_DIR=/data`, `NEXUS_HTTP_PORT=8080` and the paths of
the UI, the documentation and the plugin repository.

**Plugins.** The image's [local plugin repository](#the-local-plugin-repository) holds the
first-party plugins, so they can be installed from the **Plugins** page right away. Installed
plugins live in `/data`, so they survive a new image.

**Updating.** `docker compose pull && docker compose up -d` (a self-built image: pull the
repository and run `docker compose up -d --build`). The data volume stays; the database is
migrated at startup. A
new image may bring new versions of the first-party plugins: **Plugins** then shows how many, and
**Update all** installs them with one review (see **Updating** under [Installing a plugin](#installing-a-plugin)).

**Forgot your password?** Run the command [below](#forgot-your-password) inside the container:

```sh
docker exec -it nexus npm run reset-password                 # docker run
docker compose exec nexus npm run reset-password             # compose
```

## Run from source

```sh
git clone https://github.com/Multivit4min/lox-nexus.git
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
If port 8080 is taken, set `NEXUS_HTTP_PORT=8090` (or another port) in that `.env`: `npm run dev`
listens there, and the Vite dev UI (`npm run dev:web`) sends its API calls there too.

## First run

The first visit shows a setup page: choose a username and a password (at least 8 characters),
typed twice so a typo can't lock you out. This works once; after that the page is a login. Sessions last 30 days. Five failed logins lock the
client address for 15 minutes.

Then:

1. Add your Miniserver, see [Setting up a Miniserver](loxone.md).
2. Add a plugin instance on the **Plugins** page, if you want to connect another system.
3. Connect signals with [wires](wires.md).

## Changing your password

**Change password** in the menu under your user name asks for the current password and the new one
twice. Other browsers and devices logged in as you are logged out; the one you changed it in stays
logged in.

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
  variables elsewhere (a systemd unit), set `NEXUS_DATA_DIR` for the command too. It prints the
  database it opens, so check that line. In the Docker image, `docker exec` already has the right
  `NEXUS_DATA_DIR`.
- It never changes the database's schema. If the server of this version hasn't run on that data
  directory yet (for example right after a `git pull`), it refuses and asks you to start the
  server once first.

## Configuration

Everything is configured through environment variables. Empty variables count as unset.

| Variable | Default | Meaning |
|---|---|---|
| `NEXUS_DATA_DIR` | `./data` | Where everything persistent lives: the SQLite database `nexus.db` (Miniservers, signals, wires, users, forces, plugin state) and the installed plugins. Back this directory up. Only one Nexus can use it at a time: a second one refuses to start (`nexus.db.lock` names the running process). |
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

Open the **Plugins** page and choose the tab **Installed**. Every installed plugin has a card
there. The tab **Instances** is the list of your configured plugin instances.

> **Only install plugins you trust.** A plugin is code that runs on your server. It runs in a
> worker thread with an empty environment and a memory limit, but worker threads are **not a
> sandbox**: it can read files and open network connections like Nexus itself. Checking a plugin
> already runs its code once, so do not check a source you don't trust.

Click **Install plugin**. A dialog with three steps opens.

1. **Source.** Pick where the plugin comes from:
   - **Local repository**: choose a plugin from the list. Plugins that are not built yet are listed
     with their problem. See [the local plugin repository](#the-local-plugin-repository).
   - **Git**: an `https://` URL without a user name or token in it, and a branch or tag. The built
     bundle must be committed in the repository. Git LFS files are not fetched and submodules are
     ignored. Nexus needs `git` on the server for this.
   - **ZIP file**: upload an archive. `package.json` is at its root or in its only top-level
     folder, and the archive is at most 50 MiB.

   A trust warning stays above the tabs. **Fetch and check** only works after you tick **I trust
   this source**, because checking starts the plugin's code once in a throwaway worker to learn
   which sensors and actuators it offers.
2. **Review.** Nexus shows what you are about to install:
   - the plugin's name and version, and how it relates to what is installed: a new plugin, an
     update from another version, older than the active version, or already installed;
   - the exact source: the full URL, ref and commit, or the archive name and its sha256, or the
     folder;
   - the bundle's sha256 and the number of sensors and actuators;
   - the **impact** on what you have: instances that restart; sensors or actuators the new version
     no longer offers (their signals keep their wires but get no values); signals whose value type
     changes; **Offered again** for signals that were orphaned and work again; and new required
     settings.

   Choose **Install**, or **Back**, which discards what was fetched. A checked plugin that you
   don't install within 15 minutes is discarded too, and checking another plugin discards the
   previous one.
3. **Result.** The active version and the state of each instance. After an update, **Roll back
   to** goes back to the version before, as on the card.

Each card on the **Installed** tab shows:

- the active version;
- the source in one line: the git URL and ref with the short commit, the ZIP's name with the short
  sha256 of the archive, or the local folder. A copy button gives the full commit or sha256;
- the plugin's icon, when and by whom it was installed, and how many instances use it;
- the badge **development copy runs instead** when a development plugin with the same id takes
  precedence (see above), and **unavailable** when the installed files can't be loaded;
- the buttons **Read me**, **Update**, **Roll back to** the previous version, and **Uninstall**.

**Read me** shows the README of the version in use: what the plugin does, its settings, sensors and
actuators. The installer keeps a package's `README.md` (up to 512 KiB) from every source. A version
installed before Nexus kept READMEs has none stored: Read me then shows the development copy's, or
the one now in the local repository folder it came from, and says so; **Update** stores it with the
version. A plugin without any README says so. Each instance's page has the same **Read me** button
next to **Edit**, so the plugin's settings are explained where you change them. The plugin's icon
also marks its instances on the **Instances** tab and on each instance's page.

**Updating.** Nexus tells you when a plugin has a newer version: a count on **Plugins**, a banner on
both Plugins tabs, and **update available** on the plugin's card.

- **From the local repository** (the first-party plugins in the image) it knows at once.
  **Update all** in the banner opens one review: per plugin, the version change and what it means
  for its instances. **Update 3 plugins** (or **Update** and the plugin's name) installs them one
  after another and shows a result per plugin; one that fails, or changed in the repository since
  the review, doesn't stop the others. That is four clicks for any number of plugins: **Plugins**,
  **Update all**, **Update 3 plugins**, **Close**. When a card shows **update available** from the
  local repository, its **Update** does the same for that plugin alone. There is no trust question:
  the repository is a folder on the server that only its administrator controls, and the plugin was
  trusted when it was first installed from there.
- **From git** Nexus looks only when you ask: **Check for updates** on the **Installed** tab asks
  each repository which commit its branch or tag points at now (`git ls-remote`, nothing is
  downloaded). A plugin with a new commit, or one that couldn't be checked, is named; its card's
  **Update** opens the install dialog prefilled with the same URL and ref, with the trust question
  and the review as for a new install.
- **From a ZIP file** there is nothing to compare: **Update** opens the ZIP tab for the new file.

The review shows the impact before anything is installed. Running instances restart on the new
version without a server restart, and instances that had failed start on it. Signals whose sensor or actuator is gone stay with their wires and are
marked orphaned until a version offers it again.

**Rolling back.** **Roll back to** shows the impact of switching to the previous version and then
switches. The two versions swap, so you can go forward again the same way. Only the active and the
previous version are kept.

**Uninstalling** removes the plugin with all its files. The button is disabled while instances of
the plugin exist, and the card names them: delete those first, which also deletes their signals and
wires.

Installing the same version again with the same bundle changes nothing (or repairs its files when
they went missing); the same version with a different bundle is refused, so raise the version when
you change a plugin (the local repository does that for you, see below). Installed plugins are stored in `<data dir>/plugins/<id>/<version>/`, and the
database records what is installed. Back up the data directory as a whole. See
[Publishing a plugin](../plugins/publishing.md) for what a package must contain.

#### Without the UI

The same steps are available over the REST API, for scripts. It needs a session, so log in first;
the examples use `curl` with a cookie jar.

```sh
curl -c jar -H 'content-type: application/json' \
  -d '{"username":"admin","password":"..."}' http://localhost:8080/api/auth/login

# 1. stage (fetch and check): from a ZIP, a git repository or the local repository
curl -b jar -H 'content-type: application/zip' --data-binary @my-plugin.zip \
  'http://localhost:8080/api/plugin-packages/stage/zip?name=my-plugin.zip'
curl -b jar -H 'content-type: application/json' \
  -d '{"url":"https://github.com/owner/plugin.git","ref":"v1.2.0"}' \
  http://localhost:8080/api/plugin-packages/stage/git
curl -b jar -H 'content-type: application/json' -d '{"folder":"calendar"}' \
  http://localhost:8080/api/plugin-packages/stage/local

# 2. confirm (null: the plugin is not installed yet; otherwise the active version), or discard
curl -b jar -H 'content-type: application/json' -d '{"expectedActive":null}' \
  http://localhost:8080/api/plugin-packages/stage/<stagingId>/confirm
curl -b jar -X DELETE http://localhost:8080/api/plugin-packages/stage/<stagingId>

# list, impact of a rollback, rollback, uninstall
curl -b jar http://localhost:8080/api/plugin-packages
curl -b jar http://localhost:8080/api/plugin-packages/<plugin id>/versions/<version>/impact
curl -b jar -H 'content-type: application/json' -d '{"version":"1.0.0","expectedActive":"1.1.0"}' \
  http://localhost:8080/api/plugin-packages/<plugin id>/activate
curl -b jar -X DELETE http://localhost:8080/api/plugin-packages/<plugin id>
```

The answer to staging contains the `stagingId`, the plugin's name, version and checksums, and the
`impact` shown on the review step.

### The local plugin repository

The local plugin repository is a folder on the server with one **built** plugin per subfolder. It
is set with `NEXUS_PLUGIN_REPOSITORY` and defaults to `<data dir>/plugin-repository`. Nexus lists
its contents every time you look (`GET /api/plugin-packages/repository`), so a plugin you copy there
shows up without a restart. A subfolder that isn't built yet is listed with the reason.

On the **Installed** tab, below the cards, **In the local plugin repository** lists the plugins of
that folder that are not installed or are installed in another version, each with **Install** or
**Update**. A newer version of an installed plugin also shows in the update banner.

- `npm run dev` points the repository at the workspace's `plugins/`.
- `npm run plugins:build` builds the bundles of the first-party plugins, so they can be installed.
- Installing copies the files, so rebuilding a plugin in the repository never changes the
  installed version.
- Versions from the local repository carry a hash of the bundle and the README as build metadata:
  `0.1.0` in `package.json` is listed and installed as, say, `0.1.0+3f6c2a1b`. A rebuild with
  changes or an edited README, after a `git pull` for example, is therefore a new version and shows
  **Update**, even when nobody raised the version; a rebuild without changes keeps its hash and
  offers nothing. A version that already
  has build metadata (`1.0.0+ci.42`) is installed as it is.
