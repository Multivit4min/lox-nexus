# Lox Nexus

Bridges external systems (Home Assistant, Fronius, calendars, …) to **Loxone Miniservers** over the
Loxone Intercommunication Interface (ICI, UDP). Clean rewrite of `old/loxone-nexus` +
`old/loxone-nexus-frontend`.

- Architecture and vocabulary: `docs/architecture.md` (read it before larger changes)
- Decisions: `docs/adr/`
- Milestone plan: `docs/roadmap.md`

## old/ is a read-only reference

`old/` holds the previous implementation. **Never edit it** (also denied in `.claude/settings.json`).
Use it to understand behaviour, but design fresh: don't carry over an old concept unless it fits the
new architecture. Known bugs in old code are listed in `docs/architecture.md` and
`docs/loxone-ici-review.md`.

## Layout

```
packages/ici         own ICI protocol implementation + ici-lab CLI   (no workspace deps)
packages/plugin-sdk  public SDK: Plugin, Sensor, Actuator, Disposable, values, wire, testing
packages/core        EventBus, ForceRegistry, Recorder, WireEngine, PluginSupervisor (IO-free)
packages/loxone      Miniserver, MiniserverManager, DiscoveryList (uses core + ici)
packages/api         private REST/WS DTO schemas shared by server and web
apps/server          NexusApp composition root, Fastify, persistence, auth, installer
apps/web             Vue 3 + Vite + Tailwind v4 + shadcn-vue
plugins/*            first-party plugins (homeassistant, calendar, fronius)
```

## Commands

```
npm install          install + link workspaces
npm run lint         eslint (also enforces boundaries and file length)
npm run typecheck    tsc (all TS packages) + vue-tsc (web)
npm test             node:test via tsx, all packages
npm run dev          server in watch mode
npm run dev:web      Vite dev server
```

Run `npm run lint && npm run typecheck && npm test` before calling a task done.

## Conventions

- **Class-oriented.** Services, plugins, sensors, actuators, transforms, codecs, controllers and
  repositories are classes. Plain data that crosses worker or network boundaries (values, bus
  messages, DTOs) stays as typed plain objects with static factories (`Value.number(3)`).
- **One class per file, short files.** ESLint enforces `max-lines: 200` and
  `max-lines-per-function: 40` (tests exempt from the function limit). Split, don't disable.
- **Lifetimes through `Disposable`** (`packages/plugin-sdk/src/lifecycle/Disposable.ts`). Register
  timers, listeners and children with `every()`, `after()`, `listen()`, `own()` so `dispose()`
  cleans up. Never call bare `setInterval` in a long-lived class.
- **No globals.** Everything is constructed in `apps/server/src/NexusApp.ts` and passed in through
  constructors, using the narrowest interface needed.
- **TypeScript.** ESM, strict, `noUncheckedIndexedAccess`, no `any` (`unknown` + zod at
  boundaries). Relative imports use the `.ts` extension.
- **Style.** No semicolons, double quotes. Comments explain *why*, not *what*.
- **Tests.** `node:test` + `node:assert/strict`, next to the code as `*.test.ts`. Use
  `mock.timers` instead of sleeps. Network tests bind to 127.0.0.1 on port 0.

## Context hygiene

- Never read `~/.claude/projects/-home-coder-lox-nexus/b6699a34-ae7f-46df-99bc-b32acbc3768f/tool-results/bw3x0ilqc.txt`
  whole. Search it (grep), or read only the line ranges you need.

## Boundaries (enforced by eslint `no-restricted-imports`)

- `plugins/*` → only `@lox-nexus/plugin-sdk` (they must be movable to their own repo).
- `packages/plugin-sdk` → nothing from the workspace (it is published).
- `packages/ici` → nothing from the workspace (standalone protocol library).
- `packages/core` → only `plugin-sdk` (no IO, no Loxone, no server).
- Libraries never import from `apps/*`.
- `apps/web` → only `@lox-nexus/api` and `@lox-nexus/plugin-sdk` (values); it talks to the server over HTTP/WS.

Workspace packages resolve to `src/` through the `@lox-nexus/source` export condition
(`customConditions` in `tsconfig.base.json`, `--conditions` in the node scripts).

## Agents

Project subagents live in `.claude/agents/`. Delegate when a task matches:

| Agent | Use for |
|---|---|
| `architect` | design questions, boundary reviews, keeping docs/ADRs current (read-only) |
| `core-dev` | bus, forces, wires, plugin runtime, persistence, server API |
| `loxone-expert` | `packages/ici`, the protocol lab, PROTOCOL.md, `packages/loxone`, value conversion |
| `plugin-dev` | building or porting plugins against the public SDK |
| `frontend-dev` | the Vue UI, schema forms, Bus Inspector |
| `reviewer` | read-only review of a change against these conventions, plus running checks |
| `doc-writer` | JSDoc for classes, methods and exported functions after a change; comments only |

Skill: `/port-integration <name>` walks through porting an old integration to a plugin.
