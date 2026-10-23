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

- Fastify 5 with `fastify-type-provider-zod`, `@fastify/websocket`, `@fastify/cookie` and
  `@fastify/static`.
- Each route group is its own controller class, for example `MiniserverController` and
  `PluginController`.
- Native `fetch` and `WebSocket`; no socket.io or lodash.
- **Auth:** argon2 passwords and opaque httpOnly SameSite=Strict session cookies (revocable). The
  WebSocket authenticates with the same cookie, and first-run setup is guarded by a transaction.
- **DB:** drizzle + libsql, file mode 0600. Each table is accessed through a repository class.
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


## Dependencies (installed in the milestone that first needs them)

| Where | Packages |
|---|---|
| all | typescript 5.9, tsx, eslint 9 + typescript-eslint + @stylistic, @types/node 24 |
| packages/ici | none (node:dgram, node:crypto) |
| packages/plugin-sdk, core, api | zod 4 |
| apps/server | fastify 5, @fastify/websocket, @fastify/cookie, @fastify/static, fastify-type-provider-zod, drizzle-orm, drizzle-kit, @libsql/client, argon2, pino, yauzl, esbuild |
| apps/web | vue 3, vite, tailwindcss 4 + @tailwindcss/vite, shadcn-vue (reka-ui), @tanstack/vue-virtual, vue-tsc |
| plugins/calendar | node-ical |

Native `fetch` and `WebSocket` replace axios, ws and socket.io. No lodash.
