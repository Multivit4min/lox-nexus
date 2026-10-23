# Lox Nexus

Connects external systems (Home Assistant, Fronius, calendars, …) to **Loxone Miniservers** over
the Loxone Intercommunication Interface. Everything that happens is a message on a readable,
forceable event bus that you can watch live.

> Status: **M3b**. The ICI protocol, the event bus, the Loxone integration and the server
> (REST API, login, persistence, live stream) work. The web UI comes next, see
> [docs/roadmap.md](docs/roadmap.md).

## Highlights (target)

- **Loxone first.** Own ICI implementation (`packages/ici`) with a protocol lab for reverse-engineering
  payloads such as T5 and SmartActuator RGBW.
- **Plugins.** Installed at runtime from a ZIP or a git repository. Each instance runs in its own
  worker thread, with no restart needed.
- **Bus Inspector.** Live message stream, cause chains ("Loxone dimmer → wire → Home Assistant light
  ✓ 59 ms"), force and release any topic, inject test values.

## Getting started

Requires Node.js 24+.

```sh
npm install
npm run lint && npm run typecheck && npm test
npm run dev        # server (watch mode) on http://localhost:8080; first visit runs setup
npm run dev:web    # web UI (Vite)
```

Server settings come from environment variables:

| Variable | Default | |
|---|---|---|
| `NEXUS_DATA_DIR` | `./data` | database and (later) plugins |
| `NEXUS_HTTP_HOST` / `NEXUS_HTTP_PORT` | `0.0.0.0` / `8080` | |
| `NEXUS_LOG_LEVEL` | `info` | |
| `NEXUS_SECURE_COOKIES` | `false` | set to `true` behind https |
| `NEXUS_WEB_DIR` | | built web UI to serve |
| `NEXUS_TRUST_PROXY` | | reverse proxy addresses whose `X-Forwarded-For` is trusted |
| `NEXUS_PUBLIC_ORIGINS` | | origins the UI is reached at through a proxy that rewrites `Host` |

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
| `plugins/*` | First-party plugins: homeassistant, calendar, fronius |
| `docs/` | Architecture, ADRs, roadmap, plugin authoring guide |

## Working with Claude Code

`CLAUDE.md` holds the project conventions. Specialised subagents live in `.claude/agents/`
(architect, core-dev, loxone-expert, plugin-dev, frontend-dev, reviewer, doc-writer). Ask for one by name, e.g.
"use the loxone-expert agent to implement the T5 codec". To change an agent, edit its file in `.claude/agents/` or ask Claude to update it.
