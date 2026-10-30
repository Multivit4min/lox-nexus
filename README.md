# Lox Nexus

Connects external systems (Home Assistant, Fronius, calendars, …) to **Loxone Miniservers** over
the Loxone Intercommunication Interface. Everything that happens is a message on a readable,
forceable event bus that you can watch live.

> Status: **M3**. The ICI protocol, the event bus, the Loxone integration, the server (REST API,
> login, persistence, live stream) and the web UI (Miniservers, signals, Bus Inspector with
> force/release) work. Plugins come next, see [docs/roadmap.md](docs/roadmap.md).

## Highlights (target)

- **Loxone first.** Own ICI implementation (`packages/ici`) with a protocol lab for reverse-engineering
  payloads such as T5 and SmartActuator RGBW.
- **Plugins.** Installed at runtime from a ZIP or a git repository. Each instance runs in its own
  worker thread, with no restart needed.
- **Bus Inspector.** Live message stream, cause chains ("Loxone dimmer → wire → Home Assistant light
  ✓ 59 ms"), force and release any topic, inject test values. Signals can also be forced, released
  and edited straight from a Miniserver's signal list; editing keeps their wires.
- **Config export and import.** Miniservers, signals and wires as one JSON file (without
  passwords), e.g. to move an installation; a failed import restores the previous configuration.

## Getting started

Requires Node.js 24+.

```sh
npm install
npm run lint && npm run typecheck && npm test
npm run dev          # server (watch mode) on http://localhost:8080; serves the UI, first visit runs setup,
                     # runs plugins/* from source and restarts a plugin when its files change
npm run dev:web      # rebuilds the UI into apps/web/dist on every save; reload the page to see changes
npm run dev:web:hmr  # alternative: Vite with hot reload on http://127.0.0.1:5173 (direct access only)
npm run build        # then NEXUS_WEB_DIR=apps/web/dist serves the UI from the server
npm run plugins:build  # builds the first-party plugins' bundles, so they can be installed
```

`npm run dev` reads the repository's `.env` if there is one (variables already set win).

Behind a path-prefix proxy such as code-server, use `dev` + `dev:web` and open `…/proxy/8080/`.
Vite's hot-reload server can't run under a path prefix (it loads `/@vite/client` from the site
root), so `dev:web:hmr` only works when the browser reaches port 5173 directly. If the proxy
rewrites the `Host` header, set `NEXUS_PUBLIC_ORIGINS` to the address in the browser's location
bar (e.g. `https://coder.example`, in `.env` for development), or logins are refused with 403.

Server settings come from environment variables:

| Variable | Default | |
|---|---|---|
| `NEXUS_DATA_DIR` | `./data` | database and installed plugins (`plugins/`) |
| `NEXUS_HTTP_HOST` / `NEXUS_HTTP_PORT` | `0.0.0.0` / `8080` | |
| `NEXUS_LOG_LEVEL` | `info` | |
| `NEXUS_SECURE_COOKIES` | `false` | set to `true` behind https |
| `NEXUS_WEB_DIR` | | built web UI to serve |
| `NEXUS_TRUST_PROXY` | | reverse proxy addresses whose `X-Forwarded-For` is trusted |
| `NEXUS_PUBLIC_ORIGINS` | | origins the UI is reached at through a proxy that rewrites `Host` |
| `NEXUS_DOCS_DIR` | | built documentation site (`npm run docs:build` → `apps/docs/dist`), served at `/docs/` without a login |
| `NEXUS_DEV_PLUGINS_DIR` | | development: run every plugin in this directory from source (`npm run dev` sets the workspace's `plugins/`; set it empty to run installed plugins instead) |
| `NEXUS_PLUGIN_REPOSITORY` | `<data dir>/plugin-repository` | local plugin repository: a folder with one built plugin per subfolder, offered for installing (`npm run dev` sets the workspace's `plugins/`) |

Forgot the password? `npm run reset-password` sets a new one (see the installation guide in the
docs).

## Repository layout

| Path | Purpose |
|---|---|
| `packages/ici` | Loxone Intercommunication protocol, standalone |
| `packages/plugin-sdk` | Public SDK for plugins |
| `packages/core` | Event bus, forces, wires, plugin supervisor |
| `packages/loxone` | Miniserver integration |
| `packages/api` | REST/WebSocket contract between server and UI |
| `apps/server` | Composition root, HTTP API, persistence, plugin installer |
| `apps/web` | Vue 3 + Tailwind + shadcn-vue UI |
| `plugins/*` | First-party plugins: homeassistant, calendar, fronius, influxdb, matter-bridge, mqtt, script, webhook |
| `docs/` | Architecture, ADRs, roadmap, plugin authoring guide |

## Working with Claude Code

`CLAUDE.md` holds the project conventions. Subagents live in `.claude/agents/` (architect,
plugin-dev, reviewer, doc-writer, Explore). Ask for one by name, e.g. "use plugin-dev to port the
calendar". To change an agent, edit its file in `.claude/agents/` or ask Claude to update it.

## License

Lox Nexus is free software under the **GNU General Public License v3.0 or later** (`LICENSE`):
the server, the web UI and the packages they are built from (`apps/*`, `packages/core`,
`packages/loxone`, `packages/api`).

The parts other projects build on are under the **MIT License**, each with its own `LICENSE`
file: the plugin SDK (`packages/plugin-sdk`), the ICI protocol library (`packages/ici`) and the
first-party plugins (`plugins/*`). Plugins only depend on the SDK and talk to Nexus over messages,
so a plugin may use any license, closed source included. See `docs/adr/0015-licensing.md`.
