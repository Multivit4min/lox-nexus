# Writing a Lox Nexus plugin

A plugin connects one kind of external system to the bus. Each configured instance of it runs in
its own worker thread; Nexus talks to it only through messages, so a plugin can crash, hang or
leak without taking anything else down. `plugins/fronius` is a complete example.

## Shape of a plugin

```
my-plugin/
  package.json        "loxNexus": { "apiVersion": 1, "id": "myplugin", "entry": "dist/plugin.js", "name": "…", "icon": "…" }
  src/
    index.ts          export default PluginEntry.define(MyPlugin)
    MyPlugin.ts       class MyPlugin extends Plugin<MyConfig>
    MyConfig.ts       zod schema; secret fields wrapped in secret()
    sensors/*.ts      one Sensor class per kind of value (device → Loxone)
    actuators/*.ts    one Actuator class per kind of command (Loxone → device)
    MyCatalog.ts      optional browsable tree of ready-to-add sensors and actuators
    *.test.ts         PluginTestHost tests, next to the code they test
  test/fixtures/      recorded (or documented) API responses the tests serve
```

- `id` is the plugin's topic segment and stable reference: `myplugin/<instance>/sensor/<signal>`.
- `entry` is the built bundle used by installs (M5). In development (`npm run dev`), Nexus runs
  `src/index.ts` from the workspace's `plugins/` directly and restarts the instances when a file
  changes.

## The classes

```ts
import { Plugin, PluginEntry, Sensor, Actuator, secret, z } from "@lox-nexus/plugin-sdk"
import { Value } from "@lox-nexus/plugin-sdk/values"

const config = z.object({ host: z.url(), token: secret(z.string()), pollInterval: z.number().default(5) })

class PowerSensor extends Sensor<MyPlugin, { path: string }> {
  static readonly id = "power"                        // stored with the signal: don't rename
  static readonly params = z.object({ path: z.string() })
  static readonly valueType = "number"                // what emit() sends; "any" if it varies

  override start() {
    this.listen(this.plugin.poller, "data", data => this.emit(Value.number(data[this.params.path])))
  }
}

class SwitchActuator extends Actuator<MyPlugin, { id: string }, Extract<Value, { type: "boolean" }>> {
  static readonly id = "switch"
  static readonly params = z.object({ id: z.string() })
  static readonly accepts = "boolean"                 // wires convert to this before run()
  static readonly concurrency = "latest"              // or "queue" (default)

  async run(value: Extract<Value, { type: "boolean" }>) {
    await this.plugin.api.set(this.params.id, value.value)   // throwing reports a failed result
  }
}

export class MyPlugin extends Plugin<z.infer<typeof config>> {
  static readonly config = config
  static readonly sensors = [PowerSensor]
  static readonly actuators = [SwitchActuator]
  readonly api = new Api(() => this.config.host)
  readonly poller = this.own(new Poller(this.api))

  override start() {
    this.every(this.config.pollInterval * 1000, () => void this.poller.poll())
  }
}

// src/index.ts
export default PluginEntry.define(MyPlugin)
```

- **Static declarations** (`config`, `sensors`, `actuators`, `id`, `label`, `params`,
  `valueType`, `accepts`, `concurrency`) are all optional except a capability's `id`.
- **`start()`** of the plugin: a rejection puts the instance into the **error** state, which is not
  restarted. Use it for configuration mistakes. A device that is merely unreachable should not
  fail start: report it with `this.status.set("degraded", "inverter unreachable")` and recover.
- **Sensors and actuators** are created per configured signal, with validated `params`, and disposed
  when the signal is removed or the plugin stops. A sensor that breaks later calls `this.fail()`.
- **`run()`** of an actuator gets the value converted to `accepts`. Its outcome becomes a `result`
  message on the bus. With `concurrency: "latest"`, values that arrive while one runs replace each
  other and only the newest runs; the skipped ones are reported as superseded.
- **Causes are automatic.** Whatever the plugin emits or logs while an actuator runs carries the bus
  message that triggered it, so the inspector shows the effect under its cause. This follows
  awaits, timers and promises started inside `run()` for as long as they live, so work that
  outlives the command (a timer started in `run()`) is still attributed to it.
- **Store values are JSON.** `this.store.set()` throws for what JSON can't hold (BigInt, circular
  objects, undefined); dates become strings.

## What a plugin gets

| Member | |
|---|---|
| `this.config` | the validated instance config |
| `this.log.debug/info/warn/error(message, data?)` | into the server log, tagged with the instance |
| `this.store.get/set/delete/keys` | small persisted key-value state; `set` takes plain data |
| `this.status.set("degraded" \| "running", message?)` | the plugin's own health, shown in the UI |
| `this.http.route(method, path, handler)` | webhooks at `/hook/<instance><path>`, reachable **without a login**: check a secret yourself |
| `catalog()` | optional tree of ready-to-add sensors and actuators (`CatalogNode[]`) |
| `panel()` | optional status view: `keyValue`, `table` or `json` |
| `own()`, `every()`, `after()`, `listen()` | lifetimes: everything registered is cleaned up on stop |

## Testing

`@lox-nexus/plugin-sdk/testing` runs a plugin class in-process, through the same runtime that runs it
in the worker:

```ts
const host = await PluginTestHost.start(MyPlugin, { config: { host: "http://127.0.0.1:8080", token: "t" } })
const power = await host.addSensor("power", { path: "pv" })
assert.deepEqual(await host.next(power), Value.number(3412))
const sw = await host.addActuator("switch", { id: "kitchen" })
await host.actuate(sw, Value.boolean(true))
assert.equal(host.status.status, "running")
await host.stop()
```

`host.sent` holds every message the plugin sent, `host.store` what it stored. Mock external APIs
with a small HTTP server on 127.0.0.1 and port 0, and recorded fixtures under `test/fixtures/`.

## Rules

- Depend only on `@lox-nexus/plugin-sdk` and your own npm packages. No native modules.
- Register every timer, listener and connection through `every()`, `after()`, `listen()` and
  `own()`, so stop and remove leave nothing behind.
- Never log secrets or put them in a panel. Fields wrapped in `secret()` are never sent back to a
  UI, and an update that omits them keeps the stored value (top-level config fields only).
- The worker has an empty environment and a 128 MB heap. A plugin that stops answering pings (a busy
  loop) or runs out of memory is terminated and restarted with a growing delay (1 s up to 5 min).

## Installing

Admins install plugins from a ZIP upload or a git URL plus ref (M5); the ref must contain the built
bundle. Plugins are trusted code: they run in a worker thread but are not sandboxed (ADR 0001).
