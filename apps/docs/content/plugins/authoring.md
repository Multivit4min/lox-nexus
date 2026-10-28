# Plugin guide

How the parts of the SDK fit together. For a first working plugin start with the
[quick start](index.md); for exact signatures see [SDK at a glance](sdk-at-a-glance.md) and the
[reference](../reference/sdk/index.md).

## Shape of a plugin

```
my-plugin/
  package.json        "loxNexus": { "apiVersion": 1, "id": "myplugin", "entry": "dist/plugin.js", "name": "…", "icon": "…" }
  src/
    index.ts          export default PluginEntry.define(MyPlugin)
    MyPlugin.ts       class MyPlugin extends Plugin<MyConfig>
    MyConfig.ts       zod schema; secret fields wrapped in secret()
    sensors/*.ts      one Sensor class per kind of value (device to Loxone)
    actuators/*.ts    one Actuator class per kind of command (Loxone to device)
    MyCatalog.ts      optional browsable tree of ready-to-add sensors and actuators
    *.test.ts         PluginTestHost tests, next to the code they test
  test/fixtures/      recorded (or documented) API responses the tests serve
```

The manifest is explained in [Publishing a plugin](publishing.md#the-manifest). `id` is the
plugin's topic segment and stable reference: `myplugin/<instance>/sensor/<signal>`.

Keep files short and give each class one job. The first-party plugins are a good model.

## The plugin class

```ts
import { Plugin, secret, z } from "@lox-nexus/plugin-sdk"

const config = z.object({
  host: z.url(),
  token: secret(z.string()),
  pollInterval: z.number().min(1).default(5)
})

export class MyPlugin extends Plugin<z.infer<typeof config>> {
  static readonly config = config
  static readonly sensors = [PowerSensor]
  static readonly actuators = [SwitchActuator]

  readonly api = new Api(this.config.host, this.config.token)
  readonly poller = this.own(new Poller(this.api))

  override start() {
    this.every(this.config.pollInterval * 1000, () => void this.poller.poll())
  }
}
```

(`Api`, `Poller`, `PowerSensor` and `SwitchActuator` are your own classes.)

- **Static declarations** (`config`, `sensors`, `actuators`, and on capabilities `id`, `label`,
  `description`, `params`, `valueType`, `accepts`, `concurrency`) are all optional except a
  capability's `id`. They are static so the host can describe a plugin (forms, JSON Schema) without
  starting it. Give each sensor and actuator a `description`: users pick from a list of them, and
  one sentence on what it reads or does tells them more than a label alone.
- **Form fields** are labelled with the field's `title` and explained by its `description`
  (`z.string().meta({ title: "Variable", description: "…" })`); without a title the key is used
  ("entityId" becomes "Entity ID"). Prefer a title when the key is a generic word such as `name`,
  which the user would confuse with the signal's own name.
- **Choices** (`z.enum`) are shown as their values unless you name them:
  `z.enum(["current", "next"]).meta({ enumLabels: { current: "The active event", next: "The next event" } })`.
  Values without a name are shown as they are.
- **`this.config`** is the validated instance config with defaults applied. It is available in
  field initializers of your subclass. Use the `z` exported by the SDK, so schemas and the runtime
  share one zod version.
- **`secret(schema)`** marks a field as a password or token. It is never sent back to the UI, and an
  update that leaves it out keeps the stored value. Only **top-level** fields are protected. A
  secret inside a nested object or an array is shown in the UI, and saving the form erases it.
  `secret()` survives `.optional()`, `.default()` and `.describe()` in any order
  (`secret(z.string()).optional()` and `secret(z.string().optional())` both keep `writeOnly` in
  the JSON Schema); the marker is what counts, so keep the field at the top level of the object.
- Keep config schemas to simple types (strings, numbers, booleans, enums, optional fields,
  defaults). The UI builds a form from the JSON Schema; transforms and refinements are lost there,
  while the worker still enforces them when it starts. An object-level `.refine()` or
  `.superRefine()` keeps the JSON Schema an object with its `properties`, so the form looks the
  same; the check is simply not run by the form, and a failing value is refused by the worker at
  start (the instance goes to *error* with your message). The same holds for params.
- **Time zone.** The worker has an empty environment but runs in the **Nexus process's time
  zone**, which the host's `TZ` environment variable decides (the zone is process-wide). In a
  container that is usually UTC. A time-based plugin should offer its own IANA `timeZone` setting
  (as the [Calendar plugin](calendar.md) does) instead of relying on the server's zone; tell users
  to set `TZ` for the Nexus process only as a fallback.

### Starting, failing and degrading

- A **rejected `start()`** puts the instance into the *error* state, and Nexus does **not**
  restart it. Use it for mistakes only the user can fix: wrong credentials, a missing device.
- A device that is merely **unreachable** must not fail `start()`. Resolve, call
  `this.status.set("degraded", "inverter unreachable")`, keep retrying, and call
  `this.status.set("running")` when it works again. The state and message show in the UI.
- Do not await slow first requests in `start()` if the plugin works without them; start them in
  the background (`void this.poller.poll()`) so a hanging device does not hold the start up.
- If the worker stops answering pings (a busy loop), runs out of memory (128 MB heap) or exits, it
  is terminated and restarted with a growing delay (1 s up to 5 min).

## Lifetimes

Every plugin, sensor and actuator extends `Disposable`. Register everything that must end with it:

| Method | Use |
|---|---|
| `this.own(resource)` | Disposes a child (a client, a poller, a socket wrapper) with this object. Returns it. |
| `this.every(ms, fn)` | Repeating timer. Returns a cancel function. |
| `this.after(ms, fn)` | One-shot timer. Returns a cancel function. |
| `this.listen(emitter, event, listener)` | Subscribes to an `EventEmitter` until disposed. |

Sensors and actuators are disposed when their signal is removed or the plugin stops; the plugin
when the instance stops. Never use bare `setInterval`, `setTimeout` or `emitter.on` in a
long-lived class, or stop leaves things running. Registering after dispose throws.

**Stop order.** When an instance stops, its sensors and actuators are disposed first, then the
plugin itself (so a plugin's `own()` children, such as a poller, are still alive while signals shut
down). Teardowns of one object run in reverse registration order.

`after()` and `every()` count elapsed time, not wall-clock time, so a clock step (an NTP sync after
boot) is not noticed. For a deadline given as a wall-clock time, wait in shorter slices (the
Calendar plugin caps its waits at 15 minutes) and re-check `Date.now()` each time.

Anything you own must implement `dispose(): void | Promise<void>` (a `DisposableLike`).

## Sensors

A sensor is a value coming from the device. One instance exists per configured signal, created
with validated `params`.

```ts
import { Sensor, z } from "@lox-nexus/plugin-sdk"
import { Value } from "@lox-nexus/plugin-sdk/values"

export class PowerSensor extends Sensor<MyPlugin, { path: string }> {
  static readonly id = "power"                    // stored with the signal: don't rename
  static readonly label = "Power"
  static readonly description = "The power the inverter reports"   // shown when adding it
  static readonly params = z.object({ path: z.string().describe("Where the value is in the data, e.g. site.P_PV") })
  static readonly valueType = "number"            // what emit() sends; "any" if it varies

  override start() {
    this.listen(this.plugin.poller, "data", (data: Record<string, number>) => {
      const watts = data[this.params.path]
      if (watts === undefined) this.fail(`no value at ${this.params.path}`)
      else this.emit(Value.number(watts))
    })
  }
}
```

- **`emit(value)`** sends a value to the bus. Equal consecutive values are deduplicated there,
  so emit on every poll without worry. A value of the wrong type is converted to the declared
  `valueType` ([Values](values.md#conversions)).
- **`fail(message)`** says the sensor cannot deliver any more (the entity it follows was deleted).
  The message shows on the signal until the next `emit()`.
- Field initializers of a sensor can already use `this.plugin` and `this.params` (they are
  constructor parameters), just like a plugin's `this.config`:
  `private readonly path = this.params.path.split(".")`.
- A rejected sensor **`start()`** makes adding the signal fail, and the user sees the message.
- Declare `valueType` as precisely as you can; wires and the UI use it to offer fitting targets.

## Actuators

An actuator is a command going to the device.

```ts
import { Actuator, z } from "@lox-nexus/plugin-sdk"
import type { ValueOf } from "@lox-nexus/plugin-sdk/values"

export class SwitchActuator extends Actuator<MyPlugin, { id: string }, ValueOf<"boolean">> {
  static readonly id = "switch"
  static readonly params = z.object({ id: z.string() })
  static readonly accepts = "boolean"             // wires convert to this before run()
  static readonly concurrency = "latest"          // or "queue" (default)

  async run(value: ValueOf<"boolean">) {
    await this.plugin.api.set(this.params.id, value.value)   // throwing reports a failed result
  }
}
```

- **`accepts`** is the type `run()` expects. The runtime converts before calling, so a wire from
  an analog input to your boolean actuator just works. `"any"` (the default) passes values
  unchanged. Keep the generic `V` of `Actuator` in line with `accepts`.
- **`run()`** performs the command. Its outcome becomes a *result* message on the bus, with the
  duration. Throw (or reject) with a message the user can read to report a failure.
- **`concurrency`**: `"queue"` (default) runs every command in order, one at a time. `"latest"` keeps
  only the newest waiting command, so a dimmer dragged across its range does not queue hundreds
  of requests. The commands it skipped are reported as *superseded* (`SupersededError`, raised by
  the runtime, not by you).
- `run()` never overlaps itself.
- Like sensors, an actuator's field initializers can use `this.plugin` and `this.params`.

### Causes are automatic

Whatever the plugin emits or logs while an actuator runs carries the bus message that triggered
it, so the Bus Inspector shows the effect under its cause. This follows awaits, timers and
promises started inside `run()` for as long as they live, so work that outlives the command (a
timer you start in `run()`) is still attributed to it. You do not pass anything around.

## Logging, store and status

| Member | Notes |
|---|---|
| `this.log.debug/info/warn/error(message, data?)` | Goes to the server log tagged with the instance; the last lines show on the instance's page. `data` is structured-cloned. **Never log secrets.** |
| `this.store.get<T>(key)` / `set(key, value)` / `delete(key)` / `keys()` | Small persisted state that survives restarts and updates (tokens, cursors, last-seen ids). Reads come from memory; writes are sent to the host. |
| `this.status.set("degraded" \| "running", message?)` | The plugin's own health, shown in the UI. |

From a sensor or actuator log through `this.plugin.log` (the plugin's `log` is public). A sensor
does not know its signal id, so name the signal in the message by capability and params:
`this.plugin.log.warn("no value", { sensor: "power", path: this.params.path })`.

Store values must be JSON. `set()` throws for what JSON cannot hold (BigInt, circular objects) and
for keys that are not 1 to 200 characters; `undefined` fields are dropped, dates become strings,
class instances are flattened. `get()` casts without checking, so validate data an older version of
your plugin may have written.

## Webhooks

An external system can push to your plugin:

```ts
import { timingSafeEqual } from "node:crypto"

override start() {
  this.http.route("POST", "/github", request => {
    if (!this.authentic(request.headers["x-hook-secret"])) return { status: 401 }
    this.events.push(JSON.parse(request.body))
    return { status: 204 }
  })
}

/** compares in constant time, so the answer's timing doesn't reveal how much of a guess was right */
private authentic(given: string | undefined) {
  const expected = Buffer.from(this.config.hookSecret)
  const actual = Buffer.from(given ?? "")
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
```

(`hookSecret` is a `secret(z.string())` field of your config.)

- The route is `/hook/<instance slug><path>`, for example `/hook/demo/github`. A method of `"*"`
  matches any method, and a path ending in `/*` matches everything below it (`/a/*` matches `/a/` and `/a/b`, not `/a`;
  `"/*"` everything),
  for names the user chooses at run time; the handler reads `request.path`. The most specific route
  wins: exact before prefix, longer prefix first, a named method before `"*"`. Registering the same
  method and path twice throws. The [webhook plugin](webhook.md) is a full example.
- **Webhooks are reachable without a login.** Check a shared secret yourself, as above.
- The request has `method`, `path`, `query`, `headers` (lowercase names, repeated ones joined with
  `, `; the session cookie is not forwarded) and `body` (utf-8 text). The answer is
  `{ status, headers?, body? }`.
- A handler that throws gives the caller 502 and writes the error to the server log. Calls are
  limited to 8 in flight per instance (429 beyond that), and answers are sent with a restrictive
  content security policy.

## Catalog

`catalog()` returns a tree the user browses to add many signals at once. It is asked on demand, so
it may query the device. A throw is shown to the user.

```ts
import type { CatalogNode } from "@lox-nexus/plugin-sdk"
import { Value } from "@lox-nexus/plugin-sdk/values"

override catalog(): CatalogNode[] {
  return [{
    label: "Kitchen",
    children: [{
      label: "Light",
      entries: [
        { kind: "sensor", capability: "state", params: { entityId: "light.kitchen" }, label: "Kitchen light", value: Value.number(42), unit: "%" },
        { kind: "actuator", capability: "switch", params: { id: "light.kitchen" }, label: "Kitchen light switch" }
      ]
    }]
  }]
}
```

An entry names a capability by its static `id` and carries `params` that are validated against
that capability's `params` schema when it is added. `label` is the suggested signal name.

`value` and `unit` are optional. They show what the entry reads right now while the user browses
(for an actuator: the state it would change), so give them whenever the data is at hand. Send the
value the sensor would emit. The unit is the device's own, at most 32 characters. Both are only
informative: an invalid value or a longer unit is dropped instead of failing the catalog.

## Watching signals (exporters)

A plugin can receive the values of signals the user chooses: Loxone signals, other plugins'
sensors and actuators, anything on the bus. That is how an exporter (InfluxDB, MQTT, a CSV file)
works. Declare it and implement `watched()`:

```ts
import { Plugin, type WatchedValue } from "@lox-nexus/plugin-sdk"

export default class InfluxPlugin extends Plugin<InfluxConfig> {
  static readonly watches = { label: "Exported signals", description: "Values of these signals are written to InfluxDB" }

  override async watched(values: readonly WatchedValue[], dropped: number) {
    // oldest first; this.watch.signal(id) has the signal's label, topic, type and owner
    for (const value of values) {
      const signal = this.watch.signal(value.signalId)
      if (signal) this.buffer.add(signal, value)
    }
    if (dropped) this.log.warn(`${dropped} values were dropped while the export was behind`)
  }

  override watchChanged() {
    // optional: this.watch.signals() is the new list (chosen, left out, renamed)
  }
}
```

- **The user decides what the plugin sees**, on the instance's page: all signals or chosen ones,
  whole Miniservers or plugin instances, single signals. The plugin's config says *how* it exports,
  never *what*. Until the user chooses, the plugin gets nothing.
- **First** `watchChanged()` with the list, and the current value of each chosen signal
  (`initial: true`; actuators have none unless forced); **then** every change, as the bus shows
  it: forced values are marked `forced`, commands to actuators have `kind: "command"`. Callbacks
  never overlap, and a batch always meets the list it was sent with. On shutdown, a running
  `watched()` finishes before the plugin is disposed.
- **Delivery is paced by the plugin.** The next batch comes once `watched()` returns (or its promise
  settles), and Nexus sends at most two batches ahead. While a plugin is slower than the values
  arrive, Nexus keeps a bounded queue and drops the oldest; `dropped` says how many since the last
  batch. A throw in `watched()` is logged and doesn't stop the feed. Keep your own buffer bounded
  too.
- **Trust**: a watching plugin sees values of other systems, for example alarm states. The install
  review and the instance page say so. Secrets never travel on the bus.
- **Testing**: `host.watchSignals([...])` sets the chosen signals, and `await host.pushValues([...])`
  delivers a batch and resolves when `watched()` finished.

## Panel

`panel()` returns a status view for the instance's page. Plugins ship no UI code, so it is data:

```ts
override panel(): Panel {
  return { type: "keyValue", items: [{ label: "Firmware", value: "1.34" }] }
}
// or { type: "table", columns: ["Meter", "Power"], rows: [["Grid", "412 W"]] }
// or { type: "json", data: { anything: "serialisable as JSON" } }
```

Cells are strings; format numbers yourself. Never put secrets in a panel.

## Rules

- Depend only on `@lox-nexus/plugin-sdk` and your own npm packages. No native modules (see
  [Publishing](publishing.md#what-may-be-bundled)).
- Register every timer, listener and connection through `every()`, `after()`, `listen()` and
  `own()`.
- Never log secrets or put them in a panel. Wrap secret config and params fields in `secret()`.
- Do not rename capability ids or change param meanings between versions without a migration
  plan: they are stored with every configured signal.
- The worker has an empty environment (`process.env` is empty) and a 128 MB heap.
