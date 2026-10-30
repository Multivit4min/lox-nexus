# 0017: Matter as two first-party plugins on matter.js, with plugin actions, a QR panel part and a per-plugin heap

Status: **Accepted** (2026-10-29; MB1 built), after the MB0 spike paired a real Echo. Plan: the approved
Matter plan (milestones MB0–MB3); architect review of MB1 done the same day.

## Context

Nexus should speak Matter in both directions: expose Nexus values as devices to Alexa, Google,
Apple and Home Assistant (a bridge), and join Matter devices as an extra controller
(multi-admin). matter.js (`@matter/main`) is the only implementation that runs in a plugin worker
and has both roles. MB0 showed it works inside a real worker: Alexa paired with the 11-digit
code, voice control, temperature queries and a routine from a contact sensor worked, and pairing
survived a plugin restart and a container recreation with its keys in the plugin store.

MB0 also showed what the runtime lacks:
- Pairing and unpairing are user-triggered operations with an input (a pairing code, which fabric
  or node to remove). Plugins have no way to be called from the UI except config, signals and
  webhooks.
- The pairing QR code has nowhere to go in a panel.
- One bridge uses 38–50 MB of heap (110 MB reserved) and 105–120 MB RSS; a controller with many
  nodes can outgrow the fixed 128 MB old-generation cap.
- matter.js is 0.x with a breaking minor every 2–4 months, 5.5–6 MB bundled, breaks when minified,
  and must not touch the file system or the environment.
- A panel answer containing a BigInt (matter.js fabric ids) passed the worker and crashed the
  HTTP answer.

## Decision

**Two plugins, one library.**
- `plugins/matter-bridge` (MB2) and `plugins/matter-controller` (MB3), separate packages, MIT,
  SDK only. Separate because they are used independently, fail independently, and each costs its
  own memory.
- Both bundle `@matter/main` pinned to the same exact version (0.18.0) with esbuild like
  `plugins/mqtt`: not minified, the Bun SQLite driver replaced by a stub module, the
  `createRequire` banner, license comments kept and matter.js's Apache-2.0 `LICENSE`/`NOTICE`
  shipped with the plugin. A matter.js update is a deliberate step for both plugins together.
- matter.js is set up in code only: `Environment.default` without `Filesystem`, the storage driver
  below registered on `StorageService` as `configuredDriver`, its logger routed to `this.log`
  (no stdout, no ASCII-art QR), ports from the config.

**Storage on `this.store`.**
- A `StoreStorageDriver` (extends matter.js's `MemoryStorageDriver`, calls `initialize()` itself)
  persists one store key per leaf storage context, `matter:<namespace>/<context path>`, with the
  value `{ context, json }`: the context path (so a key shortened with a hash can be read back) and
  matter.js's own `toJson()` text, whose codec handles `Uint8Array` and `bigint`. A key longer than
  200 characters is shortened with a hash suffix. Fabrics, sessions, access control,
  commissioning data and the pairing secrets are written at once; device attribute state and
  remembered states are merged per key within 1.5 s (`WriteCoalescer`, flushed on stop). Measured
  in MB2: 11 writes for a first start, 16 for a pairing, 2 for 20 blind positions within 2 s.
- The bridge keeps its passcode and discriminator in the store (`pairing`): matter.js 0.18 otherwise
  advertised a code that failed after the factory reset that follows removing the last controller.
- The SDK's `Actuator` has no `fail()`: a bridge actuator whose device is missing or of another
  type refuses in `start()`, so the signal shows the reason. An actuator-side `fail()` is a
  candidate SDK addition.
- Per-context keys keep each value far below the 1 MiB store limit, also for a controller whose
  per-node caches would not fit in one key. A value over 900 KiB is logged as a warning.
- The driver is copied into each plugin (plugins import only the SDK); the copies are identical
  and each is tested.
- Fabric keys and certificates therefore live in Nexus's database and travel in the encrypted
  backup (ADR 0014); nothing is written outside the data directory.

**SDK and host groundwork (MB1), all additive within wire version 1, like `watches` (ADR 0013).**
- **Actions**: a UI-triggered call with a small validated input.
  - A plugin declares `static readonly actions = [PairAction, RemoveDeviceAction]`. An action is a
    class, one per file, like a sensor or actuator: `Action<P, Input>` (extends `Disposable`) with
    static `id`, `label?`, `description?`, `input?` (zod, default an empty object), `confirm?`
    (a sentence shown before running), and `run(): string | void | Promise<string | void>`. The
    runtime validates the input, constructs the action with `(plugin, input)`, runs it, and
    disposes it when run() settles or the plugin stops.
  - The description carries `actions: [{ id, label, description?, input: JsonSchema, confirm? }]`.
    Older hosts strip the field and show no actions.
  - Host → worker `{ type: "action", requestId, action, input }`, answered with the existing
    `response`; `result` is the returned text, at most 2000 characters (clipped in the worker).
  - One action runs at a time per instance; a second one is refused with "<label> is still
    running", also after the host gave up waiting.
  - The host waits up to 120 s (`actionMs`), longer than other requests, because commissioning
    takes tens of seconds. Work that can take longer returns early and shows progress in the panel.
  - Only while the instance runs (running or degraded). The server sends only actions the
    package's description declares, so an older plugin never receives the message.
  - REST: `POST /api/plugin-instances/:id/actions/:action` with `{ input }`, 64 KiB body limit,
    `lockFree` (it changes no Nexus config, and a 2-minute request must not block a config
    import's drain). 200 `{ message? }`; 400 the plugin refused (invalid input or failure, its
    message); 404 unknown instance or action; 409 not running; 503 timeout or the plugin stopped
    meanwhile. The instance log gets `action "<label>" by <user>` and the outcome; the input is
    never logged or stored.
  - Any logged-in user may run actions, like start, stop and config edits today; there are no
    roles yet. With roles, actions belong to "operate".
  - Table panel parts may carry `rowActions` (per row, up to 4 `{ action, label?, input? }`), which
    open the action dialog prefilled, e.g. "Remove" on a fabric or node row. That is how an action
    gets a choice the static input schema can't list. Older hosts strip it.
- **QR panel part**: `{ type: "qr", data, caption? }` (`data` 1–1024 characters, `caption` up to
  200), allowed at the top level and in sections. The web draws it as SVG with a small,
  dependency-free encoder (`uqr`, exact pin, loaded on first use). Like `sections`, an older host
  refuses a panel containing it, which fails only the panel request.
- **Answers must be JSON**: the worker refuses an answer that JSON can't hold (BigInt, cycles)
  with a clear message instead of passing it to the host.
- **`loxNexus.heapMb`** (optional integer, 128–512, default 128) in the manifest, for development
  and installed plugins alike. It is stored per installed version (`plugin_versions.heap_mb`),
  carried on `PluginPackage`, and passed to the worker and to the describe worker as
  `maxOldGenerationSizeMb`. The install review shows "needs up to N MB of memory per instance".
  Both Matter plugins ask for 256. A version installed by a Nexus before this field keeps NULL
  (the default) until it is installed again: the manifest isn't read back after an install.
- **Refusals:** an action already running, invalid input and a failure the plugin throws all
  answer 400 with the plugin's message; a timeout or a stop while it runs answers 503. The
  plugin's answer is shown to the user but not logged (it may carry a pairing code); a thrown
  message is logged. Stored descriptions are re-described once (`PluginVersions.FORMAT` 3), so
  plugins described by an older Nexus show their actions.

## Consequences

- Plugins gain a third way to be driven from the UI. It is a request, not state: nothing about
  actions is persisted or exported, and wires, forces and history are unaffected.
- A heap cap is a ceiling, not a reservation; the process RSS still grows by roughly
  110–170 MB per running Matter instance. The README and the docs say so and recommend one
  instance of each. Small machines (1–2 GB) feel it.
- Restoring a backup on a second machine while the first runs puts two bridges with the same
  fabric identity on the network. The backup docs warn about it.
- Out-of-repo plugins that use `qr` or `actions` need a host with MB1; there is no minimum host
  version in the manifest yet, so on older hosts the panel fails or the actions don't show.
- The two Matter plugins are the most expensive first-party plugins to maintain (matter.js minors,
  ecosystem quirks that need real hardware, mDNS/IPv6 network support).
- Left out: per-instance heap overrides, young-generation caps, cancelling a running action,
  streaming action progress, dynamic action input schemas, a shared Matter package (it would
  break the SDK-only boundary), and a generic Matter attribute sensor (later, in the controller).
