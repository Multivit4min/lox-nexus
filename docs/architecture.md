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
plugins/{homeassistant,calendar,fronius} ──► packages/plugin-sdk   (published; ONLY dependency plugins may have)
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
`old/loxone-nexus/tests/conversion/*.spec.ts`), with these known bugs fixed deliberately, one test each:
- RGBW→TunableWhite spreads `this.defaults` (`old/loxone-nexus/VariableConverter.ts:185`)
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
- **`ForceRegistry`**:
  - `force(topic, value, { by, reason, until? })` and `release(topic)` emit `force` / `release`
    messages.
  - While a topic is forced, `EventBus` delivers the forced value and records incoming publishes as
    `shadowed`.
  - Forcing a Loxone **out** topic means the Miniserver receives the forced value. Forcing an **in**
    topic means everything wired to it sees the forced value.
  - Optional `until` gives an automatic release. Forces are persisted in a `forces` table and
    survive restarts.
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
// plugins/fronius/src/FroniusPlugin.ts
export default class FroniusPlugin extends Plugin<FroniusConfig> {
  static readonly config = froniusConfigSchema            // zod, in its own file
  static readonly sensors = [PowerFlowSensor, BatterySensor, MeterSensor]
  static readonly actuators = []

  readonly api = new SolarApi(() => this.config.host)
  readonly poller = this.own(new Poller(this.api))

  async start() {
    this.every(this.config.pollInterval, () => this.poller.poll())
  }

  catalog() { return new FroniusCatalog(this.poller.latest).build() }
}

// plugins/fronius/src/sensors/PowerFlowSensor.ts
export class PowerFlowSensor extends Sensor<FroniusPlugin, PowerFlowParams> {
  static readonly id = "powerflow"
  static readonly params = z.object({ path: z.enum(["grid", "load", "pv"]) })

  start() {
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
- **`DevPluginLoader`**: runs workspace `plugins/*` from source with `--import tsx`, and restarts
  them on file change.

### Installer (server)

Lives in `apps/server/src/plugins/install/`:
- **`PluginInstaller`** runs through the steps below. Each source is its own class: **`ZipSource`**
  and **`GitSource`**.
  1. Stage in `data/plugins/.staging/<uuid>`.
  2. Fetch the source:
     - **`ZipSource`** uses yauzl. It rejects absolute paths, `..` segments, symlinks, more than
       5k entries and more than 50 MB uncompressed.
     - **`GitSource`** uses `execFile git clone --depth 1 --no-recurse-submodules`, https only,
       with no prompts and a timeout. It records the resolved commit.
  3. **`ManifestValidator`** checks the `"loxNexus": { apiVersion, entry, name, icon }` block in
     package.json and records a sha256.
  4. A throwaway describe worker returns the JSON Schemas (zod v4 `toJSONSchema`; secret fields
     become `writeOnly`).
  5. Atomic move into `data/plugins/<id>/<version>`. The previous version is kept for one-click
     rollback, and instances roll over without a server restart.
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
- `capture --port N [--password P] [--only ids] [--record file] [--duration s]` prints every
  datagram as an annotated hex dump, with known fields named and unknown bytes highlighted. It diffs each packet against the previous one with the
  same packetId, so you can see exactly which bytes changed when you press a T5 button or move an
  RGBW slider.
- `capture --record <file>` writes JSONL captures, and `replay <file>` sends them again with the
  original timing. Annotated captures become test fixtures under `packages/ici/test/fixtures/`.
- `decode <hex>` describes a datagram offline.
- `send --type t5 --raw <hex>` sends a crafted packet, to probe how the Miniserver reacts.

**Open protocol questions, with a capture experiment for each:**
1. **T5.** The hypothesis is that the payload is a Float64LE bitmask. The old enum values
   16368/16384/16400/16416/16432 are the high two bytes of the doubles 1, 2, 4, 8 and 16, which fits
   left-upper=1, right-upper=2, middle=4, left-lower=8, right-lower=16. Under that reading, pressing
   several buttons at once gives their sum.
   - **Experiment:** press each button and then button combinations, capture the packets, and check
     against the hypothesis.
2. **SmartRGBW bytes 6–7.** Unknown. Possible meanings are control flags such as the jump/fade mode
   or the lighting-controller "mode".
   - **Experiment:** in Loxone Config, change one setting at a time (fade time, colour vs white,
     master off, scene change) and diff the captures.
3. **TunableWhite fade unit.** PROTOCOL.md says 0.2 s per step, the old code used 0.1 s.
   - **Experiment:** capture known fade times.
4. **SingleChannel bytes 0–2, and TunableWhite bytes 6–7.** Both unknown.
5. **0x8D status packet.** Decode its fields enough to use it as a heartbeat.

Codecs for unconfirmed fields stay byte-exact on round-trip (every unknown byte is preserved) and are
marked `@experimental` until a fixture confirms them.

### Loxone (packages/loxone)

- **`MiniserverManager`** owns the **`Miniserver`** instances.
- Each Miniserver owns one `IciSocket`, one `IciReceiver` and one `RemotePeer` from `packages/ici`.
  There is no adapter or workaround layer.
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

- **Home Assistant:** `old/loxone-nexus/src/integration/homeassistant/`, both the WS protocol and the list of
  services. Fix two bugs on the way: `valve.set_valve_position`, and the scene trigger firing on
  `false`.
- **Calendar:** `old/loxone-nexus/src/integration/calendar/` (iCal, show/hide events). Fix three bugs: the
  event end time is ignored, there is a double fetch, and the ignore list grows forever.
- **Fronius:** `old/loxone-nexus/src/integration/fronius/SolarApi.ts`.
- **Old v1 export:** an importer comes in M6.


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
  - `CausalChain` keeps the last 50k causes in a ring, so eviction is O(1).
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
  - Each Miniserver has its own listen port (optionally bound to `listenAddress`). Sharing one
    port between Miniservers and demultiplexing by source id would be possible, but isn't done.
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
  re-sent unlinked outputs). A removed output is taken out of the resend cycle. A release
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
  - A stored row that can't be loaded is logged and skipped. A wire that can't start stays stored
    and is listed as `active: false`.
- **Deleting.** Deleting a signal or Miniserver also releases forces on its topics, forgets
  their retained values (`EventBus.forget`) and deletes their snapshot rows (`TopicCleanup`). At
  boot, snapshot rows whose topic no longer belongs to a signal are deleted. A rename still leaves
  forces on the old topics (see the backlog).
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
    - `GET`/`POST :id/signals`, `DELETE :id/signals/:signalId`
    - `GET :id/discovered`, `POST :id/discovered/adopt`
    - Passwords are write-only: an omitted `password` keeps the stored one, `null` removes it.
  - `GET /api/miniservers/:id/load`: the current intercommunication load and the last hour
    of samples (`load` in percent is also on every Miniserver DTO).
  - `GET /api/signals` lists every signal with its current value; `/api/wires` has CRUD.
  - `/api/bus`:
    - `GET messages?limit&pattern` and `GET messages/:id/trace`
    - `GET current?pattern`
    - `GET`/`POST forces`, `DELETE forces?topic=`
    - `POST inject`
- **Error mapping.**
  - zod → 400
  - domain errors (taken slug, a target that already has a wire) → 409. These are plain `Error`s
    from core and loxone; subclasses and errors with a `code` stay 500.
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
    batch. Replacing a subscription discards whatever was queued for the old pattern.
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
    - config form (the password is write-only)
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

## Dependencies (installed in the milestone that first needs them)

| Where | Packages |
|---|---|
| all | typescript 5.9, tsx, eslint 9 + typescript-eslint + @stylistic, @types/node 24 |
| packages/ici | none (node:dgram, node:crypto) |
| packages/plugin-sdk, core, api | zod 4 |
| apps/server | fastify 5, @fastify/websocket, @fastify/cookie, @fastify/static, pino, pino-pretty, zod 4 (node:sqlite and node:crypto built in); later yauzl, esbuild |
| apps/web | vue 3, vue-router, vite, tailwindcss 4 + @tailwindcss/vite, shadcn-vue (reka-ui, cn, class-variance-authority, @lucide/vue, @vueuse/core, tw-animate-css), @tanstack/vue-virtual, vue-tsc, eslint-plugin-vue |
| plugins/calendar | node-ical |

Native `fetch` and `WebSocket` replace axios and socket.io (`ws` comes in through
@fastify/websocket and is used directly only in tests). No lodash.
