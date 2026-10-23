# Roadmap

Each milestone is planned, implemented and reviewed on its own. M0 is done when its verification
list passes.

## Milestones

### M0: foundation (done)

1. **Workspaces and TypeScript.**
   - Convert the root `package.json` to workspaces (`packages/*`, `apps/*`, `plugins/*`).
   - Add `tsconfig.base.json`: strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, NodeNext,
     `customConditions`.
   - Each package gets its own `tsconfig.json`, `src/index.ts` and a placeholder test.
   - Remove the scaffold `src/`.
2. **Skeletons.**
   - `packages/{ici,plugin-sdk,core,loxone,api}`. `packages/ici/PROTOCOL.md` is seeded from the
     loxone-ici repo's PROTOCOL.md, with the open questions listed.
   - `apps/server`.
   - `apps/web`: a minimal Vite + Vue + Tailwind v4 shell. Initialising shadcn-vue waits until M3.
   - `plugins/{homeassistant,calendar,fronius}`, each with a `loxNexus` manifest and a dependency on
     the SDK only.
   - A stub `Disposable` base class in the SDK, so the convention exists from day one.
3. **Tooling.**
   - ESLint: keep the existing flat config (no semicolons), and add:
     - double quotes
     - `max-lines` 200 and `max-lines-per-function` 40
     - a `no-restricted-imports` rule that stops plugins importing core, loxone, ici, api or server
       (`packages/ici` itself may import nothing from the workspace)
   - Root scripts:
     - `lint`
     - `typecheck` (`tsc -b`)
     - `test` (`node --import tsx --test` over the workspace globs)
     - `dev`
     - `build`
   - Bump `@types/node` to 24, set `engines.node >=24`, and move `.gitlab-ci.yml` to `node:24` with
     `npm ci`.
4. **Claude setup.** The 6 agents, the `port-integration` skill, `.claude/settings.json`, the new
   `CLAUDE.md`, and the per-package `CLAUDE.md` files.
5. **Docs.**
   - `docs/architecture.md`: the Concepts and Architecture sections above
   - `docs/plugin-authoring.md`: a stub
   - `docs/adr/`: one ADR each for worker-per-instance, prebuilt bundles, bus and forces, sessions,
     Loxone in core, our own ICI implementation, and the SDK/api split
   - `docs/loxone-ici-review.md`
   - a new README
6. **Dependency list** goes into `docs/architecture.md`. Each dependency is installed in the
   milestone that first needs it.

**Verify M0:**
- `npm install && npm run lint && npm run typecheck && npm test` passes.
- `npm ls --workspaces` shows every package linked.
- A test `import "@lox-nexus/core"` inside a plugin fails lint.
- A 201-line file fails lint.
- All 6 agent files exist in `.claude/agents/` and show up as agent types in Claude Code.
- An Edit on `old/` is denied.

### M1: ICI implementation and protocol lab (`packages/ici`) (done)

All the `packages/ici` classes listed above, plus the `ici-lab` CLI. This milestone comes first
because it doesn't depend on anything else, and because it gives you the capture tool early so you
can run the T5 and RGBW experiments with your Miniserver.

**Verify:**
- Round-trip tests for every codec, including a TEXT payload over 255 bytes.
- Fuzz-style tests: random and truncated datagrams never throw.
- Every item in the loxone-ici review has a regression test.
- A loopback test with two `IciSocket`s on 127.0.0.1 (random ports):
  - send, then receive
  - ID filtering
  - dedup
  - resend timing with `mock.timers`
  - close and re-bind
  - EADDRINUSE rejects instead of crashing
- Encrypted round-trip using the example packet from PROTOCOL.md.
- First capture sessions against the test Miniserver are done (fixtures in `packages/ici/test/fixtures/2026-10-23-live`). The remaining T5 and RGBW experiments moved to `docs/backlog.md`. Originally:
- **You** run `ici-lab capture` against your Miniserver for the T5 and RGBW experiments, and the
  results are committed as fixtures and documented in PROTOCOL.md.

### M2: values and bus (done)

- `Value` and `Converter` with golden tests.
- `EventBus`, `TopicTrie`, `RetainedState`, `ForceRegistry`, `CausalChain`, `LoopGuard`,
  `Recorder`, `MessageFormatter`.
- `WireEngine` and the Transform classes.

**Verify:** unit tests for:
- wildcard matching
- state vs command dedup
- force semantics: the forced value is delivered, incoming publishes are recorded as `shadowed`,
  release restores the last real value, `until` releases automatically, and forces survive a
  simulated restart
- restored-value gating
- loop drop
- debounce and throttle with `node:test` `mock.timers`
- `MessageFormatter` snapshot tests

### M3: Loxone, server and inspector (M3a Loxone and M3b server: done; M3c web: open)

- `Miniserver`, `MiniserverManager` and `DiscoveryList`, built on `packages/ici`.
- Server: the Fastify app, migrations, auth and setup, the Miniserver controller, `BusStream`.
- Web: login, miniservers and their signals, adopting discovered packetIds, and the **Bus Inspector**
  with force and release.

**Verify:**
- An integration test with a fake Miniserver: a second `IciSocket` and `RemotePeer` on 127.0.0.1
  with random ports, waiting on bus messages rather than sleeping. It checks two paths:
  - packet → bus → wire → output packet
  - forcing an out topic → the forced value arrives at the fake Miniserver
- A manual run against your real Miniserver.
- The inspector stays responsive at 500 messages per second.

### M4: plugin runtime and Fronius

- SDK runtime and `PluginTestHost`.
- `PluginWorker`, `WireProtocol`, `PluginSupervisor`, `DevPluginLoader`.
- Plugin signals, wires to plugin signals, the store, and the webhook proxy.
- Port **fronius**.

**Verify:**
- Chaos fixture plugins:
  - one that throws in `start` ends in `error`
  - a busy loop ends in `crashed` and is restarted with backoff
  - a heap bomb is killed by the memory limit
- No active handles remain after a stop and start cycle.
- The fronius tests pass using only `PluginTestHost`.

### M5: installer, Calendar, Home Assistant, plugin UI

- `PluginInstaller` with `ZipSource` and `GitSource`, versions, rollback and describe.
- UI: a JSON-Schema form renderer (boolean, array, nested, optional, defaults, secrets), the catalog
  browser, signals, wires and panels.
- Port **calendar** and **homeassistant**.

**Verify:**
- Zip-slip, symlink and zip-bomb fixtures are rejected.
- The same plugin installs from git and from a ZIP.
- A hot update needs no restart, and rollback works.
- Home Assistant works end to end against a mocked HA WebSocket.

### M6: hardening and release

- Recorder to disk.
- Importer for the old v1 export.
- Backup and export.
- A Dockerfile for amd64 and arm64.
- A publish pipeline for the SDK, and a plugin template repo.

**Verify:**
- A real old export imports.
- A 24 h soak run keeps the heap flat.
- An out-of-repo plugin built against the published SDK installs from git.

## Top risks

1. **Plugins are trusted code.** Worker threads are not a sandbox. Say so explicitly in the docs and
   install UI, and keep installs admin-only.
2. **zod → JSON Schema loses transforms and refinements.** Document a supported subset. The worker
   stays the authority on validation.
3. **Unknown ICI protocol fields** (T5, RGBW bits, fade units). Unknown bytes are preserved
   byte-exact, codecs are marked experimental, and the fields are confirmed with captures from your
   Miniserver during M1. Some behaviour can only be checked against real hardware, so M1 needs
   your hands-on capture sessions.
4. **Feedback loops through external systems** (Loxone → HA → Loxone). Mitigate with dedup,
   per-wire throttling, a loop-rate warning, and forces as the manual circuit breaker.
