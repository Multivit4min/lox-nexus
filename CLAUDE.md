# Lox Nexus

Bridges external systems (Home Assistant, Fronius, calendars, …) to **Loxone Miniservers** over the
Loxone Intercommunication Interface (ICI, UDP). Clean rewrite of the previous Nexus
(github.com/Multivit4min/loxone-nexus and loxone-nexus-frontend), designed fresh; its known bugs
are listed in `docs/architecture.md` and `docs/loxone-ici-review.md`, and its unported
integrations in `docs/legacy-nexus.md`.

- Architecture and vocabulary: `docs/architecture.md` (read it before larger changes)
- Decisions: `docs/adr/`
- Milestone plan: `docs/roadmap.md`

## Layout

```
packages/ici         own ICI protocol implementation + ici-lab CLI   (no workspace deps)
packages/plugin-sdk  public SDK: Plugin, Sensor, Actuator, Disposable, values, wire, testing
packages/core        EventBus, ForceRegistry, Recorder, WireEngine, PluginSupervisor (IO-free)
packages/loxone      Miniserver, MiniserverManager, DiscoveryList (uses core + ici)
packages/api         private REST/WS DTO schemas shared by server and web
apps/server          NexusApp composition root, Fastify, persistence, auth, installer
apps/web             Vue 3 + Vite + Tailwind v4 + shadcn-vue
plugins/*            first-party plugins (homeassistant, calendar, fronius, script, webhook, influxdb, mqtt)
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

Project subagents live in `.claude/agents/`. Implementation happens in the main session, which
already has the context; package-specific guidance is in each package's `CLAUDE.md`. Delegate when
a task matches:

| Agent | Use for |
|---|---|
| `architect` | design review before a security- or design-heavy milestone (M5e installer), boundary checks, ADRs (read-only for code) |
| `plugin-dev` | building plugins against the public SDK only; where it gets stuck, the SDK lacks something |
| `reviewer` | read-only review of a change against these conventions, plus running checks |
| `doc-writer` | JSDoc for classes, methods and exported functions after a change; comments only |
| `Explore` | broad read-only searches when only the conclusion is needed |

