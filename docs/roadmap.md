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

### M3: Loxone, server and inspector (done; the inspector's browser performance is still to be checked by hand)

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

**Added after M3 (done):** editing a Loxone signal (its wires stay; value and force follow a new
topic), force and release from the signals list, and config export and import of Miniservers,
signals and wires (see `docs/architecture.md`, "editing signals, forcing from lists, config
transfer").

### M4: plugin runtime and Fronius (done)

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

**Result:** all of the above, see `docs/architecture.md` ("plugin runtime (M4)") and
`docs/plugin-authoring.md`. Fronius ran against two real GEN24 inverters (one with a grid
meter and a secondary "Solax" meter and no battery, one with a BYD battery and an Ohm Pilot)
through the whole stack; their responses are recorded as fixtures. The plugin UI (instances, signals,
catalog, panel) followed in M5a.

### Since M4: import from Loxone Config (done)

Reads the current Loxone Config project from a Miniserver over FTP and imports its
intercommunication inputs and outputs as signals. See `docs/architecture.md` ("importing from
Loxone Config").

### M5: installer, Calendar, Home Assistant, plugin UI

M5 is done in five parts, in this order. The UI comes first, because the new plugins are only
usable once they can be configured without the API. The installer comes last, because the
first-party plugins load from the workspace until then.

1. **M5a: plugin UI** (done; see `docs/architecture.md`, "plugin UI (M5a)").
   - A Plugins page that lists instances with their state, health message and restart count, with
     start, stop and restart buttons.
   - Creating and editing an instance through a JSON-Schema form renderer that handles boolean,
     number, enum, array, nested, optional and default fields. Secrets (`writeOnly`) show as
     "set" and are only sent when changed.
   - Per instance: its signals with live values and force and release (reusing the Loxone
     signals table), adding signals from the catalog browser or by hand with a params form, the
     panel (key-value, table, JSON) and recent log lines.
2. **M5b: wire editor** (done; see `docs/architecture.md`, "wire editor (M5b)").
   - A Wires page and a "wires" section per signal.
   - Picking a source and a target across Loxone and plugin signals, filtered by value type.
   - Editing the transform chain (Invert, Scale, Map, Debounce, Throttle, Convert) with a preview
     of the converted current value, and the `enabled` and `syncOnStart` switches.
   - Inactive wires show why they are inactive.
3. **M5c: Home Assistant plugin** (done; see `docs/architecture.md`, "Home Assistant plugin (M5c)", and `plugins/homeassistant/README.md`).
   - The HA WebSocket client: auth, reconnect with backoff, and `subscribe_entities`.
   - An entity catalog by area and domain. Sensors for state and attributes. Actuators for the
     common services (light, switch, cover, climate, valve, scene, script, input_*).
   - Fixes for the two known bugs (`valve.set_valve_position`, and the scene trigger on `false`).
   - Tests against a mocked HA WebSocket server.
4. **M5d: Calendar plugin** (done; see `docs/architecture.md`, "Calendar plugin (M5d)", and `plugins/calendar/README.md`).
   - iCal fetch with recurrence.
   - Sensors for "event active", next start and end, and the current and next title, filtered by
     a text match.
   - Fixes for the three known bugs: the end time is ignored, there is a double fetch, and the
     ignore list grows forever.
   - `PluginTestHost` tests with `mock.timers`.
5. **M5e: installer.**
   - `PluginInstaller` with `ZipSource` and `GitSource`, `ManifestValidator`, staging, versions,
     rollback and a throwaway describe worker.
   - Hot update of running instances.
   - An install UI that shows the source, the commit and the trust warning.
   - Design: `docs/architecture.md`, "Design: plugin installer (M5e)", and ADRs 0009 and 0010.
     It is built in three steps:
     - **M5e-1:** the install pipeline for new plugins (sources, validation, staging, describe,
       commit, boot loading, uninstall, API). Done, with a third source decided on the way: the
       local plugin repository (`NEXUS_PLUGIN_REPOSITORY`), from which the first-party plugins are
       installed until M6 publishes release ZIPs.
     - **M5e-2:** versions, hot update and rollback. Done, together with unhandled promise
       rejections in plugin workers being logged instead of ending the worker.
     - **M5e-3:** the UI and the walkthrough. Done; M5e is complete.

**Verify:**
- Zip-slip, symlink and zip-bomb fixtures are rejected.
- The same plugin installs from git and from a ZIP.
- A hot update needs no restart, and rollback works.
- Home Assistant works end to end against a mocked HA WebSocket.
- Each UI part is checked with a headless browser walkthrough.

### M6: hardening and release

- Recorder to disk.
- Importer for the old v1 export (on top of the config import added after M3).
- Backup of the whole data directory, including plugins, users and values (the config export
  covers only Miniservers, signals and wires).
- A Dockerfile for amd64 and arm64.
- A publish pipeline for the SDK, and a plugin template repo.
- **Debug MCP server.** An MCP endpoint on a running Nexus, so Claude can debug a live
  installation directly instead of through pasted logs and screenshots.
  - **Read-only tools first:**
    - current signal values;
    - the recorder's recent messages and the trace tree of one message;
    - active forces;
    - Miniserver health, load and discovered packets;
    - plugin instance states, health messages and recent log lines;
    - wire health (why a wire is inactive).
  - **Changing tools** (force, release, inject a value, restart a plugin instance) only when
    switched on separately. Each call shows in the bus inspector with the MCP client as its
    source, like a user's force.
  - **Off by default.** Enabled per installation with its own token (not the admin session),
    revocable, and only on the configured address. Secrets never appear in answers, the same
    rule as the DTOs.
  - It reuses the existing services and the recorder, so it adds no second view of the state that
    could drift.

**Verify:**
- A real old export imports.
- A Claude session connected to a running instance traces a value from a Loxone input through a
  wire to a plugin actuator using only the MCP tools. With the changing tools switched off, every
  write is refused.
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
