# Architecture

Status: target design, agreed in M0. Sections are filled in with implementation detail as the
milestones land (see `roadmap.md`). If the code and this document disagree, fix one of them in the
same change.

## Code conventions

- **Class-oriented.** Every service, plugin, capability, transform and installer source is a class.
  Plain data (values, messages, DTOs) stays as typed plain objects, because it crosses worker and
  network boundaries where prototypes are lost. Static factories make those objects readable, for
  example `Value.number(3)`.
- **One class per file, and short files.** ESLint `max-lines: 200` (blank lines and comments
  skipped) and `max-lines-per-function: 40`. A file that grows past the limit gets split, not
  exempted.
- **Ownership-based cleanup.** Long-lived classes extend `Disposable`. Anything created with
  `this.own(...)`, `this.every(ms, fn)` or `this.listen(emitter, evt, fn)` is released automatically
  on `dispose()`. Resource leaks are therefore a structural impossibility rather than a matter of
  discipline.
- **No globals.** There is one composition root (`apps/server/src/NexusApp.ts`), and services are
  constructor-injected with only the interfaces they need.
- **Style.** ESM, no semicolons, double quotes, strict TypeScript with `noUncheckedIndexedAccess`,
  no `any` (`unknown` plus zod at the boundaries).

## Concepts (new vocabulary)

| Concept | What it is |
|---|---|
| **Signal** | A named, typed value stream on the bus. Every addressable thing is a Signal: a Loxone packetId, or a configured plugin sensor or actuator. It has a readable topic. |
| **Message** | One event on the bus: a value change, a command, a command result, or a force or release. |
| **Force** | A bus-level pin. While a topic is forced, every subscriber sees the forced value. Real publishes are still recorded (shown as "shadowed") so you can see what *would* have happened. Forces are persisted and released explicitly. |
| **Wire** | A connection from one Signal to another, with an ordered list of **Transform** classes (Invert, Scale, Map, Debounce, Throttle, Convert). This replaces the old "link". |
| **Miniserver** | A Loxone peer: host, ports and IDs. It owns Loxone signals, and discovers unknown packetIds, which can then be adopted. |
| **Plugin** | A class that extends `Plugin<Config>` and runs in its own worker. It declares **Sensor** classes (values coming *from* the device) and **Actuator** classes (commands going *to* the device). |
| **Sensor / Actuator** | Parameterised capability classes. Configuring one with params, for example `entityId`, creates a Signal. |
| **Catalog** | Optional browsable tree a plugin offers ("Kitchen ▸ Light ▸ brightness"). Its leaves are ready-to-add sensors and actuators. |
| **Panel** | Optional declarative status view a plugin exposes (key-value pairs, a table or JSON). No plugin-shipped UI code in v1. |

### Readable topics

Topics are built from slugs, and IDs stay stable underneath (renaming a signal re-keys its topic, and
wires reference IDs, never topics). Examples:

```
loxone/haus/in/licht-kueche            Miniserver "haus", input from the Miniserver
loxone/haus/out/pv-leistung            output to the Miniserver
loxone/haus/discovered/abc123          unknown packetId seen on the wire
homeassistant/zuhause/sensor/kitchen-temp
homeassistant/zuhause/actuator/kitchen-light-brightness
system/plugin/zuhause/status
```

Every message also has a one-line human rendering (`MessageFormatter`), which the UI, the logs and
the CLI all share:

```
12:04:31.120  loxone/haus/in/dimmer-kueche      42           ← Loxone
12:04:31.121  homeassistant/…/kitchen-light    ▶ 42         ← wire "Küche Dimmer → Licht"
12:04:31.180  homeassistant/…/kitchen-light    ✓ 59 ms
12:05:02.004  loxone/haus/out/pv-leistung      🔒 0 (forced by david: "maintenance")  shadowed: 3412
```

## Architecture

### Packages

```
plugins/*        ──► packages/plugin-sdk   (published; the ONLY workspace dependency a plugin may have; npm packages are bundled in)
packages/core    ──► plugin-sdk/values   EventBus, ForceRegistry, Recorder, SignalRegistry, WireEngine, PluginSupervisor
packages/ici     (no deps)               own ICI protocol implementation + protocol lab CLI (could later replace loxone-ici on npm)
packages/loxone  ──► core, ici           Miniserver, MiniserverManager, DiscoveryList
packages/api     ──► plugin-sdk/values   private REST/WS DTO schemas (UI contract)
apps/server      ──► core, loxone, api   NexusApp (composition root), Fastify, persistence, auth, installer
apps/web         ──► api, plugin-sdk/values   Vue 3 UI
```

- `@lox-nexus/plugin-sdk` subpaths:
  - `.`: `Plugin`, `Sensor`, `Actuator`, `Disposable` and the worker runtime
  - `./values`: the `Value` type, the `Value` factories and `Converter`
  - `./wire`: the worker protocol
  - `./testing`: `PluginTestHost`
- Internal packages export TypeScript source through a custom condition (`"@lox-nexus/source"`
  together with `customConditions`), so development needs no build step.

### Values

`Value` is a closed tagged union of plain data:
- `null`, `boolean`, `number`, `string`
- `singleChannel`, `rgbw`, `tunableWhite`
- `t5`, holding `{ buttons: number }`, a bitmask with a `T5Buttons` helper class

RGBW keeps its raw `bits` field and is labelled "experimental" in the UI until the capture work
explains it.

The `Value` class provides factories (`Value.boolean(true)`) and `Value.equals()`. A
`Converter` class with one small `*Conversion` class per target type replaces the old 274-line
converter. The old conversion rules are kept as behaviour (golden tests ported from
`tests/conversion/*.spec.ts` of the previous Nexus, github.com/Multivit4min/loxone-nexus), with these known bugs fixed deliberately, one test each:
- RGBW→TunableWhite spreads `this.defaults` (`VariableConverter.ts:185` in the previous Nexus)
- `fallback || 0` swallows a fallback of 0
- default fadeTime is inconsistent (0 in one place, 0.2 in another)
- RGBW and TunableWhite are missing from the defaults

T5 conversions: number ↔ bitmask, boolean (any button pressed), and string (a list of button names).

### EventBus (core): readable and forceable

Each class below lives in its own file under `packages/core/src/bus/`:
- **`EventBus`**: `publish(topic, value, cause)`, `command(topic, value, cause)`,
  `subscribe(pattern, handler)` (MQTT-style `+`/`#`) and `current(topic)`. Delivery runs through one
  FIFO queue that is never re-entered: effects are delivered after their causes, and order within a
  topic is guaranteed. State messages are deduped with `Value.equals`. Commands are never deduped,
  so pulses work.
- **`TopicTrie`**: wildcard matching.
- **`RetainedState`**: the last value per topic. It is snapshotted to the DB every 5 s and on
  shutdown, and nothing is written per value. Restored values are flagged, and wires ignore them
  unless `syncOnStart` is set, so a boot never actuates a device.
- **`LastCommands`**: the last command each topic delivered, i.e. what an actuator's device was
  last told, for display only (`EventBus.lastCommand`). Kept apart from `RetainedState` so a
  command is never replayed, never a wire's source value and not persisted (empty after a
  restart). A forced command counts as delivered and is kept without its forced flag, so after the
  release the lists still show the value the device has; commands shadowed by a force are not.
  The live state stream and `GET /api/signals` show it where a topic has no current value.
- **`ForceRegistry`**:
  - `force(topic, value, { by, reason, until? })` and `release(topic)` emit `force` / `release`
    messages.
  - While a topic is forced, `EventBus` delivers the forced value and records incoming publishes as
    `shadowed`.
  - Forcing a Loxone **out** topic means the Miniserver receives the forced value. Forcing an **in**
    topic means everything wired to it sees the forced value.
  - Optional `until` gives an automatic release. Forces are persisted in a `forces` table and
    survive restarts.
  - A force on a plugin actuator reaches the device as one command, so it is sent again
    (`EventBus.replayForce`, unchanged) whenever the plugin (re)starts and has created its signals.
- **`CausalChain`**: every message carries `id`, `causedBy` and `traceId`. IDs are minted only by
  the host. A wire's command carries its cause into the worker, where the SDK uses
  `AsyncLocalStorage` so that anything a handler emits or logs inherits the cause. The worker's
  reply becomes a `result` message (ok or error, plus duration).
- **`LoopGuard`**: a wire seen twice in one trace is dropped and a `system/warn` message is emitted.
  The hop limit is 16.
- **`Recorder`**: a 10k-message ring buffer with lookup by id, used to rebuild trace trees.
  Optionally it writes rotating JSONL to disk.
- **`MessageFormatter`**: the readable one-line rendering shown above.
- **`BusStream`** (server): one multiplexed WebSocket. Clients send `subscribe { stream:
  state|bus|logs, filter }`, and filtering happens on the server. The `state` stream is coalesced;
  the `bus` stream is batched every 50 ms and sends a `gap` notice under backpressure.

The **Bus Inspector** UI is a live virtualized table with:
- topic and source filters, and pause
- a trace tree for the clicked message
- **Force / Release** buttons on any topic, with an optional reason and expiry
- one-shot **Inject**
- a "Forced" tab that lists every active force

### Plugin SDK (class-oriented)

```ts
// plugins/fronius/src/FroniusPlugin.ts (src/index.ts: export default PluginEntry.define(FroniusPlugin))
export class FroniusPlugin extends Plugin<FroniusConfig> {
  static readonly config = froniusConfigSchema            // zod, in its own file
  static readonly sensors = [PowerFlowSensor, BatterySensor, MeterSensor]
  static readonly actuators = []

  readonly api = new SolarApi(() => this.config.host)
  readonly poller = this.own(new Poller(this.api))

  override start() {
    this.every(this.config.pollInterval * 1000, () => void this.poller.poll())
  }

  override catalog() { return new FroniusCatalog(this.poller.latest).build() }
}

// plugins/fronius/src/sensors/PowerFlowSensor.ts
export class PowerFlowSensor extends Sensor<FroniusPlugin, PowerFlowParams> {
  static readonly id = "powerflow"
  static readonly params = z.object({ path: z.enum(["grid", "load", "pv"]) })

  override start() {
    this.listen(this.plugin.poller, "data", data => this.emit(Value.number(data.site[this.params.path])))
  }
}

// an actuator
export class LightBrightnessActuator extends Actuator<HomeAssistantPlugin, EntityParams> {
  static readonly id = "light.brightness"
  static readonly accepts = "singleChannel"
  static readonly concurrency = "latest"   // only the newest pending value runs
  async run(value: SingleChannelValue) { await this.plugin.ha.callService("light", "turn_on", …) }
}
```

- `Plugin`, `Sensor` and `Actuator` all extend `Disposable`. Each Sensor or Actuator instance is one
  configured Signal, and it is disposed when that signal is removed or the plugin stops.
- Plugin members:
  - `this.config`, `this.log`, `this.store` (persisted key-value)
  - `this.status.set("degraded", msg)`
  - `catalog()`, `panel()`
  - `this.http.route()`: optional webhook routes, proxied from `/hook/<instance>/*`
- **`PluginTestHost`** (`plugin-sdk/testing`) runs a plugin class in-process with fake config,
  signals and timers, so plugins in their own repos can be tested without the core.

### Plugin runtime (core)

Each class lives in its own file under `packages/core/src/plugins/`:
- **`PluginWorker`**: one `worker_thread` per plugin instance, with `env: {}`, a 128 MB heap
  limit and stdio piped to the logger.
- **`WireProtocol`**: versioned messages, zod-validated on the host side.
  - Host to worker: `init`, `describe`, `signal.add/remove`, `actuate`, `catalog`, `panel`,
    `http.request`, `ping`, `shutdown`.
  - Worker to host: `hello`, `ready`, `emit`, `status`, `log`, `store.set`, `response`, `pong`.
- **`PluginSupervisor`**: manages states `stopped → starting → running ⇄ degraded`, plus `error`
  (no auto-restart), `crashed` (worker exit, 3 missed pings or OOM, restarted with backoff from 1 s
  to 5 min) and `stopping`. Stopping sends `shutdown`, waits a 5 s grace period, then calls
  `terminate()`. One failing plugin never blocks the boot.
- **`DevPluginLoader`** (in the server, since it reads the file system): runs workspace `plugins/*`
  from source with `--import tsx`, and restarts them on file change.

### Installer (server)

Lives in `apps/server/src/plugins/install/`. The full design (classes, flow, versions, hot update,
API, threat model, tests) is in "Design: plugin installer (M5e)" below; ADRs 0009 and 0010.
- An install fetches a **`ZipSource`** (upload, yauzl) or a **`GitSource`** (https only, shallow
  clone without a working tree, resolved commit recorded) into `data/plugins/.staging/<uuid>`,
  keeps only `package.json` and the bundle, validates the manifest (**`ManifestValidator`**), asks
  a throwaway worker to describe it, and shows the result for confirmation. Confirming moves it
  into `data/plugins/<id>/<version>` and activates it; running instances restart on it without a
  server restart. The active and the previous version are kept, so rollback is one click.
- **Plugins must ship a prebuilt, self-contained ESM bundle.** The bundle is built with esbuild, with
  the SDK and dependencies bundled in and no native modules, so an install never runs `npm`.
- **Security (stated in the docs and the install UI):** worker threads are not a sandbox, so plugins
  are trusted code. Installs are admin-only, and the UI shows the source URL and commit. A
  `PluginTransport` interface keeps a later switch to `child_process` with `--permission` open.
  Secrets never appear on the bus or in DTOs.

### ICI protocol (packages/ici): our own implementation

This package has no dependencies beyond `node:dgram` and `node:crypto`. It is class-oriented with one
class per file, so it can later replace `loxone-ici` on npm.

| Folder | Classes |
|---|---|
| `id/` | `IciId`: an 8-byte ID, validated (ASCII, max 8 bytes, no silent truncation) |
| `packet/` | `PacketHeader`, `DataPacket` (0x9E, keeps the raw datagram and reports non-zero reserved or trailing bytes), `EncryptedPacket` (0x9F), `StatusPacket` (0x8D), `UdpLimits` |
| `codec/` | `PacketDecoder` / `PacketEncoder`. Both check lengths before reading, and every datagram becomes a `DecodeResult` (`data`, `status`, `encrypted`, `unknown` or `malformed`) instead of a throw. The data length is a uint16 in both directions, capped at the UDP limit. |
| `payload/` | One `PayloadCodec<T>` class per data type: `DigitalCodec`, `AnalogCodec`, `TextCodec`, `T5Codec`, `SmartRgbwCodec`, `SmartSingleChannelCodec`, `SmartTunableWhiteCodec`. There is no raw codec: every `DataPacket` keeps its raw payload, so unknown types and unconfirmed bytes survive byte-exact |
| `crypto/` | `IciCipher`: AES-128-CBC with key = SHA256(password)[0..16], IV in block 0, per PROTOCOL.md |
| `transport/` | `IciSocket`: a dgram wrapper whose `bind()` rejects on error. It can close and re-open, uses a typed `EventEmitter<Events>`, and never logs. |
| `receive/` | `IciReceiver` (with `DedupTable`): decodes datagrams, filters on `targetId === ownId` and an optional `sourceId`, and dedupes per `(sourceId, packetId)` with byte-equality |
| `send/` | `RemotePeer` and `Output<T>`. `peer.output("pv", DataType.Analog)` is typed through generics, and `set()` sends exactly once. `ResendScheduler` is one `unref()`'d timer for all outputs (default 10 s). Nothing re-arms after `close()`. |
| `lab/` | The protocol lab, described below |

**Protocol lab** (`npm run ici-lab -- <cmd>`, so you can capture against your Miniserver early):
- `capture [--port N] [--password P] [--only ids] [--record file] [--duration s]` prints every
  datagram as an annotated hex dump, with known fields named and unknown bytes highlighted. It diffs each packet against the previous one with the
  same packetId, so you can see exactly which bytes changed when you press a T5 button or move an
  RGBW slider.
- `capture --record <file>` writes JSONL captures, and `replay <file>` sends them again with the
  original timing. Annotated captures become test fixtures under `packages/ici/test/fixtures/`.
- `decode <hex>` describes a datagram offline.
- `send --type t5 --raw <hex>` sends a crafted packet, to probe how the Miniserver reacts.

**Open protocol questions, with a capture experiment for each:**
1. **T5.** Answered (captured 2026-10-28): the payload is a Float64LE bitmask, left-upper=1,
   right-upper=2, middle=4, left-lower=8, right-lower=16, and buttons pressed together send the sum.
   See `packages/ici/PROTOCOL.md`.
2. **SmartRGBW bytes 6–7.** Unknown. Possible meanings are control flags such as the jump/fade mode
   or the lighting-controller "mode".
   - **Experiment:** in Loxone Config, change one setting at a time (fade time, colour vs white,
     master off, scene change) and diff the captures.
3. **TunableWhite fade unit.** Answered (2026-10-28): 0.1 s, like RGBW and SingleChannel.
4. **SingleChannel bytes 0–2, and TunableWhite bytes 6–7.** SingleChannel's are always 0. TunableWhite
   sends a constant `0x0800` whose meaning is unknown (see PROTOCOL.md).
5. **0x8D status packet.** Decode its fields enough to use it as a heartbeat.

Codecs for unconfirmed fields stay byte-exact on round-trip (every unknown byte is preserved) and are
marked `@experimental` until a fixture confirms them.

### Loxone (packages/loxone)

- **`MiniserverManager`** owns the **`Miniserver`** instances.
- Each running Miniserver has one `IciReceiver` and one `RemotePeer` from `packages/ici`, on an
  `IciSocket` it may share with Miniservers on the same listen port (`SocketPool`). There is no
  adapter or workaround layer.
- **`DiscoveryList`** tracks unknown packetIds so they can be adopted.
- **Health.** A UDP peer has no connection to check, so status comes from "last packet seen" and,
  optionally, the 0x8D status packet.

### Server, persistence, auth

- Fastify 5 with `@fastify/websocket`, `@fastify/cookie` and `@fastify/static`. Requests are
  validated with the zod schemas from `@lox-nexus/api` (ADR 0008).
- Each route group is its own controller class, for example `MiniserverController` and
  `PluginController`.
- Native `fetch` and `WebSocket`; no socket.io or lodash.
- **Auth:** scrypt passwords (ADR 0008) and opaque httpOnly SameSite=Strict session cookies (revocable). The
  WebSocket authenticates with the same cookie, and first-run setup is guarded by a transaction.
- **DB:** Node's built-in `node:sqlite`, file mode 0600 (ADR 0008). Each table is accessed through a repository class.
  - `users`, `sessions`
  - `miniservers`, `loxone_signals`
  - `signals` (a supertable, so wires get real foreign-key cascades)
  - `plugin_packages`, `plugin_versions`, `plugin_instances`
  - `plugin_signals` (capability id, params, label), `plugin_store`
  - `wires` (each target has a unique source), `forces`
  - `value_snapshot`, `settings`
- Config comes from a zod-validated `Config` class with a single `NEXUS_DATA_DIR`. Logging is pino,
  and plugin logs are tagged with the instance and the cause.

### Old code used as behavioural reference only

- **Home Assistant:** the previous Nexus's `src/integration/homeassistant/`, both the WS protocol and the list of
  services. Fix two bugs on the way: `valve.set_valve_position`, and the scene trigger firing on
  `false`.
- **Calendar:** the previous Nexus's `src/integration/calendar/` (iCal, show/hide events). Fix three bugs: the
  event end time is ignored, there is a double fetch, and the ignore list grows forever.
- **Fronius:** the previous Nexus's `src/integration/fronius/SolarApi.ts`.
- **Old v1 export:** not imported (decided 2026-10-28); Nexus starts fresh.


## Implementation notes: values, bus and wires (M2)

Decisions made while building M2, including the fixes from its review, that refine the design
above:

- **Topics.** Segments are lowercase `a-z 0-9 . _ -`, and `Topic.slug("Licht Küche")` gives
  `licht-kueche`. Publishing to an invalid topic throws.
- **Message kinds.** There are six: `state`, `command`, `result`, `force`, `release` and `event`.
  - **Subscribers** receive `state`, `command`, `result` and `event`, including the effective
    message produced by a force.
  - **Taps** (the Recorder, and the inspector stream later) see everything, including `force`,
    `release` and shadowed publishes.
- **Dedup.** A repeated equal state is dropped without being recorded, and so is a repeated
  shadowed value while a topic is forced. This keeps the Miniserver's 10 s resends out of the
  inspector. `publish(..., { force: true })` bypasses dedup.
- **Equality.** `0` equals `-0`. NaN equals NaN, so repeated NaN readings dedupe. `ValueSchema`
  rejects non-finite numbers, and conversions never produce them.
- **Ordering and errors.**
  - `EventBus` (API and queue) hands each message to `BusProcessor` (per-kind semantics), which
    delivers through `Subscribers`. The queue is a FIFO that is never re-entered.
  - Nothing escapes the drain. A handler error, or a failure while processing a message (for
    example a failing `ForceStore`), becomes an `event` on `system/bus/error`, and the queue keeps
    going.
  - A disposed bus ignores new messages.
- **Forces.**
  - The forced value is delivered with the topic's declared kind. `TopicKinds` (implemented by
    `SignalRegistry`) says whether a topic carries commands; the bus falls back to what it has
    seen, then to `state`. The kind is persisted with the force, so restarts don't have to guess.
  - Releasing restores the last real value on state topics, keeping its `restored` flag if it
    came from the snapshot. Otherwise the topic's effective value is cleared.
  - `until` must lie in the future. Expiries longer than setTimeout's ~24.8 day limit are
    scheduled in steps.
  - The store is written before memory changes, so a failed save leaves nothing half-forced.
  - The database-backed `ForceStore` arrives in M3.
- **Boot order.** Call `restoreForces()` before `restoreSnapshot()`. Restored values then arrive
  shadowed, instead of reaching subscribers before the force applies. Restored values don't mark
  topics dirty, so `pendingSnapshot()` returns only live changes (confirmed with `confirmSnapshot()` once stored).
- **Causation and loops.**
  - Every message carries `id`, `causedBy`, `traceId`, `depth`, and `via`: the wire ids on its
    causal path.
  - `LoopGuard` drops a value only if the wire is already on that path, or depth reaches 16.
    Siblings in one trace, such as several states a plugin reports after one command, pass.
  - `CausalChain` keeps no history. A cause that returns from a plugin worker by id is looked up
    among the last 1000 commands sent to that plugin (`PluginSignals`).
  - `Recorder` keeps its messages in a `RingBuffer` (O(1) eviction). `recent(0)` returns nothing,
    and `trace()` returns all roots, so branches whose ancestors were evicted are kept.
- **Wires.**
  - One wire per target.
  - Values are converted to the target's `valueType` unless it is `any`.
  - `invert` negates the value as a boolean.
  - A `map` without `else` passes unmatched values through unchanged.
  - `throttle` emits on the leading edge, plus the latest value at the end of each window.
  - Debounce and throttle delays are capped at one day.
  - When a signal is unregistered, the wires using it are removed with it.
  - A dropped loop is reported as an `event` on `system/wire/loop`, and a wire that fails to
    clean up is reported on `system/wire/error`.
  - Timed transforms ignore values pushed after they were disposed.
- **Values.**
  - RGBW carries `flags` (bytes 6–7), not `bits`.
  - `t5` is a value type.
  - Every structured type defaults to a 0.2 s fade, and a NaN fade time becomes 0.2 (the old code
    made it 0).
  - Values match the wire's resolution everywhere:
    - Percentages are whole numbers 0–100.
    - Fade times are 0–6553.5 s in steps of 0.1 s.
    - Temperatures are 0–65535 K.

    The structured factories (`Value.rgbw(...)` and so on) round and clamp to this. Conversions
    produce it, and `ValueSchema` rejects anything else, so a value that passed validation can
    always be encoded for a Miniserver.
  - The old RGBW→TunableWhite bug is fixed.
  - Numbers become strings rounded to 5 decimals, as the old serializer did.
  - RGBW→number still packs `0xRRGGBBWW` like the old converter. This may be worth replacing later
    with Loxone's own RGB number format.
- **String parsing.** With only one kind of separator, a single separator is a decimal point
  (`"0.125"` → 0.125, `"12,5"` → 12.5). It counts as digit grouping only when it repeats
  (`"1.234.567"`). When both kinds appear, the last one is the decimal point. The old code read
  `"0.125"` as 125.
- **`Disposable`.**
  - `after()` returns a cancel function, forgets its teardown once the timer fires or is
    cancelled, and handles delays beyond setTimeout's ~24.8 day limit by stepping towards a fixed
    deadline.
  - `every()` validates its interval and returns a cancel function.
  - Every `dispose()` call returns the same promise, so a second caller also waits for async
    teardowns. `ForceRegistry`, debounce, throttle, `Recorder` and `ActiveWire` all manage
  their timers and subscriptions through `Disposable`.

## Implementation notes: Loxone (M3a)

- **Structure.**
  - `MiniserverManager` owns `Miniserver`s and validates their config with zod. Slugs and ids are
    unique, and one failing Miniserver (for example a taken port) never stops the others:
    `startEnabled()` reports failures instead of throwing, and each Miniserver keeps its
    `lastError`.
  - A `Miniserver` registers its signals on the `SignalRegistry` even while stopped, so wires can
    be built. `LoxoneSignals` indexes them (inputs by packet id, outputs by topic) and allows one
    signal per packet id and direction. While running, a Miniserver holds a
    `MiniserverConnection`: `IciSocket`, `IciReceiver` (filters on our own ID and the
    Miniserver's ID), `RemotePeer`, an `InboundRouter`, an `OutboundRouter` and a
    `HealthMonitor`. Stopping disposes all of it.
  - `start()`, `stop()` and `update()` run one after another, so a double click or a stop during
    a start can't leak a socket.
  - **Shutdown is not deletion.** Disposing a Miniserver (or the manager) closes sockets but
    leaves its signals registered, so the user's wires survive a shutdown.
    `MiniserverManager.remove()` deletes: it unregisters the signals, which removes their wires.
  - `update()` applies a new config and restarts if the Miniserver was running. A new slug
    re-keys every signal's topic through `SignalRegistry.update()`. `WireEngine` rebuilds the
    affected wires, so they survive the rename. Forces and snapshot values are keyed by topic and
    stay on the old topic.
  - Both the Miniserver's port and our listen port default to Loxone's 61263
    (`IciSocket.DEFAULT_PORT`, `DEFAULT_ICI_PORT` in the API).
  - Miniservers can share a listen address and port, as Loxone setups usually send everything to
    one port. `SocketPool` (one per `MiniserverManager`) binds one `IciSocket` per address and
    port and closes it with its last user. Each Miniserver's `IciReceiver` keeps only packets
    from its `remoteId` to its `ownId`, so Miniservers on one port must differ in one of the two;
    `MiniserverManager` refuses a twin (409 through the API). Port 0 is never shared. A wildcard
    bind and a specific address on the same port are separate sockets, which the OS refuses.
    Problems that name a sender (an encrypted packet without a password, a handshake challenge)
    are reported only by the Miniserver they come from; a malformed packet can't be attributed
    and is reported by every Miniserver on the socket.
- **Topics.**
  - `loxone/<slug>/in/<packet>` for values from the Miniserver.
  - `loxone/<slug>/out/<packet>` for values to it.
  - `loxone/<slug>/discovered/<packet>` for unknown packet ids. They are also kept in the bounded
    `DiscoveryList` until adopted.
  - `system/loxone/<slug>/status` carries the health (`waiting`, `online`, `stale`, `stopped`).
    A new Miniserver publishes `stopped` straight away.
  - `system/loxone/<slug>/error` carries problems. `ProblemReporter` reports each kind at most
    once a minute (per packet id where that applies):
    - failed sends, including resends to an unreachable host
    - malformed packets, including a wrong password ("decryption failed")
    - encrypted packets arriving without a password
    - socket errors
    - data types that differ from the configuration
    - failed starts
  - Only signal topics are persisted in the value snapshot (M3b), so status and discovered topics
    are never replayed at boot.
- **Inbound.** Every packet of a configured input is published, unchanged resends included. The
  bus drops equal states, so this costs nothing. It also matters: a value the receiver saw while
  the packet id was only *discovered* still arrives once the packet id is adopted. Values are
  converted to the signal's declared type, so a Digital signal fed with an Analog packet becomes
  a boolean (and a type mismatch is reported). Status heartbeats only count when they come from
  the Miniserver's own ID.
- **Outbound.** Every value delivered on an out topic is sent, converted to the output's data
  type, including forced values. The bus doesn't replay retained values to new subscribers, so
  the `OutboundRouter` explicitly sends the current value of every output in three cases: when a
  connection opens, when an output is added while running, and on a restart. The Miniserver
  therefore gets the last known value, including values restored at startup (old Nexus never
  re-sent unlinked outputs). An output whose wire never delivered (its source hasn't changed since)
  has no value to send, so `WireService` sends the source's value through the wire when the wire is
  created and when the Miniserver is started from the UI. Starting a plugin from the UI sends its
  sensors' values to their outputs again with `force`, since the sensors repeat values the bus
  drops as unchanged. Wires to plugin actuators are never synced like this: that would act on the
  device. A removed output is taken out of the resend cycle. A release
  without a real value delivers nothing, so the Miniserver keeps the last forced value.
- **Intercommunication load.** Loxone documents the limit as "an average value of 35 messages
  per second over a period of 2 minutes. If this is exceeded, secure transmission is no longer
  guaranteed and a system message appears"
  ([Network Intercommunication](https://www.loxone.com/enen/kb/network-intercommunication/)).
  - `IntercomLoad` counts both directions in a `TrafficMeter`: one slot per second over a
    120 s ring. It counts what the Miniserver sends (to us, and to other targets through our
    port) and what we send, including the cyclic resends (via `CountingSender`).
  - Every 5 s it takes a sample (both rates and the percent of 35/s) and keeps one hour. The
    server stores the samples (`load_samples`, through the `LoadHistoryStore` interface) and
    seeds the history from them at boot, so a restart leaves a gap, not an empty chart. It publishes the whole percent on `system/loxone/<slug>/load`, so wires can react to
    it.
  - Traffic between the Miniserver and systems Nexus doesn't see is missing, so the value is a
    lower bound. Many outputs with the default 10 s resend add up: 100 outputs alone are 10 msg/s,
    29% of the limit.
- **Health** is derived from traffic, because UDP has no connection. Any data packet or status
  heartbeat from the Miniserver marks it online; 10 minutes of silence (two missed heartbeats)
  mark it stale.
- **Verified.** A fake Miniserver on loopback (`test-support/FakeMiniserver.ts`) is used in tests,
  covering restarts, adoption, signal changes while running, lifecycle races, a slug rename with
  wires, and force/release. A live run against the test Miniserver covered in and out values,
  force and release driving the Lighting Controller, and filtering of the other target's (`red`)
  traffic.

## Implementation notes: server (M3b)

- **Composition.** `NexusApp` builds everything in this boot order (a SIGTERM during startup stops
  it cleanly after the current step):
  1. migrate the database
  2. restore forces
  3. load Miniservers and their signals
  4. load wires
  5. replay the value snapshot
  6. start the enabled Miniservers (their outputs get the restored values)
  7. start the snapshot writer
  8. start HTTP

  Disposal runs in reverse. Shutdown (dispose) never deletes signals or wires, because deleting
  happens only through the API.
- **Persistence.** `Persistence` holds the `Database` and one repository per table group. The
  database is the source of truth and the runtime is a projection of it:
  - `MiniserverService`, `LoxoneSignalService` and `WireService` validate every change with the
    domain schema, store it, then apply it. A failing store undoes the runtime change.
  - A stored Miniserver or Loxone signal that can't be loaded is logged, doesn't run, and is listed
    by `GET /api/miniservers/unloadable` (`UnloadableRows`) and on the Miniservers page, where it can be
    deleted. A wire that can't start stays stored and is listed as `active: false`.
- **Deleting.** Deleting a signal or Miniserver also releases forces on its topics, forgets
  their retained values (`EventBus.forget`) and deletes their snapshot rows (`TopicCleanup`). At
  boot, snapshot rows whose topic no longer belongs to a signal are deleted. Renaming a
  Miniserver still leaves forces on the old topics (see the backlog); editing a signal moves them
  (see "Editing signals" below).
- **Signals in the database.** The `signals` table is a supertable. `loxone_signals` (and later
  `plugin_signals`) reference it, and `wires` reference `signals` with `ON DELETE CASCADE`.
  Deleting a signal or a Miniserver removes its wires in the database through foreign keys, and
  in the engine through `SignalRegistry`'s `unregistered` event. Signal ids are UUIDs because
  `SignalRegistry` ids are global.
- **Value snapshot.** `SnapshotWriter` runs every 5 s and on shutdown, using the two-phase
  `pendingSnapshot()` and `confirmSnapshot()` on the bus. A failed write is retried with the next
  batch. Only topics that belong to a signal are stored, so status and discovered topics are never
  replayed.
- **Auth.**
  - Setup works once. Existing users are checked before any hashing, and again inside the
    insert's transaction.
  - Login and setup are throttled per client address (IPv6 per /64). An attempt counts the moment
    it starts, so parallel requests can't slip past while the hash runs: 5 attempts lock that
    address for 15 minutes, and a success clears it.
  - At most 2 scrypt hashes run at once and 8 wait; beyond that the answer is 503.
  - Wrong user and wrong password give the same answer in the same time.
  - The cookie holds a random token; the database stores only its SHA-256. Sessions last 30 days
    and slide when used in their second half; the cookie is renewed with them.
  - Logout and password changes revoke sessions. A password change ends every session and issues
    a fresh one for the current client. Revocation closes open streams of those sessions with
    close code 4401, and streams also re-check their session every minute.
  - A forgotten password is reset on the command line (`npm run reset-password [-- <user>]`).
    - Shell access to the data directory is the proof of ownership, so there is no reset in the UI
      or by mail.
    - `PasswordReset` checks the account before asking, applies the API's length rule and refuses
      control characters. It updates the hash and ends all of the account's sessions in one
      transaction.
    - `ResetPasswordCommand` reads the password hidden at a terminal (`TerminalPassword` with
      `LineEditor`: escape sequences dropped, raw mode restored on every exit) or from piped input
      (`PipedPassword`: one UTF-8 stream, first line).
    - It may run next to the server: sessions are read from the database on every request, and
      open streams notice within their minute.
    - It opens the database without migrating (`Persistence` with `migrate: false`), so a running
      server of another version never finds a changed schema. It refuses when migrations are
      pending.
    - A login whose password check was still running when the hash changed gets no session
      (`AuthService.login` re-checks the hash in the session's transaction).
  - `AuthGuard` is a hook of the API plugin, so it runs for every API route however the URL is
    spelled. It never looks at `request.url` (the router decodes `/%61pi`, the raw URL doesn't).
    Routes opt out with `config: { public: true }`.
  - State-changing requests and WebSocket upgrades are refused (403) when their `Origin` is
    neither the `Host` nor one of `NEXUS_PUBLIC_ORIGINS`. This adds to SameSite=Strict.
  - Behind a reverse proxy, set `NEXUS_TRUST_PROXY` to the proxy's address. Otherwise every login
    seems to come from the proxy and one person's typos lock out everyone.
- **REST API** (all JSON, errors are `{ error, issues? }`):
  - `GET /api/health`
  - `/api/auth`: `GET`, plus `POST` on `setup`, `login`, `logout` and `password`
  - `/api/miniservers`:
    - CRUD on the collection, plus `POST :id/start` and `POST :id/stop`
    - `GET`/`POST :id/signals`, `PUT`/`DELETE :id/signals/:signalId`
    - `GET :id/discovered`, `POST :id/discovered/adopt`
    - Passwords are write-only: an omitted `password` keeps the stored one, `null` removes it.
  - `GET /api/miniservers/:id/load`: the current intercommunication load and the last hour
    of samples (`load` in percent is also on every Miniserver DTO).
  - `GET /api/signals` lists every signal with its current value; `/api/wires` has CRUD.
  - `GET /api/config/export` (a download) and `POST /api/config/import`: the whole
    configuration as one JSON file, see "Config export and import" below.
  - `/api/bus`:
    - `GET messages?limit&pattern` and `GET messages/:id/trace`
    - `GET current?pattern`
    - `GET`/`POST forces`, `DELETE forces?topic=`
    - `POST inject`
- **Error mapping.**
  - zod → 400
  - domain errors (taken slug, a target that already has a wire) → 409 with a machine-readable
    `code` (`{ error, code }`, e.g. `slug-taken`, `target-fed`). Core and loxone throw them as
    `DomainError` (in core) and the services translate them (`HttpError.fromDomain`); any other
    error stays 500.
  - a busy password hasher → 503
  - SQLite constraint → 409
  - invalid topic, pattern or past expiry (`RangeError`) → 400
  - unknown id → 404
  - anything else → 500 "internal error", logged with the stack
- **Live stream** (`/api/stream`): a client sends `{type: "subscribe", stream: "bus" | "state",
  pattern}`.
  - `bus` delivers every recorded message, including shadowed ones and forces, in batches every
    50 ms.
  - `state` sends the current values once (`full: true`), then the latest change per topic per
    batch. Replacing a subscription discards whatever was queued for the old pattern. A release
    that leaves a topic without any value (it was forced before a real value arrived) is sent as
    `cleared: [topic]`, so clients drop the forced value instead of showing it forever.
  - A ping every 30 s detects half-open connections. Shutdown closes streams with 1001; an ended
    session closes them with 4401 (`StreamCloseCode` in `@lox-nexus/api`).
  - A slow client never stalls the bus. When its socket buffer exceeds 1 MiB, or more than 2000
    messages queue up between batches, messages are dropped and it gets `{type: "gap", dropped}`.
- **Logging.** pino writes JSON lines, or pretty output on a terminal. `SystemEventLogger` mirrors
  `system/#` events (bus, wire and Miniserver problems, status changes) into the log.
- **Verified.**
  - Tests cover auth, the Miniserver API over real UDP (discover, adopt, force to the Miniserver,
    rename, delete), wires, bus actions, the stream (with backpressure tested on a fake socket),
    the two-phase snapshot and a full restart.
  - A live run against the test Miniserver: it went online, discovery listed all packet ids,
    adopted inputs streamed over the WebSocket, and signals and sessions survived a restart.

## Implementation notes: web UI (M3c)

- **Structure.** `main.ts` builds an `AppContext` and provides it to the component tree, so
  there are no module globals. The context holds:
  - `Http`, a fetch wrapper that turns `{ error, issues }` into `ApiError`
  - the API facades `AuthApi`, `MiniserverApi` and `BusApi`
  - `SessionStore`
  - a factory for `StreamConnection`s

  Views get it with `AppContext.use()`. `AppRouter` sends visitors to setup or login first, and
  only follows local `next` paths after a login.
- **Works under a path prefix.** The UI is built with relative asset paths (`base: "./"`) and
  uses hash routes (`…/#/miniservers`). `Http.resolve()` turns `/api/…` into a URL relative to the
  page. This lets it run behind proxies that serve it under a prefix and strip that prefix before
  forwarding, so the server can't know it: code-server's `/proxy/<port>/` and Home Assistant
  ingress. Verified through code-server: page, all assets and lazy chunks, login, the API and the
  WebSocket. A 401, or a stream closed with
  `SESSION_ENDED`, leads to the login page.
- **Screens.**
  - Setup and login.
  - The Miniserver list, with live health over the `state` stream.
  - The Miniserver detail page:
    - config form (no password field: encrypted intercommunication is API-only for now; the form
      never sends a password, so a stored one is kept)
    - start, stop, delete, and the last start error
    - signals with live values
    - discovered packets with one-click adoption
  - The Bus Inspector.
- **Intercommunication load.**
  - The Miniserver list shows a compact meter per row, kept live over the `state` stream.
  - The detail page shows a small meter with the percentage in the header. A click opens a
    popover with:
    - the limit
    - the rates by direction
    - up to the last hour as an area chart against a labeled 100% limit line (crosshair tooltip
      on hover or the arrow keys), or the same samples as a table. The axis spans the data there
      is (10 to 60 minutes), and downtime shows as a gap in the line.
  - The meter is blue below 70%, warning from 70% and critical from 100%, each level with an icon
    and a word. The server records history all the time; the popover only fetches it while open.
  - Colors follow the dataviz reference palette and were validated against this UI's light and
    dark card surfaces.
- **Load per signal.** Each Miniserver signal shows its share of Loxone's limit (35 messages/s
  over 2 minutes), the same measure as the Miniserver's total:
  - Incoming packets count by packet id. Outgoing ones, cyclic resends included, are counted
    by `CountingSender`, which reads the packet id from the header (Nexus sends unencrypted).
  - `PacketTraffic` keeps one `TrafficMeter` per packet id and direction that had traffic, and
    drops idle ones every 5 s. It tracks at most 4096 packet ids, so a flood of made-up ids can't
    grow memory.
  - `GET /api/miniservers/:id/signal-load` answers the share in percent (3 decimals) by signal
    id, only for signals with traffic, so the answer stays small on Miniservers with thousands of
    signals. The Miniserver page polls it every 5 s, apart from its other refreshes, so a failed
    call never stalls health and discovery.
  - Incoming traffic counts per signal only for configured inputs, so packets with made-up ids
    can't take PacketTraffic's slots.
  - The shares don't add up to the total: the total also counts status packets and packets for
    other targets that share the port.
- **Loxone colour numbers.** A Lighting Controller output of type Lumitech sends the controller's
  own number (`20bbbkkkk` for a temperature, `BBBGGGRRR` for RGB; `LoxoneColor` in
  `packages/ici`, see PROTOCOL.md). Wired to an **RGBW** intercommunication output it arrives as
  the raw bytes of the double; every RGBW input recognises those (a real RGBW payload never looks
  like one) and publishes the RGB colour that was meant, converted to the signal's `rgbw` type.
  - A per-signal **Lumitech** option (Analog signals carrying colour numbers, decoded into
    `tunableWhite`/`rgbw`, and encoded for outputs) existed until it was removed for lack of use;
    migration 9 drops `loxone_signals.lumitech`. Such signals are plain Analog ones again, and
    config files that still carry the field import without it.
- **Long lists.** A Miniserver can have thousands of signals, and up to 1000 discovered packets.
  Every list that can grow uses `VirtualTable`, which renders only the rows in view (so only
  visible rows track live values), with a search box and an "x of y" count. That covers signals,
  discovered packets, forces, the load table and the Inspector.
  - Signals and discovered packets have multi-select. "Select all" means all rows matching the
    search, never hidden rows. Bulk delete and bulk adopt run one request at a time, show their
    progress, and reload once at the end.
  - The cause-chain tree shows 50 children per level until expanded.
  - The inject dialog suggests known signal topics.
- **Bus Inspector.**
  - It loads the last 500 messages for the topic pattern, then follows the `bus` stream.
  - Messages go into a 5000-entry `RingBuffer`. The rendered list is replaced once per stream
    batch (every 50 ms), so the cost per second doesn't grow with the message rate.
  - The list is virtualized (`@tanstack/vue-virtual`), so only the visible rows exist in the
    DOM, and it sticks to the bottom until the user scrolls up.
  - The topic pattern is filtered on the server; kind and text filters run in the browser.
  - Pause holds the list and counts what was missed. Server-side drops (gaps) are shown as a
    badge.
  - Clicking a message opens a side panel with its fields, its cause chain (`TraceTree`), and
    Force, Release and Inject.
  - The Forced tab lists every active force.
  - Values are edited as a type plus text (JSON for structured types) and validated with
    `ValueSchema` before they are sent (`ValueDraft`).
- **Components.** shadcn-vue components are copied into `src/components/ui` and owned by the repo,
  and ESLint covers `.vue` files too (eslint-plugin-vue). The web app may import only
  `@lox-nexus/api` and `@lox-nexus/plugin-sdk/values` (enforced). No web fonts or other
  third-party requests: the UI works offline.
- **Verified.**
  - Unit tests cover the Inspector store (history, live batches, pause, filters, gaps), the
    ring buffer and value parsing.
  - The built UI is served by the server, with fallback to `index.html` for client-side routes.
  - Load test, server side: about 500 messages per second for 3 s reached a WebSocket client
    completely (no gaps) in 20 batches per second, at most 51 ms late.
  - Not verified: rendering in a real browser. No browser can run in the dev container (system
    libraries missing).

## Implementation notes: editing signals, forcing from lists, config transfer

- **Editing signals.** `PUT /api/miniservers/:id/signals/:signalId` replaces a signal's packet
  id, direction, data type, label and slug.
  - `Miniserver.updateSignal` re-indexes the signal and calls `SignalRegistry.update`, so
    `WireEngine` rebuilds its wires. A wire that no longer fits (say, a new direction) stays
    stored and is listed as inactive. A packet id or topic clash leaves everything as it was
    (409).
  - When the topic changes, `TopicCleanup.move` re-applies a force on the new topic first, then
    replays the last real value there as a *restored* value and saves it to the snapshot. The
    order matters: under a force the replayed value arrives shadowed, so a forced output never
    sends its real value to the Miniserver. Without a force the value behaves like the boot
    snapshot: wires ignore it unless they sync on start, and an output sends it under its new
    packet id, as after a restart.
  - `EventBus.real(topic)` exposes the value a release would restore, also while forced.
- **Forcing from the signals list.** Each row of a Miniserver's signals has edit, force (or
  release) and delete buttons; a forced value shows a lock. The force dialog is the inspector's
  `ForceDialog`, prefilled with the current value or, without one, the signal's `valueType`
  default (`LoxoneSignalDto.valueType`). Release goes back to the last value received from the
  Miniserver (or sent by a wire); without one, the stream's `cleared` empties the cell.
- **Config export and import** (`ConfigTransfer`, format in `packages/api/src/config.ts`):
  - The file holds Miniservers (without passwords), their signals and the wires between them,
    with their ids, as `{ format: "lox-nexus/config", version: 1, … }`. Wires to signals outside
    the file (plugin signals) are left out, because an import couldn't recreate them, and an
    import removes them with the Miniservers (the confirmation says so). Plugin instances, values,
    forces and users are not part of it.
  - An import replaces everything through the normal services, so every validation applies.
    `ConfigCheck` first refuses duplicate ids and slugs and wires to unknown signals (400,
    nothing changes). Ids are kept. A Miniserver keeps the password stored for the same id.
    Wires the engine refuses are stored as inactive, as they were exported.
  - Runtime and database can't share one transaction, so the import takes an export as backup
    first. When a step fails it clears again (best effort) and restores the backup, then answers
    409 naming the failed entry, e.g. `miniservers[0].signals[3]: packet id "x" already has an in
    signal`. If the restore can't bring everything back the answer is 500 and the log says what
    is missing. SQL never reaches the client.
  - Before clearing, the import writes the backup with the Miniserver passwords to
    `import-in-progress.json` next to the database (`ImportJournal`, 0600, atomic with an fsync of
    the folder) and deletes it after a successful import or a complete rollback; after an
    incomplete rollback it stays, so the next start tries again. A file left behind means Nexus
    stopped in the middle; the next start restores it (`ConfigTransfer.recover()`, right after the
    stored configuration is loaded, before values come back and Miniservers start). A journal that
    can't be read or restored is renamed `import-failed-<time>.json` and logged; the start goes
    on. Applying a backup moves a journal into its `before-restore-<time>` folder. Forces and
    values aren't in the journal: after a crash they are gone, as the import's clear released them.
  - Forces and last real values on Loxone topics are taken before clearing
    (`TopicCleanup.keep`) and put back afterwards, also after a rollback, on the topics that exist
    again (`bringBack`); the others are released.
  - The import holds a `ChangeLock`: it waits (up to 10 s, else 409) for changing requests already
    running, then every other changing API request gets 503 with `Retry-After` until it is done.
    Reads go on, and so do routes marked `lockFree` (login, logout, password, setup, the wire
    preview, reading a Loxone Config project). The import route itself is `lockFree`, so a second
    import reaches the lock and gets 409.
  - The UI has Export and Import buttons on the Miniservers page. The import asks for
    confirmation and reports counts, kept passwords and inactive wires.
- **UI fixes found on the way.** `VirtualTable` subtracted the header from
  `getTotalSize()` twice, which hid the last 32 px of every virtual list. `MiniserverView` held
  its `LiveValues` in a plain variable, so the signals card appeared only after the next 5 s
  refresh.
- **Verified.** Tests cover editing (clashes, rollback, a forced output of a running Miniserver
  over UDP that must only ever send the forced value), `TopicCleanup.move`, the stream's
  `cleared`, export and import (round trip into a second installation, kept passwords, inactive
  wires, inconsistent files, rollback) and the failure paths of `ConfigTransfer` with fake
  services. A headless Chromium walkthrough through the code-server proxy forced and released
  signals, edited one, and exported and re-imported the configuration.

## Implementation notes: plugin runtime (M4)

- **SDK** (`@lox-nexus/plugin-sdk`):
  - `Plugin`, `Sensor` and `Actuator` extend `Disposable`. Their declarations (`config`,
    `sensors`, `actuators`, `id`, `params`, `valueType`, `accepts`, `concurrency`, `label`,
    `description`) are optional static fields of the subclass, read with defaults by
    `Declarations`, so subclasses need no `override` on them. Methods (`start`, `catalog`, `panel`) do.
  - `PluginRuntime` is the worker side: it answers host messages and turns emits, logs, status
    and store writes into messages. `SignalHost` creates the configured sensors and actuators;
    `ActuatorRunner` runs one actuator's commands one at a time (`queue`) or only the newest
    (`latest`, the skipped ones fail with `SupersededError`). `CauseScope` (AsyncLocalStorage)
    tags everything emitted or logged while an actuator runs with the triggering bus message.
  - `PluginEntry.define(Class)` is a plugin's entry module. It starts the runtime only when
    loaded by Nexus as a worker (`workerData.loxNexus`), so tests and tools can import it.
  - `PluginTestHost` drives the same `PluginRuntime` in-process, so plugin tests exercise what
    runs in production.
  - `./wire`: zod schemas of the messages (`WIRE_VERSION` 1), plus the shapes they carry
    (description, catalog, panel, HTTP request and response). Frozen version-1 samples in a
    contract test fail on any incompatible change.
- **Core** (`packages/core/src/plugins/`), behind the `PluginTransport` interface:
  - `PluginWorker`: a worker thread with `env: {}`, a 128 MB old-generation heap and piped
    stdout/stderr (logged per line). Every message from it is validated; an invalid one counts as
    a crash. A TypeScript entry (development) inherits the host's `--import tsx` and runs unbuilt.
    A bundle gets no loader, only a few harmless flags (`PluginWorker.execArgv`): tsx would
    transform it again in every worker, which took about half again the heap for the first-party
    plugins and over 256 MB for a 6 MB bundle (matter.js).
  - `PluginSession`: one running worker. Hello (with the wire version), init, ready or failed,
    then pings every 10 s; 3 unanswered pings terminate it. Requests are matched to responses by
    id with a timeout. close() sends shutdown, waits up to 5 s for `stopped`, then terminates.
    A session that ends on its own disposes itself, so its timers never outlive the worker.
  - `PluginSupervisor`: the states stopped, starting, running, degraded, error (refused to
    start: invalid config, start() threw, other wire version; not restarted), crashed (exit, out
    of memory, missed pings, invalid message; restarted after 1 s, doubling to 5 min, reset after
    60 s of stable running) and stopping. Lifecycle calls are serialized. The state is published
    on `system/plugin/<instance>/status`, problems as events on `system/plugin/<instance>/error`.
  - `PluginSignals` registers an instance's signals in the `SignalRegistry` even while it is
    stopped (so wires can be built): sensors are sources (state), actuators targets (command).
    Commands on actuator topics, including a forced value, go to `PluginCalls.actuate`, which
    reports a `result` with the duration; a stopped plugin answers "not running". Emits are
    converted to the sensor's declared value type and published under their cause (the last 1000
    actuations are remembered).
  - `PluginInbox` routes what a plugin reports (values, logs, store writes, status, failed
    signals) and never throws: messages arrive in the worker's event callback, where an exception
    would end the server, so a failure (a store write the database refuses) is reported on the
    instance's error topic. It keeps the plugin's own health, including a "degraded" sent from
    start(), which becomes the state once the instance is running.
  - Message types the host doesn't know (a plugin built with a newer SDK) are skipped and
    logged; a known type with a wrong shape still counts as a broken plugin. stdout and stderr
    lines are cut at 10,000 characters.
  - `PackageDescriber` asks a throwaway worker for the description (JSON Schemas via zod's
    `toJSONSchema`), so the host never imports plugin code.
- **Server:**
  - Tables `plugin_instances`, `plugin_signals` (with a row in the `signals` supertable, so wires
    reference them) and `plugin_store` (migration 3).
  - `PluginService` and `PluginSignalService`: the database is the source of truth. A running
    plugin validates a signal's params; a refusal is a 400 with the plugin's message and nothing
    is kept. A stopped plugin checks them at its next start and the signal shows its `error`.
    An instance whose plugin is gone stays stored and is listed as `unavailable`.
  - Secret config fields (`secret()` in the SDK, `writeOnly` in the description) never leave the
    server; an update that omits one keeps the stored value. Only top-level fields are detected.
  - Plugins start in the background after HTTP is up; a plugin's state shows how it went.
  - An instance whose plugin is unavailable shows no config at all: without the plugin's schema
    nobody can tell which fields are secret.
  - Renaming an instance moves its signals' values and forces to the new topics
    (`TopicCleanup.move`, like a renamed signal). A signal's kind and capability can't change
    (400): that would be a different signal, whose wires wouldn't fit.
  - **REST:** `GET /api/plugins` (what can be instantiated); `/api/plugin-instances` with CRUD,
    `POST :id/start|stop`, `GET :id/catalog`, `GET :id/panel`, and `:id/signals` with CRUD.
  - **Webhooks:** `/hook/<instance slug>/<path>`, any method, outside the session guard, with the
    body passed on as text. 404 for an unknown instance or route, 429 beyond 8 calls in flight per
    instance, 503 when it isn't running, 502 when the handler fails (details only in the log).
    The route shares the UI's origin, so the session cookie (and connection headers) are not
    forwarded, a plugin can't set cookies, and every answer is sandboxed
    (`content-security-policy: sandbox; default-src 'none'`, `nosniff`, `no-store`).
  - **Development:** `npm run dev` sets `NEXUS_DEV_PLUGINS_DIR` to the workspace's `plugins/`.
    `DevPluginLoader` reads each `package.json` manifest (`loxNexus.id`, `apiVersion` 1; the ids
    `loxone` and `system` are reserved), runs `src/index.ts`, and restarts that plugin's instances
    300 ms after its files stop changing; reloads of one plugin run one after another. The whole
    directory is watched, so a plugin that failed to load, or one added later, loads on its next
    change, and its unavailable instances start.
- **Verified.** Supervisor tests run the real runtime in-process behind a fake transport with mock
  timers (start, refusal, crash and backoff, hung worker, stop, signals, rename). Chaos fixtures
  run in real workers: a start that throws ends in error, a busy loop is detected by missed pings
  and restarted, a heap bomb dies with "out of memory (limit 32 MB)", and a stop/start cycle
  leaves no active handles. API tests cover instances, signals, commands, the store, webhooks,
  refusals, deletion and a restart.

## Implementation notes: plugin UI (M5a)

- **Pages.** "Plugins" lists the instances with their live state (from
  `system/plugin/<slug>/status`) and their message (the degraded message, or the last error).
  An instance page holds the following:
  - start, stop, restart (a stop and a start), edit and delete
  - the panel, refreshed with the page every 3 s while the plugin runs
  - the signals with live values, edit, force/release and delete
  - the catalog browser and the log
- **Schema forms** (`lib/schema/`). `SchemaFields.parse` turns the JSON Schema that zod writes
  into a field tree:
  - string, number, integer, boolean, enum, const, nested object, and array of any of these
  - `T | null` (a type list or `anyOf` with a null branch) becomes a nullable field
  - anything else (records, unions, tuples) is edited as JSON text

  `SchemaDraft` converts both ways between values and what the inputs edit. Numbers stay text
  while typed. `value()` returns a field as follows:

  | Input | Result |
  |---|---|
  | empty optional field | left out |
  | empty required nullable field | `null` |
  | optional nested object with nothing typed in | left out as a whole |
  | blank list item | dropped |
  | empty nullable field that has a default | `null`, since leaving it out would bring the default back |
  | empty list whose default has items | `[]`, for the same reason |
  | stored `null` of a nullable object or list | `null`, kept as it is |
  | text that isn't a number, option or JSON | `SchemaInputError` naming the path (`nested.x`, `tags[2]`) |

  `SchemaFieldInput.vue` renders the tree recursively and emits new drafts instead of changing
  the one passed in. The plugin stays the authority on validation: a refused config shows up as
  the instance's error, and refused params as the request's 400.
- **Secrets.** A secret field (`writeOnly`) always starts empty and is left out when empty, so
  the server keeps the stored value. `PluginInstanceDto.secrets` names the secret fields that have
  a stored value, so the form can say "set; leave empty to keep it" and drop `required`.
  Removing a stored secret is not possible from the UI.
- **Host additions:**
  - `PluginSupervisor.statusMessage`: the message of the plugin's last "degraded".
  - `PluginSupervisor.restarts`: automatic restarts since the last start or stop from outside.
  - `PluginLogs` keeps each instance's last 200 log lines in memory (`GET :id/logs`), with
    messages and data (as JSON) cut at 2000 characters each. `PluginService.remove` drops an
    instance's lines.
  - Debug lines only while the user switched debug logging on for the instance
    (`PUT :id/log-level`, 1-60 minutes, default 15; the ring holds 1000 lines meanwhile).
    `PluginLogs` is the `PluginLogSink`'s `level()`/`onLevel()`: the supervisor puts the level
    into `init` and sends `log.level` to a running worker whose `hello` listed that feature, and
    the worker drops lines below it. With the server log at debug every worker sends its debug
    lines, which reach only the server log.
- **Catalog.** `CatalogTree` flattens the tree into searchable rows ("Inverters ▸ Inverter 1").
  An entry counts as configured when a signal has its kind, capability and params, whatever the
  key order. "Add" takes an entry as it is; "customize" opens it in the signal form first.
- **Verified.** Unit tests cover the schema model, drafts, slugs, the catalog rows and the host
  additions. A headless Chromium walkthrough against the real GEN24 with a battery did the
  following:
  - created an instance (a typed "abc" for the poll interval was refused in the form)
  - added two catalog entries and watched their values arrive live
  - forced a sensor to 42 and released it back to the real value
  - stopped and started the instance, and saw the panel update every few seconds

## Implementation notes: wire editor (M5b)

- **Pages.** "Wires" lists every wire. The Miniserver and plugin instance pages show the wires of
  their own signals in the same card, and each signal row has a button that opens a new wire
  starting at that signal: as its source for a Loxone input or a plugin sensor, as its target
  for a Loxone output or a plugin actuator. Each wire can be edited, switched on or off, and
  deleted.
- **Signal owners.** `Signal.owner` (`{ kind: "miniserver" | "plugin", id }`) is set by
  `Miniserver` and `PluginSignals` and is passed through in `SignalDto`. The UI uses it to name
  the owner next to each signal and to tell whether the owner runs.
- **Why a wire carries nothing.** `WireHealth` gives each wire a level and a reason. The first
  rule that matches wins:

  | Level | When | Reason shown |
  |---|---|---|
  | broken | the server doesn't run it | `WireDto.problem` |
  | off | switched off | "switched off" |
  | idle | the source's owner sends nothing: a plugin that isn't running, or a Miniserver that is stopped, waiting for its first packet, or silent (stale) | "no values while plugin "X" is in error" |
  | idle | the target's owner isn't running | the target's owner and its state |
  | idle | the target is forced | its subscribers see the forced value |
  | ok | the source is forced | the wire carries the forced value |
  | ok | otherwise | "values flow" |

  `WireEngine.problem()` runs `add()`'s checks without starting the wire, and ignores the wire's
  own running copy. `WireService.list()` uses it to explain each inactive stored wire: an
  invalid transform (with its path), a missing signal, a wrong direction, or a target already
  fed by another wire. `WireEngine` keeps the wires a signal update made invalid and starts
  them again when a later update makes them valid (a Loxone output turned into an input and
  back). It checks with `problem()` first, so nothing throws inside the registry's emit. Saving
  a wire also starts it again.
- **Picking signals.** The pickers search name, owner, topic and type. They hide targets whose
  type converts uselessly from what the transforms output, and sources that convert uselessly
  to the chosen target's type, until "all types" is ticked:
  - Useful conversions: boolean, number and string among each other; the three light types
    among each other; number or boolean into a light; T5 into boolean, number or string.
  - The type the transforms output is derived per step: invert gives boolean, scale gives
    number, convert gives its type, and a map gives its common result type (or `any`).

  A target already fed by another wire shows "fed by …" and can't be picked.
- **Transforms and preview.**
  - Steps are edited as drafts (`TransformDraft`). Numbers stay text, a decimal comma is
    accepted, and `map` values are a type plus text, as in the force dialog.
  - Each step says what to fix ("from: enter a number", "case 1: then: not a boolean") before
    anything is sent.
  - `POST /api/wires/preview` runs one value through the steps with the same transform classes
    and conversion as `ActiveWire` (`WirePreview`). It starts nothing and touches no bus.
    Debounce and throttle pass the value through with a note on their timing.
  - The form shows each step's result and what the target gets as its type. It starts from
    the source's current value, can be changed, and is re-run 250 ms after the last edit. Only
    the latest answer is shown, and step values only next to the steps they were computed for.
- **Reloading.** The wire card reloads wires, signals and their owners every 5 s, except while a
  form is open or the tab is hidden, and before a new wire is started from a signal row (the
  signal may be brand new). An older answer never replaces a newer one, and a poll is skipped
  while a load is still running.
- **Keyboard.** The pickers are one Tab stop: arrows move through the matches, Enter in the
  search picks the first one, and the button's name says what is picked.
- **Types.** `SupportedTransformDto` in `@lox-nexus/api` is core's `TransformConfig`, imported as a
  type only, so the shapes have one source and no core code reaches the browser. Stored steps are checked before they reach the UI: one that doesn't fit the schema
  (written by hand, or imported from a newer version) comes as `{ op: "unsupported", raw }`. The
  list shows it as "unsupported step", the form says it will be removed on saving, switching
  such a wire on or off asks to fix it first, and the export writes it as stored. Wire labels
  are capped at 200 characters and transforms at 50 steps, as in the export format. The
  preview validates its steps with the same schema, so its issues carry the same paths as a
  save (`transforms.1.from`).
- **Verified.** Unit tests cover the type fit, step drafts and wire health; server tests cover
  owners, the preview, the reasons and the restart after an undone change. A headless Chromium
  walkthrough with the real GEN24 (battery) and a local, stopped Miniserver did the following:
  - created a wire from PV power to an analog Loxone output, scaled 0…10000 to 0…100; the
    preview showed 25 for 2500
  - saw a non-number refused in the step, and the target locked as "fed by" for a second wire
  - switched the wire off and on, and added a map step after a refused value
  - opened a new wire from a Loxone output row on the Miniserver page, with the target already
    filled in

## Implementation notes: importing from Loxone Config

Out packets can't be discovered on the wire (the Miniserver never says which packet ids it
expects), but the Loxone Config project on the Miniserver lists all of them. So Nexus reads it.

- **Where the project is.** The Miniserver keeps every saved project in `/prog` as
  `sps_<config version>_<yyyymmddhhmmss>.zip`. The newest one holds `sps0.LoxCC` (next to
  `Emergency.LoxCC`, `LoxAPP3.json` and others). `/dev/fsget` over HTTP needs admin rights, so
  `MiniserverFtp` (basic-ftp) downloads it over FTP with a Miniserver user that has the FTP right.
  The login is sent with the request and never stored. The Miniserver only offers plain FTP. It
  also blocks an address after failed logins, so the tests never try a wrong password against
  the real one.
- **`.LoxCC`** (`LoxCcDecoder`, `Lz4Block`): a 16-byte header (magic `0xaabbccee`,
  compressed size, uncompressed size and a checksum of unknown algorithm, all uint32 LE) and one
  raw LZ4 block. The decoder checks the magic, every length and offset, and that the output
  exactly fills the declared size. Before allocating, it refuses sizes over 64 MB and sizes
  beyond the 255:1 that LZ4 can expand to. Only `sps0.LoxCC` is inflated from the zip (fflate),
  and only if its declared size is within the limit. Decoding and parsing are synchronous; for a
  6 MB project that blocks the event loop for well under a second.
- **FTP limits.** The download is capped at 32 MB. Each socket has a 15 s idle timeout and the
  whole read a 60 s deadline. Anything the FTP session reports becomes a `ProjectReadError` with
  a readable message; only programming errors (`TypeError`, `RangeError`) stay 500s. A refused
  login says that repeated failures make the Miniserver block Nexus' address, which would also
  cut its ICI traffic. The login fields refuse line breaks (400), because FTP commands are
  lines. `FakeFtpServer` covers these paths offline.
- **What is read** (`IntercomProjectParser`, streaming with saxes): the document's `Title`,
  `Date` and `Timezone`, and under each `LanInt` (a Miniserver's Network Intercommunication):

  | Object | Attribute | Becomes |
  |---|---|---|
  | `LanInt` | `MId` | `miniserverId` (Nexus' `remoteId`) |
  | `LanInt` | `Pt` | `miniserverPort` (Nexus' `port`) |
  | `HItcDev` (one per peer) | `sid` | `id` (Nexus' `ownId`) |
  | `HItcDev` | `dAd`, `dP` | where the Miniserver sends to (Nexus' address and `listenPort`) |
  | `HItcDev` | `enc` | `encrypted` |
  | `HItcDev` | `Title` | `label` |
  | `HItcIn` | `pid`, `tp` | an `out` signal: the Miniserver receives it |
  | `HItcOut` | `pid`, `tp` | an `in` signal: the Miniserver sends it |

  The signal's label is its `Title`, plus `Desc` as description. `tp` is the ICI data type byte,
  which Loxone Config leaves out for digital. Nothing else from the project (owner, address,
  users, other objects) leaves the package.
- **Time zone.** Reading a project (from the Miniserver or a file) also stores its `Timezone`, an
  IANA name, as the installation's zone (`TimeZoneSetting`, the `timeZone` key in `settings`).
  The last read wins: one installation has one zone, even with several Miniservers, so there is no
  zone per Miniserver. Plugins get it in `init` at their next start (`Plugin.timeZone`, the
  server's zone without one): the Script plugin's `Date` and the Calendar plugin use it, since the
  server often runs in UTC in a container. Both have their own *Time zone* setting that wins over
  it. The Script panel shows the zone.
- **API and UI.** `POST /api/miniservers/:id/project` with `{ username, password }` reads from
  the Miniserver's configured host. It answers `LoxoneProjectDto` (all peers), or 502 with a
  message the user can act on (`ProjectReadError`: refused login, FTP off, no project, corrupt
  file). "Import from Loxone Config" on a Miniserver's page preselects the peer whose `id` is
  this Miniserver's `ownId`. It lists connection settings that differ from the project, then the
  peer's objects as New, Configured, Type differs or Unsupported type (`ProjectDiff`), then the
  configured signals the peer no longer has as Not in the project, with their wire counts. Importing
  goes through the normal signal endpoints, one request at a time:
  - New signals are named as in Loxone Config.
  - Signals whose type differs get only the new data type, so their names, topics, wires and
    forces stay.
  - Signals not in the project are deleted only when the user ticks the option (off by default,
    confirmed), through the normal delete endpoint, which removes their wires too.
  - Failures are listed per row, and the remaining rows still run.
- **From a file.** The dialog's second tab reads a project file the user picks:
  - Loxone Config's own `.Loxone`, which is the same `ControlList` XML (UTF-8 with a BOM)
  - a Miniserver archive (`sps_….zip` from `/prog`)
  - a `.LoxCC`

  `POST /api/miniservers/:id/project/file?name=…` takes the raw bytes (`application/octet-stream`,
  up to 32 MB, the same cap as the FTP download). That route alone gets the raw-body parser, in
  its own Fastify scope. `ProjectFiles.fromFile` tells the formats apart by content (zip magic,
  LoxCC magic, or XML), not by name. A file that is none of them, or UTF-16, is a 400 with a
  message naming it. Nothing is stored.
  - Other content types get a 415 before their body is read, and the `name` may not contain
    control characters.
  - An archive may hold at most 1000 files and exactly one `sps0.LoxCC`. fflate inflates every
    directory record it accepts, so a crafted archive repeating one 64 MB entry would otherwise
    block the server for hours. This guards the FTP path too.
  - Parsing a 32 MB `.Loxone` blocks the event loop for about a second and peaks at about
    170 MB. That's acceptable for an admin action; moving the parse into a worker would remove it. Verified with a real `.Loxone` (`Default2Go.Loxone` from `/prog`) and a
  real archive, and in a headless Chromium walkthrough that uploaded the archive and listed its
  peers.
- **Verified** against the test Miniserver (firmware 17.2): the newest of 30 project files is
  downloaded, decoded and parsed in about 0.75 s. A headless Chromium walkthrough imported the
  `claude-dev` peer, which needed one type change and five new signals.
  `ProjectReader.test.ts` has a live test that runs when `LOXONE_TEST_HOST`, `LOXONE_TEST_USER`
  and `LOXONE_TEST_PASSWORD` are set.

## Implementation notes: Home Assistant plugin (M5c)

`plugins/homeassistant`, written fresh against the SDK. `plugins/homeassistant/README.md` has
every sensor, actuator and service.

- **Connection.**
  - `HassSocket` is one authenticated session: the auth handshake, numbered requests with a 10 s
    timeout, and subscriptions. `subscribe()` resolves with the subscription's id, which
    `unsubscribe(id)` takes (`unsubscribe_events`); the handler goes at once, before Home Assistant
    confirms. It uses Node's built-in `WebSocket`, so the plugin has no runtime
    dependency besides the SDK.
  - `HassConnection` keeps one session open. It reconnects with a delay that doubles from 1 s to
    60 s, and pings every 30 s. Disposing it aborts a handshake in progress. A long outage is
    reported once. Service calls get 60 s, because Home Assistant answers only when the service
    has finished. Everything else gets 10 s.
  - A rejected token is never retried, because Home Assistant's ip_ban would lock Nexus out. At
    start the rejection fails `start()`, so the instance goes to `error` and isn't restarted.
    Later it leaves the instance degraded until the config is fixed.
  - An unreachable Home Assistant only makes the instance degraded.
  - `EventSubscriptions` (`HassConnection.busEvents`) holds one `subscribe_events` per event type
    in use, shared by its listeners. The first listener subscribes, the last one leaving
    unsubscribes (also when it leaves while the subscribe is pending: the late confirmation is
    unsubscribed), and every new socket subscribes again to all types in use. A refusal
    (`HassError`, e.g. a non-admin token) fails the listeners and is kept for later ones until a
    subscribe succeeds. A subscribe not answered on a live connection closes the socket, because
    a late confirmation would leave a subscription nobody reads; the reconnect starts over.
- **Events.** `EventSensor` (`event`) filters an event type's `data` by dot paths (`EventData`,
  numbers and text compare as text) and sends a data field as text (cut to 1000 characters) or a
  pulse. The value returns to false or empty text after `pulseMs`, because the bus drops a value
  equal to the one before and a button pressed twice must reach Loxone twice.
- **States.**
  - `EntityStore` applies the compressed `subscribe_entities` events: `a`, `c` with `+`/`-`, and
    `r`. Every subscription starts with a full list, so after a reconnect entities that disappeared
    meanwhile are removed, and sensors catch up.
  - Sensors listen per entity (`changed:<id>`, `removed:<id>`), not to every change.
  - States are text in Home Assistant. `StateValue` reads numbers and on/off. `unavailable` and
    `unknown` send nothing, so a Miniserver doesn't drop to 0.
- **Actuators.**
  - There is one class per kind of command (on/off, trigger, light brightness, colour and colour
    temperature, position, tilt, temperature, number, text, date and time, to-do item) plus a
    generic `service`. `dateTime` takes text `YYYY-MM-DD HH:MM:SS` (or either part) or seconds
    since midnight, for `input_datetime.set_datetime` and the `date`/`time`/`datetime` entities'
    `set_value`; `todoItem` calls `todo.add_item`. `calendar.create_event` is left to `service`:
    it needs a summary, a start and an end, more than one value carries. Each entity
    actuator declares its `domains` and an optional `supports(entity)`. The catalog uses these to
    offer only actuators that fit, and `start()` refuses other domains.
  - Fixed on the way: `trigger` ignores false (the old integration activated scenes on false),
    and valves use `valve.set_valve_position` (the old one called it on `water_heater`).
- **Catalog.** Area ▸ domain ▸ entity, built from the area, device and entity registries on
  demand. An entity's area is its own or its device's. Hidden and disabled entities are left out.
  A real installation with 687 entities gives about 1,800 entries (330 KB), which the catalog
  browser's virtual list handles. An **Events** node follows (`EventCatalog`): ZHA, deCONZ, Hue
  and Lutron Caséta event types when the device registry has devices of that integration (by
  `identifiers`), each with an entry for all events and one per device (`device_id` filter),
  plus notification actions and tags.
- **Core change.** A sensor's reported failure (`signal.error`) is now cleared by its next value
  (`PluginSignals.publish`). Before, a failure stayed until the signal was re-added, so an entity
  that came back still showed as failed. `PluginCalls` also clears a signal's error before
  `signal.add` instead of after it, so a failure that a sensor reports from its `start()` stays.
- **Verified.**
  - `FakeHomeAssistant` (a `ws` server on 127.0.0.1, test-only) covers states and attributes,
    unavailable and removed entities, light conversions, a rejected token at start and after a
    reconnect (no further attempts), an unreachable server, a dropped connection with catch-up,
    a missed ping, dispose during the handshake and during the backoff, unreadable entity events,
    every actuator's service call, a refused call, and the catalog's feature gating. For events:
    `subscribe_events` and `unsubscribe_events`, fired events, refusals and unanswered
    subscribes. The event sensor's pulses run on a `TestClock`; tests cover a shared
    subscription, unsubscribing after the last sensor, resubscribing after a reconnect (also
    after a refusal), a drop while a subscribe is pending, and the unanswered subscribe.
  - `HassConnection` tests use millisecond timings. The plugin-level reconnect test waits the
    real 1 s backoff once.
  - A read-only live test runs against a real instance when `HA_TEST_URL` and `HA_TEST_TOKEN` are
    set.

## Implementation notes: Calendar plugin (M5d)

`plugins/calendar`, built by the plugin-dev agent against the SDK only. Every sensor, setting and
limit is in `plugins/calendar/README.md`.

- **Reading.**
  - `FeedClient` fetches an iCal link: webcal becomes https, basic auth comes from the config or
    the URL, and feeds are capped at 8 MB because the worker's heap is 128 MB.
  - The link is secret, because private links carry a token. Messages name the host only.
  - One read at start (not awaited), then one per `refreshMinutes`. A failed read keeps the last
    calendar and makes the instance degraded.
- **Parsing.**
  - `IcsReader` is the only class that uses node-ical. It expands recurrences (RRULE, EXDATE,
    RECURRENCE-ID) into plain `Occurrence`s from now − 1 day to now + 400 days.
  - Each series is capped at 1000 occurrences and the whole feed at 20 000. What gets cut is
    reported.
  - A feed that doesn't parse as a whole is split per UID (`IcsSplitter`), so one broken rule
    skips one event rather than the feed.
  - Events without a UID get a stable one: a hash of their start and summary.
  - All-day and floating times are read in a configurable `timeZone`, the server's by default,
    so a container in UTC still starts all-day events at local midnight.
- **Sensors** (`active`, `title`, `time`) share a filter (text or regex, lead and lag minutes).
  - Each sensor schedules one `after()` timer for its next change, capped at 15 minutes against
    wall-clock steps.
  - Nothing is sent before the first read, so a restart doesn't blink Loxone outputs.
  - `time` sends 1 000 000 minutes (or 0 for dates) when there is no event.
- **Dismiss** hides one occurrence: a matching one that is active by its own lead and lag, or one
  that a sensor of the instance shows right now. Dismissals live in the store until the
  occurrence's end + 1 day, so the list doesn't grow.
- **Old bugs fixed, one test each:** the end time counts, one read at start instead of two, and
  pruned dismissals instead of a list that grows forever. Recurring events, which the old
  integration ignored, are expanded.
- **Verified.** 46 tests against a node:http feed server with mocked clocks: time zones (also with
  the process zone switched), DST gaps, recurrence edge cases, broken and huge feeds, failures and
  401s, dismissals, and a stop that leaves no handles. The bundle needs only `node:` builtins.

## Implementation notes: documentation site

`apps/docs`: a static site for people who run Nexus and people who write plugins. Internal design
stays in `docs/`.

- **Own small generator instead of VitePress**, because every URL must be relative.
  - The web UI works under path prefixes (code-server's `/proxy/<port>/`, Home Assistant ingress),
    and one build should also work on GitHub or GitLab Pages. VitePress only supports a fixed
    absolute base.
  - `DocsBuilder` renders `content/**/*.md` in the order of `content/nav.json`. It uses markdown-it
    with Shiki (light and dark), heading ids, and `.md` links turned into `.html`.
  - It adds a sidebar, a table of contents, previous/next links, a client-side search over
    `search-index.json`, and a self-contained 404 page that finds the site root by probing.
  - The build fails on broken links or anchors and on absolute URLs. Paths in `nav.json` must stay
    inside `content/`. Includes take only markdown files inside the repository.
- **One source of truth.**
  - The plugin pages include the plugins' READMEs (`<!--@include: …-->`).
  - The SDK reference is generated by TypeDoc (typedoc-plugin-markdown) from the SDK's JSDoc into
    the git-ignored `content/reference/sdk/`.
  - "SDK at a glance" is written by hand for quick lookup. A test fails when an SDK export is
    missing from it.
- **Serving.**
  - `DocsSite` serves `NEXUS_DOCS_DIR` at `/docs/` without a login. `/docs` redirects relatively,
    and only files are served: directories and dotfiles get the 404 page, with a `<base>` for its
    depth.
  - Without `NEXUS_DOCS_DIR`, `/docs` explains how to enable it instead of falling through to the
    web UI. `npm run dev` presets it.
  - The UI header and the login page link to `docs/`, relative to the page.
- **Agents.**
  - `doc-writer` maintains the pages along with the JSDoc.
  - `plugin-dev` works from these pages instead of the SDK source, and reports every question they
    didn't answer as a docs gap. Building Calendar that way found eight.

## Design: plugin installer (M5e)

Status: **built** in three steps: M5e-1 (install pipeline, boot loading, uninstall, API), M5e-2
(versions, hot update, rollback) and M5e-3 (UI). The implementation notes at the end of this
section say where the build differs from the design below. Decisions in ADR 0009 (archives
and git) and ADR 0010 (versions, precedence, hot update). See "Implementation notes: M5e-1" at the
end of this section for where the build differs from the design below.

### On disk

```
data/plugins/                       0700, created at boot
  .staging/<uuid>/                  one install attempt; wiped at every boot
    git/                            GitSource only: the bare, shallow clone
    package/                        what will be installed
  <id>/<version>/package.json       copied verbatim
  <id>/<version>/<entry>            the bundle, at the manifest's relative path (e.g. dist/plugin.js)
  <id>/<version>/<entry>.map        only if the source has it
  <id>/<version>/README.md          only if the source has one (README.md, readme.md or Readme.md,
                                    at most 512 KiB; a larger one is left out, the install goes on);
                                    GET /api/plugin-packages/:id/readme serves it (PluginReadme),
                                    from a development copy's folder when no version is installed
```

- **Only `package.json`, the bundle and its source map are installed.** Nothing else from a ZIP or
  a repository is ever written, so archive paths never become file system paths (ADR 0009).
- `.staging` is inside `data/plugins`, so the final `rename` is on the same file system and
  atomic. `id` can't start with a dot (manifest rule), so no plugin collides with `.staging`.
- At most two versions per plugin: the active one and the one active before it.

### Database (migration 5, `plugin_packages`)

`plugin_instances`, `plugin_signals` and `plugin_store` exist (migration 3). New:

```sql
CREATE TABLE plugin_versions (
  plugin_id TEXT NOT NULL,
  version TEXT NOT NULL,              -- strict semver, also the directory name
  name TEXT NOT NULL,
  icon TEXT,
  entry TEXT NOT NULL,                -- normalized relative path
  source_kind TEXT NOT NULL CHECK (source_kind IN ('zip', 'git', 'local')),
  source TEXT NOT NULL,               -- git: https URL; zip: the uploaded file name; local: the folder
  ref TEXT,                           -- git: the branch or tag asked for
  commit_sha TEXT,                    -- git: the resolved commit
  archive_sha256 TEXT,                -- zip: of the uploaded archive, to compare with a release
  bundle_sha256 TEXT NOT NULL,        -- of the entry file; re-checked at boot and on activation
  description TEXT NOT NULL,          -- PluginDescription JSON from the describe step
  installed_at INTEGER NOT NULL,
  installed_by TEXT NOT NULL,
  PRIMARY KEY (plugin_id, version)
);
CREATE TABLE plugin_packages (
  id TEXT PRIMARY KEY,
  active_version TEXT NOT NULL,
  previous_version TEXT,              -- the rollback target; NULL after the first install
  FOREIGN KEY (id, active_version) REFERENCES plugin_versions(plugin_id, version),
  FOREIGN KEY (id, previous_version) REFERENCES plugin_versions(plugin_id, version)
);
```

- The database is the source of truth, the directory holds the files, the catalog is the
  projection. A version directory without a row is an orphan and deleted at boot; a row whose
  files are missing or whose `bundle_sha256` doesn't match makes that version unavailable.
- The description is stored so a boot runs no plugin code outside instances. If it no longer
  parses (a newer Nexus changed `PluginDescriptionSchema`), the loader describes the bundle again
  in a throwaway worker and updates the row.
- `plugin_instances.plugin` stays a plain id without a foreign key: dev plugins and unavailable
  instances have no package row.

### Classes

`apps/server/src/plugins/install/` (one class per file):

| Class | Responsibility |
|---|---|
| `InstallError` | `reason` (`invalid-source`, `invalid-package`, `describe-failed`, `busy`, `exists`, `conflict`, `git-failed`, `timeout`, `no-space`) and its HTTP status. Messages are safe to show. |
| `InstallLimits` | The numbers in one place: 5,000 entries, 50 MiB unpacked (declared total), 20 MiB bundle, 256 KiB package.json, 100 MiB git object store, 120 s git, 15 min pending TTL, describe timings (hello 10 s, request 10 s, grace 2 s). |
| `PluginDirectory` | The layout above. Every path goes through one `inside(root, ...parts)` check (`path.relative` must not start with `..` or be absolute). `moveIn(stagedDir, id, version)` (mkdir `<id>`, `rename`; `EEXIST`/`ENOTEMPTY` → `exists`), `removeVersion`, `removePlugin`, `listOnDisk()`, `sha256(file)` (streamed). |
| `StagingArea` | `create()` → `.staging/<uuid>` (0700), `remove(dir)` (best effort, logged), `sweep()` at boot. |
| `ManifestValidator` | package.json text → `InstallManifest`: size cap, JSON, `PluginManifestSchema` extended with a strict semver `version` (≤ 64 chars, no default), `type: "module"` unless the entry ends in `.mjs`, and the entry rules below. |
| `PluginSource` | Interface: `fetch(packageDir, signal): Promise<{ origin, manifest }>`. Writes `package.json` and the entry (and map) into `packageDir`. |
| `ZipEntryPolicy` | Per entry: name not absolute, no drive letter, no backslash, no NUL or control characters, no `..` segment, ≤ 512 chars, not a symlink (Unix mode `0o120000` in `externalFileAttributes >>> 16` when made on Unix), not encrypted, no duplicate name. In total: ≤ 5,000 entries, declared uncompressed sum ≤ 50 MiB. |
| `ZipArchive` | The only class that uses yauzl (`fromBuffer`, `lazyEntries`, `validateEntrySizes`, `strictFileNames`). Lists every entry through the policy before anything is extracted; `extract(entry, file, maxBytes)` streams one entry with a byte counter. |
| `ZipSource` | The package root is the archive root, or its single top-level directory (ignoring `__MACOSX/` and `.DS_Store`), which must hold `package.json`. Reads and validates it, extracts the entry. Origin: file name and the archive's sha256. |
| `GitUrl` | Value object: `GitUrl.parse(url, ref, schemes = ["https"])`. Rules in the security part. |
| `GitRunner` | `execFile` of `git` with a fixed argv prefix, a minimal environment, a timeout, `maxBuffer` and `killSignal: "SIGKILL"`. The binary and the schemes are injectable for tests. |
| `GitSource` | Shallow, filtered, bare-like clone without a working tree; reads `package.json` and the entry as blobs (flow below). Origin: URL, ref, commit. |
| `PackageInspector` | On the staged package: `lstat` package.json and entry (regular files, size caps), bundle sha256, then `PackageDescriber.describe(entry)` with the install timings. Returns a `StagedPackage`. |
| `PendingInstalls` | At most one staged install, by a fresh `stagingId`, expiring after 15 minutes (`after()`); a new stage discards the previous one. Disposing removes its directory. |
| `PluginVersions` | Commits and switches versions: `commit(staged, by)` (moveIn, then one transaction: insert version, set active and previous), `activate(id, version)`, `prune(id)` (rows and directories other than active and previous), `uninstall(id)`, `package(id, version)` → `PluginPackage` after the sha256 check. |
| `PluginInstaller` | The two phases: `stage(source, by)` and `confirm(stagingId, expectedActive, by)`, plus `discard`. Holds the operation lock. |
| `InstalledPluginLoader` | Boot: `sweep()`, delete orphan directories, prune, then load every active version into the catalog. One broken plugin is logged and skipped. |
| `UpdateImpact` | What switching to a description does to existing instances: signals whose capability disappears, capabilities whose value type changes, new required top-level config fields without a default. |

Elsewhere:
- `db/repositories/PluginPackageRepository.ts`: both new tables.
- `services/PluginPackageService.ts`: what the controller calls. After a commit or activation it
  updates the catalog and, if the installed copy is the effective one, calls
  `PluginService.packageChanged`.
- `http/controllers/PluginPackageController.ts`, with its own scope for the ZIP upload.
- `plugins/PluginCatalog.ts`: two layers, `setInstalled`/`removeInstalled` and `setDevelopment`.
  `get(id)` returns the development entry if there is one, else the installed one. `CatalogEntry`
  gets `source: "development" | "installed"`, the installed version, and `shadows` (the installed
  version a development copy hides).
- `NexusApp.ts` is at 197 lines, so the plugin wiring (describer, both loaders, installer,
  package service) moves into a `PluginAssembly` helper that only `NexusApp` constructs, like
  `createHttp`. Boot order: installed plugins, then development plugins, then
  `PluginService.load()`.
- **Core** (small, in `packages/core/src/plugins/`):
  - `PluginPackage` gets an optional `version`, for messages.
  - `PluginSignals.refresh()`: re-resolves every signal against the current package. A capability
    that is gone keeps the signal registered with its old value type (so its wires stay) and marks
    it **orphaned** with `"<name> <version> no longer offers sensor \"x\""`. A changed value type
    goes through `registry.update`, so `WireEngine` rebuilds or drops its wires (and restarts them
    after a rollback).
  - `PluginSupervisor.update(_, pkg)` calls `refresh()` when the package changes.
    `PluginCalls.addAll()` skips orphaned signals, so the worker's "unknown capability" doesn't
    replace the clearer message.
  - Nothing in core knows about installing, files or versions.

### Development and installed plugins with the same id

The development copy wins while `NEXUS_DEV_PLUGINS_DIR` provides it (ADR 0010). Setting that
variable is an explicit choice of whoever runs the process, and it is never set in production.
Installing or activating a version of a shadowed plugin only changes the database and the
installed layer; the instances keep running the development copy. The API marks the package as
shadowed. Install tests and the walkthrough use a plugin id that isn't in the workspace.

### Install flow

**Phase 1, stage** (`POST /api/plugin-packages/stage/{git,zip}`). The UI shows the trust warning
*before* this request, because describing runs the plugin's code once.

1. Take the operation lock, or answer 409 `busy`. One install, activation or uninstall runs at a
   time, server-wide.
2. Discard a pending install, then `StagingArea.create()`.
3. Source fetch into `<staging>/package/`:
   - **ZIP:** `ZipArchive` checks every entry through `ZipEntryPolicy` first. Then `ZipSource`
     finds the root, extracts and validates `package.json` (≤ 256 KiB), and extracts only the
     entry (≤ 20 MiB, byte-counted; yauzl also fails on an entry larger than declared) and
     `<entry>.map` if present.
   - **Git:** with `GitRunner`, every call under the same hardening:
     1. `git clone --depth 1 --single-branch --no-tags --no-recurse-submodules --filter=blob:none
        --no-checkout --branch=<ref> -- <url> <staging>/git`. No working tree, so no checkout,
        no symlinks, no `.gitattributes` filters and no checkout hooks. A server without partial
        clone support ignores `--filter` (the depth and timeout still bound it).
     2. `git rev-parse HEAD`: the commit.
     3. `git ls-tree HEAD -- package.json <entry>`: mode must be `100644` or `100755` (not
        `120000` symlink, not `160000` submodule). `git cat-file -s` gives the size before
        anything is fetched.
     4. `git cat-file blob HEAD:<path>` (fetches that one blob) with `maxBuffer` = cap + 1.
        A bundle that starts with `version https://git-lfs` is refused with "stored with Git LFS".
     5. The object store must stay under 100 MiB. `<staging>/git` is deleted once the files are
        read.
4. **Manifest rules** (`ManifestValidator`):
   - `apiVersion` 1.
   - `id` matches `^[a-z0-9][a-z0-9._-]*$`, ≤ 64 characters, not `loxone` or `system` (the list
     stays in `PluginManifest.ts`).
   - `name` 1..100, `icon` optional, ≤ 50, `^[a-z0-9-]+$`.
   - `version` strict semver.
   - `entry` relative POSIX path: no leading `/` or `./`, no `..` segment, no backslash, no NUL,
     ends in `.js` or `.mjs`. `PluginDirectory.inside` checks the joined path again.
5. `PackageInspector`: the entry and package.json are regular files (`lstat`), within their caps.
   The bundle's sha256. Then the throwaway describe worker: `PluginWorker` with `env: {}`, a
   128 MB heap, hello within 10 s and the description within 10 s; it is terminated after.
6. Compare with what is installed:
   - Same id and version with the same `bundle_sha256` → `sameAsInstalled`, and confirming only
     activates it.
   - Same id and version with other content → 409 `exists` ("raise the version"). The local
     repository avoids that for rebuilds: `BuildStamp` appends a hash of the bundle and the README as build metadata
     (`0.1.0+3f6c2a1b`) to a version without one, in the listing and in the staged `package.json`.
   - Otherwise `UpdateImpact` against the active version and the stored instances.
7. Register in `PendingInstalls`, release the lock, answer 201 with a `StagedInstallDto`.

Any failure in 2–6 removes the staging directory, releases the lock and answers with the
`InstallError`'s status. Unexpected errors are 500, logged with the stack.

**Phase 2, confirm** (`POST /api/plugin-packages/stage/:stagingId/confirm` with
`{ expectedActive }`):

1. Take the lock. Unknown or expired `stagingId` → 404.
2. `expectedActive` must equal the current active version (or `null` for a new plugin), else
   409 `conflict` ("changed meanwhile, check again"): the impact shown would be stale.
3. Re-check the staged bundle's sha256.
4. `PluginVersions.commit`: `rename` into `<id>/<version>`, then one transaction for the
   version row and the package row (`previous_version` = the old active). If the transaction
   fails, the directory is removed again.
5. `catalog.setInstalled`. If the installed copy is the effective one,
   `PluginService.packageChanged(pkg)`: see hot update.
6. `prune(id)`, remove the staging directory, release the lock, answer 200 with an
   `InstallOutcomeDto` (the package plus each instance's state after its restart).

**Crash and disk full.**

| Interrupted | What the next boot finds | What happens |
|---|---|---|
| during phase 1 | a `.staging/<uuid>` | `sweep()` deletes it; nothing else changed |
| after the `rename`, before the transaction | `<id>/<version>` without a row | deleted as an orphan |
| after the transaction | the new version active | loaded normally, instances start on it |
| during `prune` | extra rows or directories | `prune` runs again at boot |

- `ENOSPC` or `EDQUOT` anywhere becomes `no-space` (507), after the same cleanup. There is no free
  space check before an install.
- Partially written files can't be activated: the sha256 is checked on confirm, on activation and
  at boot.

### Hot update and rollback

Activation is the same for an update (confirm) and a rollback or roll-forward
(`POST /api/plugin-packages/:id/activate { version }`; only the active or previous version exists):

- **Running instances** restart on the new package through `PluginManager.replacePackage`. Each
  supervisor's lifecycle queue serializes it: graceful shutdown (5 s grace), swap, `refresh()`,
  start. Instances of other plugins are untouched, and the server never restarts (ADR 0001).
- **Instances that weren't running:** `PluginService.packageChanged` notes beforehand which
  enabled instances were in `error` or `crashed`, and starts them on the new version (a fix
  should take effect). Instances stopped by hand stay stopped. Unavailable instances get a
  supervisor and start if enabled, as today.
- **Signals:** an orphaned signal keeps its row, topic, wires and last value, shows its error,
  and receives nothing. After a rollback, `refresh()` clears the mark and `addAll` creates it
  again. A changed value type rebuilds its wires (WireEngine checks direction, not value types, so
  they stay active and values convert). Nothing is deleted automatically.
- **Stored config:** never migrated. The plugin validates it in `init`. An instance whose config
  the new schema refuses ends in `error` with the plugin's message. The user then fixes it in the
  form, which now renders the new schema, or rolls back. Secret fields follow the effective
  description.
- **Store:** kept as it is. Authors must read their own older store formats and tolerate newer
  ones (rollback); this goes into `plugin-authoring.md`.
- **In-flight commands:** a request pending when the old worker shuts down fails, so its bus
  `result` is `ok: false` with "the plugin was stopped". A command arriving during the restart
  gets "not running" at once. Nothing is queued or replayed, so a device never receives a stale
  command later; the next state change or a Miniserver resend brings it up to date.
- **What the user sees:** before confirming, the review lists the instances that will restart and
  the impact. Afterwards it shows every instance's state, with a "roll back to x" button. There
  is no automatic rollback.

### Uninstall

`DELETE /api/plugin-packages/:id` is refused with 409 while any instance of that plugin id exists,
running or not, and the message names them. Deleting instances also deletes their signals and
wires, so it stays a separate, explicit action on the instance page. Otherwise it removes the
rows, every version directory and the installed catalog layer. A development copy stays available.

### REST API

All routes need a session (every user is an admin in v1; once roles exist, these routes are
admin-only). DTOs and input schemas go into `packages/api/src/pluginPackages.ts`.

| Route | Body | Answer |
|---|---|---|
| `GET /api/plugin-packages` | | `InstalledPluginDto[]` |
| `POST /api/plugin-packages/stage/git` | `GitInstallInput { url, ref }` | 201 `StagedInstallDto` |
| `POST /api/plugin-packages/stage/zip?name=<file>` | raw bytes, `application/zip` or `application/octet-stream`, `bodyLimit` 50 MiB in its own scope | 201 `StagedInstallDto` |
| `GET /api/plugin-packages/repository` | | `RepositoryPluginDto[]` (M5e-1: the local plugin repository) |
| `POST /api/plugin-packages/stage/local` | `LocalInstallInput { folder }` | 201 `StagedInstallDto` |
| `POST /api/plugin-packages/stage/:stagingId/confirm` | `{ expectedActive: string \| null }` | 200 `InstallOutcomeDto` |
| `DELETE /api/plugin-packages/stage/:stagingId` | | 204 |
| `GET /api/plugin-packages/:id/versions/:version/impact` | | `UpdateImpactDto` |
| `POST /api/plugin-packages/:id/activate` | `{ version }` | 200 `InstallOutcomeDto` |
| `DELETE /api/plugin-packages/:id` | | 204, or 409 with the instances |

- `PluginVersionDto`: `version`, `source` (`{ kind: "git", url, ref, commit }`,
  `{ kind: "zip", fileName, archiveSha256 }` or `{ kind: "local", folder }`), `bundleSha256`, `installedAt`, `installedBy`,
  `available`, `problem?`.
- `InstalledPluginDto`: `id`, `name`, `icon?`, `active` and `previous?` (`PluginVersionDto`),
  `instances` (count), `shadowedByDevelopment`.
- `StagedInstallDto`: `stagingId`, `expiresAt`, the manifest (`id`, `name`, `version`), `source`,
  `bundleSha256`, sensor and actuator counts, `installedVersion?`, `sameAsInstalled`, `impact`.
- `UpdateImpactDto`: `instances`, `removed` and `retyped` capabilities (each with how many
  signals use it), `newRequiredConfig`.
- `InstallOutcomeDto`: `plugin` plus `instances: { id, label, state, lastError? }[]`.
- `PluginPackageDto.source` (`GET /api/plugins`) becomes `"development" | "installed"`.
- Errors: 400 invalid source or package and describe failures; 404; 409 `busy`, `exists`,
  `conflict` and uninstall with instances; 413 upload too large; 502 git failed (unreachable,
  ref not found); 504 git timeout; 507 no space.

### UI

- **Plugins** page gets two tabs: Instances (as today) and **Installed** (`/plugins/installed`;
  vue-router ranks the static path above `/plugins/:id`).
- **Installed** lists one card per plugin:
  - name and icon, the active version, and its source (git URL, ref and short commit with copy;
    or the ZIP name and short archive sha256), when and by whom
  - the instance count, plus badges for "development copy runs instead" and "files missing"
  - actions: **Update** (the install dialog, prefilled with the git URL), **Roll back to <previous>**
    (a dialog with the impact) and **Uninstall** (disabled with the instance names while instances
    exist)
- **Install dialog**, three steps:
  1. **Source:** Git (URL, branch or tag) or ZIP (file picker). A permanent warning: "Plugins are
     trusted code. A plugin runs inside Nexus with the same access to files and the network as
     Nexus itself; worker threads are not a sandbox. Checking a plugin already runs its code once.
     Only install plugins whose source you trust." The "Fetch and check" button needs an
     "I trust this source" checkbox.
  2. **Review:** name, id, version (new, or "1.2.0 → 1.3.0", or "older than the active one"), the
     source with the full commit or archive sha256, the bundle sha256, the capability counts, and
     the impact: instances that restart, signals that lose their capability, new required
     settings. Install or Cancel (cancel discards the staged install).
  3. **Result:** each instance's state after the restart, with a roll back button.
- Components: `InstallDialog`, `InstallSourceForm`, `InstallReview`, `TrustWarning`,
  `InstalledPluginCard`, `UpdateImpactList`, and a `PluginPackageApi` facade.

### Security

- **Who can install:** a logged-in user (everyone is an admin in v1). CSRF is covered by
  SameSite=Strict and the Origin check on state-changing requests, which includes the upload.
- **Trusted code, not defended:** installing is running code by design. A plugin can read the
  database file, open connections and use everything Nexus can. The describe step already runs it
  in staging. There are no signatures and no sandbox; a later `child_process` transport with
  `--permission` stays possible (ADR 0001). The trust warning says so before anything is fetched.
- **Defended:**
  - **Malicious archives:**
    - archive paths are never used as write paths
    - absolute, drive, backslash, `..` and control-character names are refused; so are symlinks,
      encrypted entries and duplicates
    - more than 5,000 entries, or a declared total over 50 MiB, is refused
    - an entry larger than it declares fails in yauzl, and extraction is byte-counted against its
      cap
    - the upload body is capped at 50 MiB
  - **Git URL tricks:**
    - `new URL` must succeed with `https:`. That rules out `ext::`, `file://`, `ssh://`, `git://`,
      scp syntax (`git@host:x`), local paths, and anything starting with `-`.
    - No user info in the URL (no tokens stored or logged). Host required; ≤ 2,048 characters;
      no whitespace or control characters; the normalized `href` is what runs.
  - **Ref:** `^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$`, no `..`, `//`, `@{` or trailing `.lock`/`/`.
    Passed as `--branch=<ref>`; the URL comes after `--`.
  - **Git environment:**
    - only `PATH`, `HOME=<staging>`, `LC_ALL=C`, `GIT_TERMINAL_PROMPT=0`, `GIT_CONFIG_NOSYSTEM=1`,
      `GIT_CONFIG_GLOBAL=/dev/null`, `GIT_ALLOW_PROTOCOL=https` (tests: their scheme)
    - every call gets `-c protocol.allow=never -c protocol.https.allow=always -c credential.helper=
      -c core.hooksPath=/dev/null -c core.fsmonitor=false -c core.symlinks=false`
    - no askpass, no inherited proxy or SSL variables, so TLS verification stays on
  - **Huge repos:** depth 1, one branch, no tags, blobs filtered, a 120 s timeout with SIGKILL,
    the 100 MiB object store cap, and `maxBuffer` on every read.
  - **Symlinks in a checkout:** there is no checkout. Tree modes are checked for the two files we
    read, and the copies in staging are `lstat`ed again.
  - **Path traversal:** the manifest entry rules, and `PluginDirectory.inside` on every join.
    `id` and `version` are restricted to characters that can't form a path segment like `..`.
  - **DoS by repeated installs:** one operation at a time (409), one pending install with a TTL,
    two versions per plugin, staging wiped at boot.
  - **Tampering or corruption at rest:** sha256 checked at boot and on activation. A writable
    data directory already owns the server, so this is integrity, not a defense.
- **Logging (pino, `component: "installer"`):**
  - every stage, confirm, activate, discard and uninstall at info, with the user, the source
    (URL and ref, or file name and archive sha256), the commit, `id`, `version` and bundle sha256
  - refused archives and URLs at warn, with the reason
  - git's stderr at debug, cut to 2,000 characters; it can't hold credentials, because the URL
    has none

### Tests

- **Fixtures are built in the tests, not checked in:**
  - Plugin bundles come from tiny SDK plugins under `apps/server/src/test-support/plugins/`,
    built with esbuild's API (`conditions: ["@lox-nexus/source"]`) once per test file. v1 offers
    sensors `a` and `b`. v2 drops `b` and adds a required setting.
  - Archives are made with fflate's `zipSync`. A symlink entry is `attrs: 0o120777 << 16` with
    `os: 3`.
  - A lying size, the encrypted bit and a duplicate name are byte patches of the central
    directory (a small helper).
  - The bomb is 51 MiB of zeros, about 50 KB zipped.
  - esbuild and fflate become devDependencies of `apps/server`.
- **ZIP:** zip-slip (`../x`, `a/../../x`), absolute, `C:\x`, a backslash, a symlink, 5,001 entries,
  the bomb, a lying size, encrypted, a duplicate `package.json`, no `package.json`, two top-level
  directories, a `__MACOSX` wrapper (accepted), a missing entry, `entry: "../x.js"`, an entry that
  is a directory, a bundle over 20 MiB.
- **Git without network:**
  - `GitSource` and `GitUrl` take the allowed schemes, `["https"]` by default. Tests pass
    `["file"]` and use a local bare repository made with `git init --bare` and
    `uploadpack.allowFilter true`. The repository holds the built fixture with its bundle
    committed, a tag, a symlinked entry (`120000`), a submodule entry (`160000`) and an LFS pointer.
  - Unit tests check `GitUrl` against `ext::sh -c x`, `file:///`, `/tmp/x`, `git@host:x`,
    `ssh://`, `http://`, `-uhttps://…`, `--upload-pack=x`, user info, whitespace and length.
  - A test asserts `GitRunner`'s argv and environment.
  - A `HOME` with a `.gitconfig` whose `core.hooksPath` script writes a marker proves the global
    config is ignored.
  - A fake `git` that sleeps, with a 100 ms timeout, proves the kill.
  - An opt-in live test (`NEXUS_GIT_LIVE_URL`) clones a public repository over real https.
- **Same plugin from git and ZIP:** both installs of the fixture give the same `bundle_sha256` and
  description. The second is `sameAsInstalled`.
- **Crash and disk full:**
  - `InstalledPluginLoader` gets a prepared directory: staging leftovers, an orphan version, a
    row without files and a sha256 mismatch.
  - `ENOSPC` is simulated with `mock.method(fs.promises, "rename" | "writeFile")`.
  - The transaction failure is simulated through the repository.
- **Concurrency:** two parallel stages (409 `busy`), confirm with a stale `expectedActive` (409),
  an expired `stagingId` (404, with `mock.timers`), and a new stage that discards the pending one.
- **Hot update** (real `WorkerTransport`, through the HTTP API of one `NexusApp`):
  1. install v1, create two instances, signals `a` and `b`, and a wire from `b` to a Loxone
     output
  2. confirm v2: the instances restart and run; `b` is orphaned, its wire is kept but inactive;
     an instance of another plugin keeps its worker (same thread id); `/api/health` answers
     throughout
  3. roll back: `b` works again and its wire is active
  4. restart the app: the active version and the previous one persist
- **Uninstall:** 409 with instances; afterwards no rows and no directories.
- **Headless walkthrough** (M5e-3): install the fixture from a ZIP and from git, review, confirm,
  check an instance, update, roll back, try to uninstall with instances.
  - The cached Playwright Chromium (`~/.cache/ms-playwright/chromium*-1248`) is missing system
    libraries here: nss, nspr, atk, at-spi, dbus, cups, Xcomposite, Xdamage, Xfixes, Xrandr, gbm,
    xkbcommon and asound.
  - Either the user installs them (`npx playwright install-deps chromium`, needs root), or the
    `.deb`s are fetched with `apt-get download` and unpacked with `dpkg -x` into a user directory
    used through `LD_LIBRARY_PATH`. Either way needs the user's permission.

### Implementation notes: M5e-1

- **Third source: the local plugin repository** (user decision for open question 5).
  - `NEXUS_PLUGIN_REPOSITORY` names a folder with one built plugin per subfolder. It defaults to
    `<dataDir>/plugin-repository`, and `npm run dev` presets the workspace's `plugins/`.
  - `LocalRepository` lists it on every request; only package.json is read, and folders without a
    `loxNexus` block are skipped. Unbuilt plugins are listed with a problem.
  - `LocalSource` copies package.json, the bundle and its map. All three must be plain files
    (`lstat`), and their real paths must stay inside the folder (`realpath`), so neither a symlinked
    file nor a symlinked folder leads out.
  - The client only ever sends a folder name from the listing (`POST stage/local { folder }`).
    `GET /api/plugin-packages/repository` lists the folders with their installed version.
  - The source stored for the version is the folder's absolute path.
  - `npm run plugins:build` builds the first-party bundles. This is how fronius, homeassistant and
    calendar reach an installation until M6 publishes release ZIPs.
- **Git runs in its own process group** (`GitProcess`). With a partial clone, `cat-file` leaves the
  download to helper processes (`git fetch`, upload-pack), so the timeout, the stdout cap and a
  shutdown kill the whole group.
  - **One deadline per fetch:** the 120 s budget is shared by all calls, so one stage can't hold the
    lock for several minutes.
  - **Size cap while downloading:** the clone's size is measured every 250 ms while git runs, and
    going over 100 MiB kills it. The cap therefore holds while downloading, not only afterwards.
  - **No `cat-file -s`:** asking for a size already fetches the blob.
  - **Messages:** git's stderr has the staging path replaced. "No space left on device" becomes
    507.
- **The operation lock lives in `PluginPackageService`** (`OperationLock`). It covers the commit,
  the catalog update and `packageChanged`, not just the installer's own steps.
- **Updates came with M5e-2** (see its notes below). In M5e-1 another version answered 409.
- **Uninstall** removes the catalog entry before any file is touched, so no instance can be created
  meanwhile. Folders that can't be removed are logged and become orphans for the next boot. A
  commit removes a leftover folder that has no row before moving in.
- **Boot never fails over leftovers.** Unreadable or undeletable folders are logged and skipped.
- **Other differences:**
  - ZIP names are also checked as raw bytes: yauzl decodes legacy CP437 names, which turns control
    bytes into glyphs.
  - The upload accepts `application/x-zip-compressed` as well, which is what Windows browsers send.
  - Git URLs with a query or fragment are refused.
  - `DevPluginLoader` ignores changes under `dist/` and `node_modules/`, so building the plugins
    doesn't restart every development instance.

### Implementation notes: M5e-2

- **Versions.** A version number names one bundle for good: staging a stored version (active or
  previous) with another bundle is 409 `exists`. Staging a stored version with the same bundle
  activates it on confirm, and when its files are missing or changed, the staged copy repairs them
  first (`PluginVersions.repair`), so re-installing is also the way to fix a broken version. After
  every confirm, versions other than active and previous are pruned; a prune failure is logged,
  never fails the confirm.
- **Switching** goes through `PluginSwitch`: load the version (sha256, description), point the
  catalog at it, then `PluginService.packageChanged` unless a development copy hides it.
  - `activate` loads the previous version *before* switching the rows, so missing files answer
    400 and nothing changes.
  - `confirm` can only find out after the rows are written. If the switch then fails, the rows are
    put back exactly (`PluginPackageRepository.restore`), or a new plugin is uninstalled again,
    and the error is answered.
- **`packageChanged`** notes the enabled instances in `error` or `crashed` before restarting, and
  afterwards starts those that are still the same supervisor, still enabled and stopped, so one
  stopped or disabled meanwhile stays down. Waiting instances are attached synchronously, so a
  development reload at the same time can't attach one twice. Starts run in parallel.
- **Orphaned signals** (`PluginSignals.refresh/restore`):
  - an update marks signals whose capability is gone as orphaned; they stay registered with
    their topic and wires, are left out of `signal.add`, and an orphaned actuator answers commands
    with its reason, running or not
  - at boot, and when a waiting instance is attached, stored rows go through `restore()`, so an
    orphan survives a restart, typed `any` until a version offers its capability again
  - a slug change moves orphans' topics too; editing one answers 409 ("roll the plugin back or
    delete the signal"); deleting one works as usual
- **Secrets across versions:** instance DTOs show only fields the effective schema declares, not
  as secret. A field a newer version renamed or dropped is hidden too, and kept on save, so a
  rollback finds it again.
- **Impact** (`UpdateImpact`): capabilities removed (used by signals or offered before, and not
  offered next, also when the active description is unknown), retyped, and required settings that
  are new or were optional before; the config schema is read with `safeParse`. Shown on staging
  (`StagedInstallDto.impact`) and for a rollback (`GET …/:id/versions/:version/impact`).
- **API:** `POST /api/plugin-packages/:id/activate { version, expectedActive }` switches to the
  previous version (409 when the active one changed meanwhile or another version is named).
- **Every unhandled promise rejection in a plugin worker** now goes to `Plugin.unhandledRejection`
  (default: log an error with the stack) instead of ending the worker; found with the script
  plugin, whose users forget `.catch`.

### Implementation notes: M5e-3

- **Where:** the Plugins page has two tabs (`PluginTabs`, router links): Instances (`/plugins`) and
  Installed (`/plugins/installed`, registered before `/plugins/:id`). The top navigation keeps a
  section marked on its detail routes.
- **Installed:** `InstalledPluginCard` per plugin, plus "In the local plugin repository" with the
  plugins that aren't installed or differ from the active version (`VersionChange`, semver
  precedence). Uninstall is disabled while instances exist.
- **`InstallDialog`:** source (`InstallSourceForm`: local repository, git, ZIP; `TrustWarning`;
  "Fetch and check" needs "I trust this source"), review (`InstallReview` with `UpdateImpactList`),
  result (`InstallResult`). Confirm sends the staged `installedVersion` as `expectedActive`. Back
  and closing before confirming discard the staged files. "Update" prefills the source the active
  version came from (`InstallSources.updateOf`).
- **`RollbackDialog`** loads the impact of the previous version and calls `activate`.
- **`UpdateImpactDto.restored`** (added for the rollback dialog): capabilities orphaned signals
  use that the next version offers again; only reported when the current description is known.
- **Dialogs can't be closed while a request runs** (no close button, Escape and outside clicks
  ignored), so a late answer never lands in a closed or reopened dialog. The source form stays
  mounted during the review, so Back returns to what was entered; "I trust this source" resets
  when the source changes. A 404 or 409 on confirm (expired, or changed meanwhile) offers "Check
  again".
- **Versions in the UI** follow semver precedence, except that two strings with the same precedence
  (`1.0.0+a`, `1.0.0+b`) are different stored versions ("another build").
- **Not built from the design:** a roll back button on the result step (the card has it), plugin
  icons on the cards, and the names of the instances that block an uninstall (the DTO has a count;
  the card says to delete them on the Instances tab).
- **Walkthrough:** headless Chromium (Playwright from the npx cache, the cached headless shell)
  against a real server: local install, ZIP install, update with a removed sensor, rollback with
  it offered again, uninstall disabled with an instance, phone width. Git isn't part of it: the
  server accepts only https and the walkthrough has no network.

### Left out on purpose

- ZIPs from URLs, private repositories and tokens, commit SHAs as refs, plugins in a subdirectory
  of a repository, signatures.
- Update checks, automatic rollback, more than two versions, a free-space check before installing.
- Built-in first-party plugins in production (open question below).

### Open questions (recommendations in the M5e report; to be confirmed by the user)

1. ZIP from an https URL, or uploads only? Recommended: uploads only for now.
2. Private repositories? Recommended: not in M5e. Later, a per-host credential (write-only, passed
   to git through `GIT_CONFIG_COUNT` with `http.extraHeader`, never in argv or the URL).
3. Update checks? Recommended: none automatic; later a "check for updates" button
   (`git ls-remote --tags`) for git-installed plugins.
4. Commit SHAs as refs? Recommended: branches and tags only; the resolved commit is shown and
   stored.
5. How do fronius, homeassistant and calendar reach a production install, now that `dist/` is
   git-ignored? **Decided:** a local plugin repository that Nexus lists by itself (see
   "Implementation notes: M5e-1"); release ZIPs from CI in M6 stay the plan for production.
6. Git in the runtime image? Recommended: yes, the M6 Dockerfile installs git. Without it,
   `GitSource` answers "git is not installed" and ZIP still works.

## Implementation notes: value history (statistics S1)

Plan and reasons: ADR 0012. Charts, API and the InfluxDB export follow in later milestones.

- **Selection** (`packages/core/src/selection/`): `SignalSelection` decides per signal whether a
  consumer takes it: a rule on the signal first, then a rule on its owner (Miniserver or plugin
  instance), then the mode (`all` or `selected`). `SelectedValues` subscribes to `#`, finds the
  signal of a topic (`SignalRegistry.atTopic`, the source when a topic has both) and passes on
  states and commands of selected signals, as subscribers see them (forced values, never shadowed
  ones). Consumers are `history` and, later, plugin instances that watch signals. The server keeps
  modes and rules in the main database (`selection_modes`, `selection_rules`, migration 6) and
  caches one `SignalSelection` per consumer (`SelectionService`), dropped when a signal is
  unregistered, since its rules went with it. Without a stored mode a consumer takes nothing.
- **Recording** (`packages/core/src/history/`):
  - `ValueProjection` turns a value into a number for charts and text for the rest: on/off as
    0/1, a T5 as its bitmask, lights as their brightness with colour and fade time as JSON text,
    text (cut at 1000 characters) as text only.
  - `BucketAccumulator` integrates one signal's value over time in buckets of one width (5 min,
    1 h); `SeriesAggregator` holds them for all recorded signals.
  - `HistoryRecorder` buffers raw changes (coalescing those closer than `rawMinIntervalMs`) and
    writes them with the closed buckets every 5 s, the open buckets every 60 s and on dispose. A
    failed write keeps everything for the next try (bounded); a batch that fails 12 times in a row
    is dropped and counted, so one bad value can't stop the history. Restored values (boot replay,
    topic moves) are skipped; forced values and commands are marked in `flags`. A signal that
    leaves the selection gets its open buckets closed (`release`) and pauses (`RecordingPauses`,
    written to `pauses`) until it records again, so the time between is a gap. `HistoryAssembly`
    reconciles on every change of the history's selection or settings: it releases signals that
    left at once and resumes returning ones with their current value, instead of waiting for
    their next change. A deleted one (`unregistered`) is forgotten, so its open buckets don't bring its
    history back. A clock jump (more than 2 minutes, or back) closes the buckets where time was
    and starts a new run, so it shows as a gap.
  - `HistoryRetention` prunes each tier past its retention and purges signals missing from the
    configuration for over an hour (a config import removes and re-adds signals), every minute,
    at most 10 000 rows per tick in total.
- **Storage** (`apps/server/src/db/history/`): `HistoryDatabase` opens `history.db` (or `:memory:`
  when the main database is in memory); a file that can't be opened or migrated is moved aside
  (`history.db.broken-<time>`) and a new one started, since history must never keep Nexus from
  starting. Tables `series` (a small integer key per signal),
  `samples` (raw, `WITHOUT ROWID`, key series + ts), `buckets` (key series + width + start; parts
  merge in an upsert), `runs` (when Nexus ran, for gaps) and `pauses` (per signal, when it wasn't
  recorded; `resumed` NULL while it still isn't; deleted with the signal's history). `HistoryRepository` deletes along the
  primary key, one series at a time, so pruning never scans a whole table.
- **Settings**: `HistorySettingsSchema` in `packages/api` (enabled, retention per tier,
  `rawMinIntervalMs`), stored under the key `history` in the new `settings` table;
  `HistorySettingsStore` keeps them and falls back to the defaults for stored values a newer
  version wrote.
- **Wiring**: `HistoryAssembly` builds it all. NexusApp owns it right after the SnapshotWriter, so
  it records the first live values and, on shutdown, is disposed after the Miniservers and
  plugins and writes their last values before the file closes.

## Implementation notes: history API and UI (statistics S2)

- **Queries** (`apps/server/src/history/HistoryQuery.ts`): the resolution is chosen per request.
  Raw while the raw tier still holds the range and it has at most 4 x `points` changes (a primary
  key range count), else 5-minute buckets while the range has at most `points` of them and they
  are kept, else 1-hour buckets; text is raw only. The bucket `from` falls into is included.
  The raw tier counts as holding a range with an hour of tolerance (requests arrive a moment after
  the client read its clock). Hourly buckets are merged on the server when a range has more hours
  than points; the series says each point's `width`. `before` is the value just before the range
  (the last raw value, or, once the raw tier no longer has one, the last bucket's `last`), so a
  line starts at the left edge. Gaps are the times no run covers, with two minutes of slack
  for the lag of a run's `seen` (the time before the first run is no gap unless Nexus ran before
  the range), merged with the signal's pauses.
- **API**: `HistoryController` (`/api/history/signals/:id`, `/recorded`, `/stats`, `/settings`)
  and `SelectionController` (`/api/selections/:consumer`, mode and bulk rules, all or none; a rule
  on a target that doesn't exist is a 400). Both come from `HistoryAssembly.controllers`, so
  NexusApp only spreads them into the controller list. Stats count only the rows written in the
  last hour, per series along the primary key (a count of whole tables would block Nexus on a big
  file), and project the size at that rate with measured bytes per row (a year for tiers kept
  forever). Deleting a signal's history first drops what the recorder holds of it, then deletes in
  rounds that yield to other work. `/recorded` lists what the selection takes also while recording
  is off, so the record switches stay usable.
- **Config export**: an optional `selections.history` (mode, and rules on the file's signals and
  Miniservers; plugin instances aren't exported). An import sets the mode and the rules on ids the
  file contains, after the Miniservers and signals; a file without the section keeps the current
  mode and the current rules on its ids. While restoring a backup, rules are set one by one, so a
  signal that didn't come back doesn't cost the others' rules.
- **Web**: `HistoryApi`; `RecordedSignals` (in AppContext) holds the recorded ids for the marks,
  loaded when a signal list mounts and after every change made in the UI; only the latest answer
  applies. "Stop recording" removes a signal's rule and only writes an excluding one if the signal
  is still taken (by "all" or its owner's rule). `SeriesChartGeometry` turns a series into steps
  (raw values hold until the next change; a bucket draws its average over its width, and between
  buckets the previous `last` holds), cut at gaps and at "no value", with a min/max band for
  buckets; `TimeAxis` gives ticks on round local times from minutes to years. `SignalHistorySheet`
  (chart, table, record switch, delete) opens from the chart button in `SignalActions`;
  `RecordButtons` records ticked signals in bulk; `HistoryView` (`/history`) has recording, mode,
  per-owner exceptions, the signal rules and retention.

## Implementation notes: watching plugins (statistics S3)

Plan and reasons: ADR 0013.

- **SDK**: `static readonly watches` (WatchDeclaration) on the plugin class, passed into the
  description; `Plugin.watched?(values, dropped)` and `watchChanged()`; `this.watch` (WatchView:
  `signals()`, `signal(id)`). Wire shapes in `wire/WatchShapes.ts`; messages `watch.signals`,
  `watch.values` (host) and `watch.ack` (worker). `WatchHost` on the worker side queues batches so
  `watched()` runs one at a time and acks each when it settles. `PluginTestHost.watchSignals()` and
  `pushValues()`.
- **Core**: `WatchFeed` (one per running session of a watching plugin, started by the supervisor
  after `addAll`, stopped with the session) uses `SelectedValues` with the instance's selection.
  It sends the list and the current values of newly chosen signals (`initial`), checks for a
  changed choice or changed signals every second, skips replays (`restored`), and keeps at most
  two batches in flight and 20 000 values queued (dropped in chunks of 1 000, counted).
  `PluginSession.notify()` sends the notifications; `watch.ack` goes to the feed.
- **Server**: the supervisors get `watch: { bus, signals, selection: id => selections.of(id) }`.
  `/api/selections/:consumer` accepts the ids of instances whose plugin watches
  (`PluginService.watches`). The staged install says `watches`, and the install review shows it.
- **Web**: `WatchSelectionCard` on the instance page (mode, per-owner rules with the shared
  `OwnerRuleList`, and a searchable signal list whose ticks set or remove a signal's rule).
  `SelectionRules` mirrors the server's rule order to show what is chosen.

## Implementation notes: backup (M6)

Plan and reasons: ADR 0014; the user guide is `apps/docs/content/guide/backup.md`.

- `backup/BackupCipher` (AES-256-GCM, scrypt with its cost in the header, the header as AAD, the
  tag held back until the end), `BackupArchive` (entries of a JSON header line and bytes; extract
  checks paths against an allowlist, caps the total size, and never lets a write error escape),
  `BackupManifest`.
- `BackupService` makes the file: `Database.copyTo` (node:sqlite `backup()`) for nexus.db and
  history.db, plugin files hard-linked, into `<dataDir>/.backup-*` (swept at start), streamed
  through archive, gzip and cipher into the response.
- `RestoreService` stages an upload into `restore-pending/` (marker `checked.json`), and
  `markForApply` renames it to `apply.json`. `RestoreApplier.apply` runs in the NexusApp
  constructor right after the database lock; it is idempotent.
- `BackupController` (`/api/backup`, `/api/backup/restore`, `/apply`): the download accepts a
  plain form (scoped urlencoded parser) so the browser streams it to disk; the upload is a raw
  stream with the passphrase URI-encoded in a header. `NexusAppOptions.restart` comes from
  main.ts, which rebuilds the app once at a time and lets a shutdown wait for a running restart.
- Web: `BackupView` with `BackupCreateCard` (form into a hidden frame; an error answer loads the
  frame and is shown) and `BackupRestoreCard` (check, then restore and restart, or at the next
  start when Nexus can't restart itself).

## Implementation notes: system diagnostics (M6)

For the 24 h soak run and for finding out what a live installation does. The page (`/#/system`) is
in the user menu; the API is behind the login like the rest.

- **`DiagnosticsSampler`** (server, `diagnostics/`) takes a sample every 30 s and keeps 48 h in a
  `RingBuffer` (5760 samples, about 6 MB), in memory only. A sample is the process
  (`ProcessSampler`: `memoryUsage`, CPU from `cpuUsage` deltas, event-loop delay from a
  `monitorEventLoopDelay` histogram at 20 ms resolution, reset per sample, with the timer period
  subtracted because the histogram records the whole time between ticks, utilization from
  `eventLoopUtilization` deltas), the bus rate (a `tap` counter), retained topics, live
  connections, wires, disk use (`StorageSizes`), each running plugin worker and each Miniserver's
  ICI rate. The first sample comes one interval after the app starts (`startedAt` is the app's
  start: a restore restarts Nexus within the process). A sample still being taken makes the next
  one skip; a worker gets 5 s to answer (`DiagnosticsAssembly`), so one blocked in a native call
  can't hold up sampling; a failing source logs and leaves a gap. `?since=` keeps the page's polls
  small.
- **Plugin workers** report through `PluginConnection.stats()` (optional, so other transports may
  leave it out): `Worker.getHeapStatistics()` and the worker's `eventLoopUtilization`, as a delta
  of the raw totals, clamped to 0 to 1 because a worker's "active" comes from two clocks and
  jitters.
- **API.** `GET /api/diagnostics` (`DiagnosticsDto`) and `GET /api/diagnostics/samples.csv`
  (`DiagnosticsCsv`: a row per sample, columns per worker and Miniserver by label; labels that
  look like spreadsheet formulas get a leading `'`).
- **UI** (`SystemView`, in the user menu): figures of the latest sample, the heap verdicts
  (`HeapTrend`: 10 minutes of warm-up after the start and after every gap, the lowest value per
  complete 10-minute window (80% of its samples), a least-squares line through them; flat while a
  day at that rate adds less than 5% of the floor, at least 2 MiB), and charts per unit
  (`SystemCharts`, `MetricChartGeometry`: the average per two pixels is drawn, the highest for
  peak lines such as the loop delay's p99 and max, the pointer reads raw samples, gaps of more
  than 2.5 intervals break the line; up to eight lines in the categorical palette
  `--viz-cat-1…8`). The page polls with `since` and drops what is older than 48 h.

## Dependencies (installed in the milestone that first needs them)

| Where | Packages |
|---|---|
| all | typescript 5.9, tsx, eslint 9 + typescript-eslint + @stylistic, @types/node 24 |
| packages/ici | none (node:dgram, node:crypto) |
| packages/plugin-sdk, core, api | zod 4 |
| packages/loxone | zod 4, basic-ftp, saxes, fflate (reading Loxone Config projects) |
| apps/server | fastify 5, @fastify/websocket, @fastify/cookie, @fastify/static, pino, pino-pretty, zod 4 (node:sqlite and node:crypto built in); M5e: yauzl (ADR 0009), and esbuild + fflate as devDependencies for test fixtures; the `git` binary at run time for git installs |
| apps/web | vue 3, vue-router, vite, tailwindcss 4 + @tailwindcss/vite, shadcn-vue (reka-ui, cn, class-variance-authority, @lucide/vue, @vueuse/core, tw-animate-css), @tanstack/vue-virtual, vue-tsc, eslint-plugin-vue |
| apps/docs | markdown-it, Shiki, TypeDoc + typedoc-plugin-markdown, zod (build-time only) |
| plugins/homeassistant | none (Node's `WebSocket`); `ws` only for the test server |
| plugins/calendar | node-ical (bundled by esbuild) |

Native `fetch` and `WebSocket` replace axios and socket.io (`ws` comes in through
@fastify/websocket and is used directly only in tests). No lodash.

## Implementation notes: units and decimals (P3)

- `SignalDisplay` (core, `{ unit?, decimals? }`, unit up to 16 characters, decimals 0-6) is part
  of `Signal`, `PluginSignalConfig` and the Loxone signal config, so the registry, `GET
  /api/signals`, the watch feed (`WatchedSignal.unit/decimals`) and the history series carry it.
  An empty unit is none. Only for display: values on the bus stay exact.
- Stored in `loxone_signals` and `plugin_signals` (`unit`, `decimals`, migration 8, which also
  adds `stale_after_min` for stale warnings). The config export carries them for Loxone signals.
- Plugins suggest them with `static unit` / `static decimals` on a sensor or actuator class
  (in the description as `unit` / `decimals`, dropped when invalid). The server applies the
  suggestion only when a signal is added without its own; a catalog entry's `unit` (if it fits)
  is the form's and the bulk add's default.
- Signal edits replace the whole signal: a PUT without the fields clears them, as it does for
  slug. The project re-sync (`ProjectDiff.inputFor`) carries them over while the signal
  stays a number. An add with neither field takes the class's suggestion; a form always
  sends the unit (empty clears it), so what it shows is final.
- The web shows them through `ValueText unit decimals` (numbers only; the SDK's
  `ValueFormatter.format(value, { decimals })`) and `HistoryText`. The MQTT export's Home Assistant
  discovery sends `unit_of_measurement` and `suggested_display_precision`.

## Implementation notes: stale warnings (P4)

- `EventBus.lastSeen(topic)` is when a state last arrived, set in `BusProcessor.state` before the
  dedup check, so a Miniserver's unchanged resends and a plugin's emit on every poll count;
  restored values don't. Kept in `RetainedState`, in memory only.
- `staleAfterMin` (1-10080) is part of the signal settings with unit and decimals
  (`SignalDisplay`, column `stale_after_min` from migration 8, export, forms). Plugins suggest it
  with `static staleAfterMs` (in the description as `staleAfterMin`, rounded up); Fronius values
  suggest 5 minutes.
- `StaleWatcher` (server, every 30 s and on every registry change) checks sources with a limit
  while their owner is active (a Miniserver "online", a plugin instance running; degraded and
  offline owners show that themselves). It counts at the earliest from when the owner became
  active and from when the signal was first watched with its topic and limit, so a restart, a new
  signal or a rename gets its full time. Owner activity is sampled, so a restart within one check
  keeps the old start; its sensors usually send at once anyway. Targets never carry a limit: the
  services drop it.
- Plugin suggestions apply per field: a key the input leaves out takes the class's suggestion, a
  form sends "" or null for "none". So a catalog's bulk add with only a unit still gets the
  stale limit. Changes go to stream clients with a
  state subscription as `signal-status` (the whole set; also once on subscribe). The web keeps it
  in `LiveValues.stale`, shows `StaleBadge` in signal lists and wire ends, and `WireHealth` says
  "source stale".

## Implementation notes: settings checks, Test connection, migrations (P5)

- SDK: `static configVersion`, `static migrateConfig({ config, from, store })`, `static test(config)`
  (description `testable`). `ConfigHost` in the runtime migrates at `init` (with the real store;
  reports `config.migrated` to hosts whose init carried `configVersion`), answers `config.check`
  (migrate on a copy of the given store, or an empty one, then validate; issues keep zod's paths)
  and `config.test`. Workers announce the feature `config.check` in `hello`; older plugins never
  get the messages and are saved unchecked, as before.
- Core: `PluginConfigChecker` (a throwaway worker, like `PackageDescriber`); the supervisor sends
  `configVersion` in init, and `SupervisorDeps.configMigrated` stores a migrated config (migration
  10: `plugin_instances.config_version`, NULL meaning 1). The supervisor keeps the migrated config,
  so a restart doesn't migrate again.
- Server: `PluginSettingsCheck` checks create and update (the form's config is taken as current;
  issues come back as a 400 ZodError under `config`), and serves `POST /api/plugin-instances/check`
  with the stored secrets merged in for edits. An edit of an instance stored with an older version
  first runs its migration on a copy of the instance's store and applies the writes, so data that
  only the migration moves (the Matter bridge's old device list) survives a save before the first
  start.
- A plugin that doesn't load is saved unchecked (its start then shows why); a check that fails
  otherwise (its migration throws, a bad answer) is a 502 with the plugin's message. An edit's
  migration writes are applied after the instance is saved. `config.migrated` is taken only while
  the instance starts, and stored with an update-only write, so a deleted instance stays deleted.
  Test connection gets the action timeout (2 min): plugins' own connect timeouts may be longer
  than a request's 30 s.
- Known limit: the edit form shows the stored config as it is. For an instance not started since
  an update whose migration renamed settings, the renamed fields show empty; starting it once
  migrates them.
- Web: `InstanceForm` lists issues by field label (`ConfigIssues`) and has Test connection.
- Tests per plugin: Home Assistant logs in over the WebSocket API, Fronius reads the power flow,
  MQTT connects with its own client id, InfluxDB asks `/health` or `/ping` (the token is first
  checked by a write), Calendar reads the feed once. The Matter bridge has config version 2.

## Implementation notes: union forms and panel buttons

- Schema forms show a discriminated union (zod's `oneOf` of objects sharing a property with a
  `const` or `enum` value; `SchemaUnion.detect`) as a choice plus the chosen branch's fields
  (`SchemaUnionInput.vue`, `SchemaDraft.choose`/`variant`). Drafts keep the discriminator as text;
  shared fields keep their values across a switch.
- Actions declare `placement: "panel"` to leave the top of the instance page; panel sections may
  list buttons in their heading (`actions`, RowAction shape, at most 4). The Matter bridge places
  all its actions there and splits Edit lock (with Allow unlocking) from Edit device.

## Implementation notes: plugin instances in the config export (P6)

- Format version 2 adds `plugins` (settings without secret fields, signals with their display
  settings, the watch selection) and optionally `secrets`: `{ instanceId: { field: value } }`
  sealed with a passphrase (`SecretSeal`: AES-256-GCM, scrypt key like a backup). An instance of a
  plugin that isn't installed exports its whole config as secret, since its secret fields are
  unknown. Wires and history rules on plugin signals come along.
- `PluginTransfer` writes imported instances as stored rows (no settings check, like the boot),
  then `packageChanged` attaches and starts them; one of a missing plugin stays unavailable.
  Stores are not exported; an instance with the same id keeps its store and its secrets over an
  import. `missingSecrets` names what a new instance lacks.
- An import of a file with plugin instances stops them first (`snapshot()`), so their stores are
  final, and keeps their secrets, stores and plugin types; an imported instance inherits them only
  for the same id and plugin, under the file's settings and sealed secrets. Forces and values are
  kept on every topic (`keep("#")`) and come back where the topic still exists.
- A version 1 file leaves the plugin instances alone, its rollback too (the backup it restores has
  no `plugins`), and its wires may end at existing plugin signals.
- The journal keeps the plugins' secrets, stores and types besides the backup, so `recover()`
  restores them after a crash; at boot it only attaches the instances (`packageChanged(pkg, false)`)
  and the boot starts them as usual. `ConfigCheck` covers plugin ids, slugs, signal ids and watch
  rule targets; selections may name whole instances (`instanceId`). The Miniservers and the history
  selection moved to `MiniserverTransfer` and `HistorySelectionTransfer`.
- Secret fields fail closed: a plugin that isn't installed, or a config schema without top-level
  fields or with secrets below them, exports its whole config as secret. A sealed part with a
  wrong iv, salt or tag length is a wrong passphrase, and a file may ask for at most 2^18 scrypt.

