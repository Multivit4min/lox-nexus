# Plugin guide

This guide explains how the parts of the SDK fit together and when to use each one. For a first
working plugin start with the [quick start](index.md). For a compact list of every signature see
[SDK at a glance](sdk-at-a-glance.md), and for the generated API pages see the
[reference](../reference/sdk/index.md).

Contents: [how Nexus sees a plugin](#how-nexus-sees-a-plugin) ·
[lifecycle](#the-lifecycle-of-a-plugin) · [plugin class](#the-plugin-class) ·
[config](#config-what-the-user-fills-in) · [status and restarts](#starting-failing-and-degrading) ·
[sensors](#sensors-values-from-the-device) · [actuators](#actuators-commands-to-the-device) ·
[lifetimes](#lifetimes-disposable) · [time](#time-and-time-zones) ·
[logging, store and status](#logging-store-and-status) · [webhooks](#webhooks) ·
[catalog](#catalog-browse-and-add) · [panel](#panel-a-status-page) ·
[watching](#watching-signals-exporters) · [limits](#limits-at-a-glance)

## How Nexus sees a plugin

Nexus never imports your code into its own process. It starts a **worker thread** for each
configured instance of a plugin and talks to it with messages. Three consequences follow:

- A plugin that crashes, hangs or leaks takes nothing else down. Nexus restarts it.
- Everything the plugin knows about Nexus arrives through the SDK objects (`this.config`,
  `this.store`, the `params` of a sensor). You never see the bus, the database or other plugins.
- Values you send and receive are plain data (see [Values](values.md)) that survives being copied
  between threads.

Your plugin offers two kinds of **signals**, which are named values on Nexus' internal bus:

| Kind | Direction | Is for | You write |
|---|---|---|---|
| **Sensor** | device to Nexus | a reading, a state, an event | a class that calls `emit(value)` |
| **Actuator** | Nexus to device | a command, a setting, a switch | a class whose `run(value)` talks to the device |

The user then connects signals with **wires** (for example a sensor of yours to a Miniserver
input). Wires, topics and the Bus Inspector are the user's business; you only decide what exists
and what it does.

The user adds an **instance** of your plugin (with its settings) and then adds **signals** to the
instance, either by hand or by picking them from your [catalog](#catalog-browse-and-add). One
plugin can have many instances, for example one per inverter, and each runs separately.

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
`PluginEntry.define(MyPlugin)` in `src/index.ts` is the only line that connects your class to the
runtime. Loaded by Nexus it starts the runtime; imported anywhere else (tests, tools) it just
returns the class.

## The lifecycle of a plugin

Knowing the order of events tells you where code belongs. This is what your plugin sees, from the
user adding an instance to it being stopped.

### 1. Start of a run

1. **The worker starts** with an empty environment (`process.env` is empty) and a 128 MB heap
   limit (or the manifest's `heapMb`, up to 512). Nexus waits up to 10 seconds for the entry module to announce itself, which
   `PluginEntry.define()` does.
2. **Nexus sends the instance**: its id, slug, settings, the persisted store and the installation's
   time zone. The runtime checks your static declarations first (a sensor without `id`, or two
   sensors with the same `id`, fail the start with a clear message).
3. **The config is validated** against your static `config` schema, defaults applied. Invalid
   settings fail the start with `invalid config: …` and your code is not run.
4. **Your constructor and field initializers run.** `this.config`, `this.log`, `this.store`,
   `this.status`, `this.http`, `this.slug`, `this.timeZone` and `this.clock` are ready, so a field
   like `readonly api = new Api(this.config.host)` works.
5. **`start()` is awaited.** It has 30 seconds. Register timers and routes here and kick off first
   requests in the background. If it rejects, the instance goes to the *error* state: what you
   registered is disposed, and Nexus does not restart it, because a restart would fail the same
   way. If it takes longer than 30 seconds, Nexus treats the worker as hung, terminates it and
   restarts it with the delay described under [restarts](#starting-failing-and-degrading).

### 2. Signals

6. **Every configured signal is added**, one after the other. For each, the runtime validates its
   `params` against the capability's schema, constructs your `Sensor` or `Actuator` (so field
   initializers can use `this.plugin` and `this.params`), and awaits its `start()`. A signal whose
   `start()` throws or whose params are invalid is refused: the message shows on that signal, and
   the others are unaffected.
7. **Forced actuators are replayed.** If the user forced a value on an actuator, Nexus sends it
   again to the freshly started actuator, so `run()` can be called right after `start()` resolves.
8. **A watching plugin gets its list** (`watchChanged()`) and then values. See
   [watching](#watching-signals-exporters).

### 3. While it runs

- **A sensor emits**; the value goes to the bus and from there along the wires.
- **A command arrives** for an actuator: its `run(value)` is called with the value already
  converted to `accepts`. Commands to one actuator never overlap.
- **The user opens the instance page**: `panel()` is called. **The user browses the catalog**:
  `catalog()` is called. **A webhook is called**: your route handler runs.
- **The user adds, edits or removes a signal.** Adding constructs and starts a new sensor or
  actuator. Removing disposes it. **Editing a signal's params disposes the old object and creates
  a new one with the new params**, so `start()` runs again; nothing carries over except what
  lives in your plugin or store.
- **Nexus pings** the worker every 10 seconds. You do nothing for this, but a busy loop that never
  yields stops the answers.
- **The watched signals change**: `watchChanged()` and `watched()` are called.

### 4. Stop, change or crash

- **Stop.** When the user stops the instance, or Nexus shuts down, Nexus asks the worker to shut
  down and gives it **5 seconds**. First a running `watched()` finishes, then all sensors and
  actuators are disposed (their teardowns, then the next), then the plugin itself. Then the worker
  is terminated. Whatever is left after 5 seconds is cut off.
- **New settings or a new plugin version.** A running instance is stopped as above, and started
  again as a **new worker with a new plugin object**: the sequence in this section starts at step 1.
  Memory does not survive; the store does. An instance that was not running stays stopped. A
  changed slug moves the instance's topics; wires keep working because they refer to signals by id.
- **Crash.** If the worker exits, runs out of memory or stops answering pings, Nexus terminates
  it and starts a new one after a delay. Nothing of yours runs at that point (no `dispose()`), so
  you cannot flush on a crash; keep what must survive in the store.

Things you can rely on in every case: `dispose()` runs at most once per object, and a sensor or
actuator is never used after its `dispose()` has begun (`isDisposed` is then `true`).

## The plugin class

The plugin class is the entry point and the place that owns what the signals share: an API client,
a poller, a connection.

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
    void this.poller.poll()
    this.every(this.config.pollInterval * 1000, () => void this.poller.poll())
  }
}
```

(`Api`, `Poller`, `PowerSensor` and `SwitchActuator` are your own classes.)

### Static declarations

`config`, `sensors`, `actuators` and `watches` are static fields of your class, all optional. They
are static so Nexus can describe the plugin (to build forms and JSON Schema) without starting it.
On each sensor and actuator the static fields are `id` (required), `label`, `description`,
`params`, and `valueType` (sensors) or `accepts` and `concurrency` (actuators).

Give each sensor and actuator a `description`. Users pick from a list of them, and one sentence on
what it reads or does tells them more than a label alone.

### What the instance gives you

| Member | What it is for |
|---|---|
| `this.config` | The validated settings. Never changes during a run; saving new settings restarts the instance. |
| `this.log` | Log lines that show on the instance's page. See [Logging, store and status](#logging-store-and-status). |
| `this.store` | Small state that survives restarts, such as a token or a cursor. |
| `this.status` | Reports `degraded` or `running` to the UI. |
| `this.http` | Registers [webhook](#webhooks) routes. |
| `this.slug` | The instance's slug (its topic segment and webhook path), for example to show the hook URL. |
| `this.clock`, `this.timeZone` | The time to use instead of `Date.now()` and the installation's zone, see [Time](#time-and-time-zones). |
| `this.watch` | The signals the user chose, for [watching plugins](#watching-signals-exporters). |
| `this.context.instanceId` | The instance's stable id. The slug can change; the id cannot. |

### The methods you can override

| Method | When it is called |
|---|---|
| `start()` | Once per run, after construction. See [lifecycle](#the-lifecycle-of-a-plugin). |
| `catalog()` | When the user browses what to add. See [Catalog](#catalog-browse-and-add). |
| `panel()` | When the user opens or refreshes the instance page. See [Panel](#panel-a-status-page). |
| `watched()`, `watchChanged()` | For plugins that declare `watches`. See [Watching](#watching-signals-exporters). |
| `unhandledRejection(reason)` | When a promise anywhere in the worker rejects without a handler. |

`unhandledRejection()` exists because Node ends a thread on an unhandled rejection, and one
forgotten `.catch` would put your plugin into a crash loop. Nexus catches the rejection, calls this
method and keeps the worker running. The default logs an error with the stack. Override it to
say more, or to report a degraded state; it must not throw.

```ts
override unhandledRejection(reason: unknown) {
  super.unhandledRejection(reason)
  this.status.set("degraded", "an internal error occurred, see the log")
}
```

## Config: what the user fills in

The instance config is a zod schema. Nexus turns it into a form, so the choices you make in the
schema decide what the user sees.

```ts
const config = z.object({
  host: z.url().meta({ title: "Inverter address", description: "e.g. http://192.168.1.50" }),
  mode: z.enum(["current", "next"]).meta({ enumLabels: { current: "The active event", next: "The next event" } }),
  pollInterval: z.number().min(1).default(5)
})
```

- **Labels.** A field is labelled with its `title` and explained by its `description`
  (`.meta({ title: "Variable", description: "…" })`). Without a title the key is used (`entityId`
  becomes "Entity ID"). Prefer a title when the key is a generic word such as `name`, which the
  user would confuse with the signal's own name.
- **Choices.** An `z.enum` shows its values unless you name them with `enumLabels` as above.
- **`this.config`** has defaults applied and is available in field initializers.
- **Use the SDK's `z`.** Import it from `@lox-nexus/plugin-sdk` so your schemas and the runtime
  share one zod version.
- **Keep schemas simple**: strings, numbers, booleans, enums, optional fields and defaults, and
  arrays and objects of those (a list of devices, each with a name and a type, renders as a list
  the user adds rows to). The
  form is built from the JSON Schema, so transforms and refinements are lost there, while the worker
  still enforces them when it starts. An object-level `.refine()` or `.superRefine()` keeps the form
  the same; the form does not run the check, and the worker refuses a failing value at start (the
  instance goes to *error* with your message). The same holds for params.

### Checking, testing and migrating settings

Nexus asks the plugin to check settings before it saves them: your `config` schema runs in a
throwaway worker, and its issues show in the form by field. The plugin doesn't start for that.

`static test(config)` adds **Test connection** to the form. It gets a valid config, reaches the
device or service, and resolves with a short message, or throws with one the user can act on.
Only read: never write, never change anything on the device.

```ts
static async test(config: Config) {
  const info = await new Client(config.host).version()
  return `Connected to ${info.model} at ${config.host}`
}
```

When a release changes the shape of the config, raise `static configVersion` (default 1) and
give `static migrateConfig({ config, from, store })`. It gets the stored config of version
`from` (not validated) and returns the current shape; it may move data into the store. Nexus
stores the result with the new version. It runs when an instance starts, and when its settings
are saved before that, on a copy of its store whose writes Nexus applies.

**Make it safe to run again on the same data.** Older hosts don't store the result, so it runs at
every start with `from: 1`, also on a config already in the current shape; and a start that
fails after migrating repeats it. Take `from` as a lower bound, keep current fields that are
already there, and never overwrite what the store already holds:

```ts
static readonly configVersion = 2
static migrateConfig({ config, from, store }: ConfigMigration) {
  if (from >= 2) return config
  const { devices, ...rest } = config as { devices?: unknown }
  // only once: later, the store's list is the plugin's own and may have changed
  if (devices && store.get("devices") === undefined) store.set("devices", devices)
  return rest
}
```

In tests, `PluginTestHost.checkConfig(type, config, version?)` and `testConfig(type, config)`
run these without starting the plugin, and `start(type, { config, configVersion })` with
`host.migratedConfig` shows what init migrated.

### Fields that depend on a choice

A `z.discriminatedUnion` shows as a choice of its discriminator followed by the chosen branch's
fields, in settings, params and action forms. A literal names its value with `.meta({ title })`;
an enum branch names its values with `enumLabels`, and its title and description are the choice's:

```ts
const input = z.discriminatedUnion("type", [
  z.object({ type: z.enum(["light", "plug"]).meta({ title: "Type", enumLabels: { light: "Light", plug: "Plug" } }), name: z.string() }),
  z.object({ type: z.literal("door-lock").meta({ title: "Door lock" }), name: z.string(), allowUnlock: z.boolean().default(false) })
])
```

**Allow unlocking** shows only while Door lock is chosen; fields both branches have keep what was
typed when the choice changes. Other unions are edited as JSON.

### Helpers that change how a field is shown

All of these wrap a zod schema, return it unchanged in type, and only add a marker to the JSON
Schema.

**`secret(schema)`** is for passwords and tokens. The value is never sent back to the UI, and an
update that leaves it out keeps the stored value.

```ts
token: secret(z.string())
```

Only **top-level** fields are protected. A secret inside a nested object or an array is shown in the
UI, and saving the form erases it. `secret()` survives `.optional()`, `.default()` and
`.describe()` in any order, but keep the field at the top level of the object.

**`token(schema)`** is for a string that callers present to you, such as a webhook token. The form
shows a **Generate** button that fills in 24 random bytes as 48 hex characters, so the schema must
allow that length. Leave it visible so the user can copy it into the caller, or wrap it in
`secret()` as well to hide it.

```ts
token: token(z.string().min(16).optional())
```

**`signalName(schema)`** goes on the one top-level *param* of a sensor or actuator whose value
names the signal, such as a hook or variable name. The form names a new signal after what is typed
there (and its topic after that name) until the user names it. Without one, a new signal is named
after its kind ("Trigger (pulse)"), which says little once there are several.

```ts
static readonly params = z.object({ hook: signalName(z.string().min(1)) })
```

**`code(schema, language?)`** is for source code or a template. The UI edits it in a code editor.
`language` is `"javascript"` (default), `"json"` or `"text"`. The SDK does not validate the code:
compile or parse it in `start()` and throw with the line and column.

```ts
script: code(z.string().default("return input"), "javascript")
```

## Time and time zones

Two things about time are easy to get wrong in a worker.

**Use `this.clock.now()` instead of `Date.now()`** (and `new Date(this.clock.now())` for a `Date`).
`every()` and `after()` run on the same clock. In production it is the system clock; in tests it can
be a [`TestClock`](testing.md#time) you move by hand. Plugins, sensors and actuators have
`this.clock`. Other classes you `own()` (a poller, a client) inherit the plugin's clock for their
timers and read the time with `this.currentClock().now()`. A child that starts a timer in its own
constructor, before it is owned, stays on the system clock, so start timers in `start()` or later.

**Use `this.timeZone` for the local time.** The worker runs in the Nexus process's time zone, which
in a container is usually UTC. `this.timeZone` is the IANA zone of the installation (for example
`"Europe/Vienna"`), which Nexus takes from the Loxone project, or the server's zone while it has
none. Pass it to `Intl.DateTimeFormat` and friends. An unknown zone falls back to the server's
zone; it never throws. A time-based plugin can still offer its own `timeZone` setting that overrides
it, as the [Calendar plugin](calendar.md) does.

```ts
const local = new Intl.DateTimeFormat("en-GB", { timeZone: this.timeZone, hour: "2-digit", minute: "2-digit" })
  .format(this.clock.now())
```

`after()` and `every()` count elapsed time, not wall-clock time, so a clock step (an NTP sync after
boot) is not noticed. For a deadline given as a wall-clock time, wait in shorter slices (the
Calendar plugin caps its waits at 15 minutes) and re-check `this.clock.now()` each time.

## Starting, failing and degrading

There are three different ways to say "something is wrong", and they mean different things.

| Situation | What to do | What happens |
|---|---|---|
| The user must fix something (wrong credentials, a missing device) | Reject `start()` with a readable message | The instance goes to *error*. Nexus does **not** restart it. |
| The device is unreachable right now, but may come back | Resolve `start()`, call `this.status.set("degraded", "inverter unreachable")`, keep retrying | The instance shows as degraded with your message. |
| The device is back | `this.status.set("running")` | Back to normal. |

```ts
private async poll() {
  try {
    this.latest = await this.api.read()
    if (this.unreachable) {
      this.unreachable = false
      this.log.info("reading the inverter again")
      this.status.set("running")
    }
    this.emitter.emit("data", this.latest)
  } catch (error) {
    if (!this.unreachable) {
      this.unreachable = true
      this.log.warn("can't read the inverter", { problem: String(error) })
      this.status.set("degraded", `inverter unreachable: ${String(error)}`)
    }
  }
}
```

Report on **changes** as above, not on every failed poll, or you flood the log. Do not await slow
first requests in `start()` if the plugin works without them; start them in the background
(`void this.poller.poll()`) so a hanging device does not hold the start up.

A failure of one sensor, as opposed to the whole device, is reported with `fail()`, see
[Sensors](#sensors-values-from-the-device).

**Restarts.** Nexus restarts a worker that crashed, ran out of memory (128 MB heap, or the manifest's `heapMb`), took longer
than 30 seconds to start, or stopped answering its pings (sent every 10 seconds; the worker is
terminated after three go unanswered, so after roughly 30 to 40 seconds of a busy loop). The delay
before a restart doubles each time: 1 s, 2 s, 4 s and so on up to 5 minutes. A run that stays up for
60 seconds resets the delay. After a restart your plugin starts from step 1 of the
[lifecycle](#the-lifecycle-of-a-plugin).

## Sensors: values from the device

A sensor turns something your device reports into values on the bus. One instance of your class
exists per configured signal, created with validated `params`. The simplest sensor listens to a
poller that the plugin owns:

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
    this.listen(this.plugin.poller, "data", (data: Record<string, number>) => this.update(data))
    if (this.plugin.poller.latest) this.update(this.plugin.poller.latest)   // don't wait for the next poll
  }

  private update(data: Record<string, number>) {
    const watts = data[this.params.path]
    if (watts === undefined) this.fail(`no value at ${this.params.path}`)
    else this.emit(Value.number(watts))
  }
}
```

### `emit(value)`

Sends a value to the bus. It is safe to call on every poll: **equal consecutive values are dropped**
on the bus, so you do not compare with the previous one yourself. A value of the wrong type is
converted to the declared `valueType` ([Values](values.md#conversions)). A call after the sensor is
disposed does nothing, so a late callback is harmless. An `emit()` also clears an earlier `fail()`.

Note the last line of `start()` above: **a new sensor has no value until it emits.** If your data is
already in memory when a signal is added (the user adds a sensor to a running poller), emit it from
`start()`. Otherwise the signal stays empty until the next change.

### `fail(message)` and `recover()`

`fail(message)` says that this sensor cannot deliver any more, for example because the entity it
follows was deleted. The message shows on the signal and on the instance's error topic, and the last
value stays. It lasts until the next `emit()`.

`recover()` ends the failure when the sensor works again but there is no value to send (an entity
that is back but reports "unavailable"). It only tells the host after a `fail()`, so it is cheap to
call on every change. Use `fail()` for one signal and `status.set("degraded")` for the whole device.

### `params`, `plugin` and `signal`

- **`this.plugin`** is your plugin instance, for what sensors share (the poller above).
- **`this.params`** are the validated params, with defaults applied. Field initializers can use
  both already, just like a plugin's `this.config`:
  `private readonly path = this.params.path.split(".")`.
- **`this.signal`** is `{ id, label }` of the configured signal this sensor is: the stable id and
  the name the user gave it (an empty label with hosts that don't send it). Use it in log lines.
  If you declare your own constructor, pass the arguments on to `super()`, including the signal.
- **`this.clock`** is the plugin's clock, see [Time](#time-and-time-zones).

### `start()` for a sensor

Optional. It runs once when the signal is added, after construction. A rejected `start()` makes
adding the signal fail, and the user sees the message. It has 30 seconds like all requests to the
plugin. Register listeners and timers here, as in the example.

Declare `valueType` as precisely as you can: wires and the UI use it to offer fitting targets.

## Actuators: commands to the device

An actuator is the opposite direction: a command arrives and your code carries it out.

```ts
import { Actuator, z } from "@lox-nexus/plugin-sdk"
import type { ValueOf } from "@lox-nexus/plugin-sdk/values"

export class SwitchActuator extends Actuator<MyPlugin, { id: string }, ValueOf<"boolean">> {
  static readonly id = "switch"
  static readonly label = "Switch"
  static readonly description = "Turns a device on or off"
  static readonly params = z.object({ id: z.string() })
  static readonly accepts = "boolean"             // wires convert to this before run()
  static readonly concurrency = "latest"          // or "queue" (default)

  async run(value: ValueOf<"boolean">) {
    await this.plugin.api.set(this.params.id, value.value)   // throwing reports a failed result
  }
}
```

### `run(value)`

Performs the command. It is called with the value **already converted to `accepts`**, so a wire from
an analog input to your boolean actuator just works. `"any"` (the default) passes values unchanged.
Keep the generic `V` of `Actuator` in line with `accepts`.

`run()` ends when its promise settles, and **that is the moment the result is reported**, with the
duration, as a *result* message under the command on the bus. So:

- `await` the real work. If you return early, the command shows as done while the device is not.
- To report a failure, **throw or reject with an `Error` whose message a user can read**
  ("device returned 503"). It is shown as the failure reason. Do not swallow errors.
- Nexus marks a command as failed after **30 seconds** without an answer, but cannot stop your
  `run()`. Give your requests their own, shorter timeout.
- `run()` never overlaps itself, see below.

### `concurrency`

What if a command arrives while the previous one is still running?

- `"queue"` (default) runs every command, in order, one at a time. Use it when each command
  matters (a pulse, a switch).
- `"latest"` keeps only the newest waiting command. A dimmer dragged across its range sends many
  values; only the last matters, and the device is not flooded. The commands that were skipped are
  reported as *superseded* (`SupersededError`, raised by the runtime, not by you).

### `accepts`, `params`, `signal`, `start()`

`accepts` is described in [Values](values.md#choosing-types-for-your-signals). `params`, `plugin`,
`signal` and `clock` work as for sensors, and field initializers can use `this.plugin` and
`this.params`. `start()` is optional setup, called once before the first `run()`; a rejection makes
adding the signal fail.

### `fail(message)` and `recover()` for an actuator

An actuator that can't work for a while, for example because the device it controls was deleted,
calls `fail(message)`. The message shows on the signal and on the instance's error topic, like a
sensor's, until `recover()`. Unlike a sensor, nothing clears it by itself: call `recover()` when
the cause is gone. It only tells the host after a `fail()`, so it is cheap to call on every change.
Commands still reach `run()` meanwhile; throw there with the same message.

Prefer this to rejecting in `start()`: a rejected signal can't be added at all, while a failed one
stays configured and recovers when the device comes back.

### Causes are automatic

Whatever the plugin emits or logs while an actuator runs carries the bus message that triggered
it, so the Bus Inspector shows the effect under its cause. This follows awaits, timers and promises
started inside `run()` for as long as they live, so work that outlives the command (a timer you
start in `run()`) is still attributed to it. You do not pass anything around.

## Lifetimes: `Disposable`

Plugins, sensors and actuators all extend `Disposable`. It exists so nothing outlives its owner:
when a signal is removed or the instance stops, every timer, listener and child you registered
through it is released, and you write no cleanup code.

```ts
export class MyPlugin extends Plugin<Config> {
  readonly client = this.own(new Client(this.config.host))         // closed when the plugin stops

  override start() {
    this.every(60_000, () => void this.client.refresh())           // repeating timer
    this.after(5_000, () => this.log.info("5 s after start"))      // one-shot timer
    this.listen(this.client, "disconnect", () => this.onGone())    // an EventEmitter event
    this.onDispose(() => this.log.info("stopped"))                 // anything else
  }
}
```

These methods are `protected`: only the owner decides what lives and dies with it.

| Method | What it does |
|---|---|
| `this.own(resource)` | Disposes a child (a client, a poller, a socket wrapper) with this object, and returns it, so construction and registration fit in one expression. The child needs a `dispose()` (a `DisposableLike`). |
| `this.every(ms, fn)` | Repeating timer. The first run is after `ms`, not at once. Returns a cancel function. Throws `RangeError` unless `0 < ms <= Disposable.MAX_TIMER_MS` (about 24.8 days). |
| `this.after(ms, fn)` | One-shot timer. Returns a cancel function. Throws `RangeError` for a negative or non-finite `ms`. Longer delays are stepped, so they don't fire early. Calling it again and again (a restarted pulse) does not pile anything up. |
| `this.listen(emitter, event, listener)` | Subscribes to an `EventEmitter` (anything with `on` and `off`) and unsubscribes on dispose, so a long-lived emitter does not keep a dead sensor alive. |
| `this.onDispose(teardown)` | Your own cleanup: close a socket, flush a buffer. May be async. |
| `dispose()` | Releases everything. You rarely call it: Nexus disposes plugins, sensors and actuators, and `own()` disposes children. |
| `isDisposed` | `true` from the moment `dispose()` starts. Check it in a callback that can arrive late. |

Rules that follow from this:

- **Never use bare `setInterval`, `setTimeout` or `emitter.on`** in a long-lived class, or stop
  leaves things running.
- **Registering after dispose throws** (`Error`), so a late callback cannot leak a timer into a dead
  object.
- **Teardowns run in reverse registration order**, and an async teardown is awaited before the next
  one starts. If one fails, the others still run, and `dispose()` then throws an `AggregateError`
  collecting the errors. A second `dispose()` returns the same promise.
- **Stop order.** Sensors and actuators are disposed first, then the plugin (so a plugin's `own()`
  children, such as a poller, are still alive while signals shut down). The whole stop, a running
  `watched()` included, has 5 seconds; then the worker is terminated, so keep a last flush on
  dispose shorter than that (the InfluxDB plugin gives its last write 3 seconds).
- **An exception thrown inside a timer or listener callback is an uncaught exception.** It ends the
  worker and Nexus restarts it. Catch errors inside the callback and report them with `this.log`
  or `this.status`. A callback that returns a rejected promise goes to `unhandledRejection()`.
- `every()` does not wait for a slow callback: a long async `fn` can overlap its next run, so
  guard it yourself (a `polling` flag) if it matters.

Any class you own can be a `Disposable` itself, which gives it the same helpers. It inherits the
plugin's clock once owned.

## Logging, store and status

These three are on the plugin, and sensors and actuators reach them through `this.plugin`.

### `log`

```ts
this.log.debug("polled", { ms: 42 })
this.log.info("connected")
this.log.warn("slow answer", { ms: 4200 })
this.log.error("login failed", { status: 401 })
```

Lines go to the server log tagged with the instance, and the last lines show on the instance's
page. The second argument is structured data. It is structured-cloned, so something that cannot
be cloned (a socket, a function) is logged as text, and more than 64 KiB as JSON is replaced by
a note with its size. Message text is clipped at 10 000 characters. **Never log secrets.**

Inside an actuator's `run()` a log line is linked to the command that caused it. From a sensor or
actuator use `this.plugin.log` (the plugin's `log` is public). A sensor does not know its place in
the UI, so name the signal in the message with `this.signal.label` and the params.

```ts
this.plugin.log.warn("no value", { signal: this.signal.label, path: this.params.path })
```

**Debug lines** are kept only while the user switches on **Debug for 15 min** on the instance's
page. The rest of the time `log.debug()` is dropped in the worker before anything is sent, so
log as much detail at debug as helps finding a problem. A library with its own logging can follow
the switch with `this.logLevel`:

```ts
override start() {
  const apply = (level: LogLevel) => this.client.setVerbose(level === "debug")
  apply(this.logLevel.current)
  this.onDispose(this.logLevel.onChange(apply))
}
```

### `store`

Use the store for small state that must survive a restart and a plugin update: a login token, a
"last seen" id, a cursor. It is a key-value store of JSON per instance. Reads are synchronous
and come from memory; each write is sent to the host, which saves it.

```ts
private async token(): Promise<string> {
  const saved = this.store.get<{ value: string; expires: number }>("token")
  if (saved && saved.expires > this.clock.now() + 60_000) return saved.value
  const fresh = await this.api.login(this.config.user, this.config.password)
  this.store.set("token", { value: fresh.token, expires: fresh.expires })
  return fresh.token
}
```

- `get<T>(key)` returns `undefined` for a missing key. The cast to `T` is not checked, so validate
  data an older version of your plugin may have written.
- `set(key, value)` throws an `Error` for an empty key or one over 200 characters, for `undefined`
  (use `delete()`), for what JSON cannot hold (BigInt, circular objects), and for a value over
  1 MiB as JSON. Quietly, `undefined` fields are dropped, dates become strings and class instances
  are flattened. The value you read back with `get()` is the same copy that was stored.
- `delete(key)` removes a key; an absent key is not an error. `keys()` lists what is stored.
- The store is per instance and survives restarts, updates and rollbacks of the plugin.
  Newer versions must tolerate what older ones wrote, and the other way round.

### `status`

`this.status.set("degraded", message)` and `this.status.set("running")` are the plugin's own health,
see [Starting, failing and degrading](#starting-failing-and-degrading). The message is clipped at
10 000 characters. A new run starts as `running`, so set `degraded` again after a restart if the
problem is still there.

## Webhooks

Use a webhook when an external system should push to your plugin instead of you polling it.

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

**Webhooks are reachable without a login.** Anyone who can reach Nexus can call them, so check a
shared secret yourself, as above.

- **URL.** The route is `/hook/<instance slug><path>`, for example `/hook/demo/github`. Register
  routes in `start()`. Registering the same method and path twice throws an `Error`.
- **Matching.** A method of `"*"` matches any method. A path ending in `/*` matches everything
  below it (`/a/*` matches `/a/` and `/a/b`, not `/a`; `"/*"` everything), for names the user
  chooses at run time; the handler reads `request.path`. The most specific route wins: exact
  before prefix, longer prefix first, a named method before `"*"`. The
  [webhook plugin](webhook.md) is a full example with one catch-all route.
- **Request.** `method`, `path` (below `/hook/<slug>`), `query`, `headers` and `body`. Header names
  are lowercase, repeated headers and query keys are joined with `, `, and the session cookie is
  not forwarded. `body` is utf-8 text, so parse JSON or form data yourself.
- **Answer.** Return `{ status, headers?, body? }` (or a promise of it). `status` is 100 to 599;
  `headers` and `body` default to empty. The answer is sent with a restrictive content security
  policy, and you cannot set cookies.
- **Failures.** A handler that throws, or returns something that is not a valid response, gives the
  caller **502** and writes the error to the server log; the caller does not see your message. An
  unknown route gives 404. Calls are limited to 8 in flight per instance (429 beyond that), and a
  handler has 30 seconds. While the plugin is not running the caller gets 503.

## Catalog: browse and add

A catalog is a tree of ready-to-add signals. It saves the user from typing entity ids and paths:
they browse your device's own structure and add many signals at once. Offer one when the device can
list what it has (a Home Assistant's entities, an inverter's meters).

`catalog()` is asked on demand, when the user browses what to add, so it may query the device. A
throw is shown to the user. It must answer within 30 seconds, and with at most 16 MiB of JSON.

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

- A **node** has a `label` and `children`, `entries`, or both. Nodes are for navigation only.
- An **entry** names a capability by its static `id` and carries `params` that are validated against
  that capability's `params` schema when it is added. `label` is the suggested signal name.
- `value` and `unit` are optional. They show what the entry reads right now while the user browses
  (for an actuator: the state it would change), so give them whenever the data is at hand. Send the
  value the sensor would emit. The unit is the device's own, at most 32 characters. Both are only
  informative: an invalid value or a longer unit is dropped instead of failing the catalog.

## Panel: a status page

A panel is a view on the instance's page where you show facts that do not belong on the bus: a
firmware version, a table of discovered meters, the last error. Plugins ship no UI code, so a panel
is data, in one of four shapes:

```ts
override panel(): Panel {
  return { type: "keyValue", items: [{ label: "Firmware", value: "1.34" }] }
}
// or { type: "table", columns: ["Meter", "Power"], rows: [["Grid", "412 W"]] }
// or { type: "json", data: { anything: "serialisable as JSON" } }
// or { type: "sections", sections: [{ title: "Inverter", panel: { type: "keyValue", items } }, { title: "Meters", panel: { type: "table", columns, rows } }] }
```

`sections` shows titled parts one below the other (at most 20). Cells are strings, so format numbers
yourself. `panel()` is asked when the page is opened and when the user presses Refresh, and only while
the instance runs, so read from memory rather than querying the device. Returning `undefined`
shows nothing. **Never put secrets in a panel.**

## Watching signals (exporters)

Normally a plugin only offers signals. A *watching* plugin does the reverse: it receives the values
of signals the user chooses, Loxone signals, other plugins' sensors and actuators, anything on the
bus. That is how an exporter (InfluxDB, MQTT, a CSV file) works. Declare it and implement `watched()`:

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

- **`watches`** is the declaration (`label` 1 to 100 characters, `description` up to 500). Without it
  the plugin is never given values, even if it implements `watched()`.
- **The user decides what the plugin sees**, on the instance's page: all signals or chosen ones,
  whole Miniservers or plugin instances, single signals. The plugin's config says *how* it exports,
  never *what*. Until the user chooses, the plugin gets nothing.
- **`this.watch`** describes the chosen signals: `signals()` is the list and `signal(id)` one entry
  with `id`, `topic`, `label`, `valueType` and `owner`. It is empty until the first list arrives,
  which happens after `start()`. A topic changes when the signal or its owner is renamed.
- **`watchChanged()`** is called first, with the list ready in `this.watch`, then on every change
  (chosen, left out, renamed). It is optional to override.
- **`watched(values, dropped)`** gets batches of up to 1000 values, **oldest first**. The first
  batch holds the current value of each chosen signal (`initial: true`; actuators have none unless
  forced), and a signal added to the choice later also starts with its current value. After that come the changes as the bus shows them: forced values are marked `forced`, and
  commands to actuators have `kind: "command"`. `ts` is epoch milliseconds.
- **Callbacks never overlap**, and a batch always meets the list it was sent with. On shutdown, a
  running `watched()` finishes before the plugin is disposed.
- **Delivery is paced by the plugin.** The next batch comes once `watched()` returns (or its promise
  settles), and Nexus sends at most two batches ahead. While a plugin is slower than the values
  arrive, Nexus keeps a bounded queue (20 000 values) and drops the oldest; `dropped` says how many
  since the last batch. A throw in `watched()` is logged and doesn't stop the feed. Keep your own
  buffer bounded too.
- **Trust.** A watching plugin sees values of other systems, for example alarm states. The install
  review and the instance page say so. Secrets never travel on the bus.
- **Testing.** `host.watchSignals([...])` sets the chosen signals, and `await host.pushValues([...])`
  delivers a batch and resolves when `watched()` finished. See [Testing](testing.md#watching-signals).

## Limits at a glance

Everything numeric in one place. Keep these in mind and you will rarely meet the error messages.

| What | Limit |
|---|---|
| Time for the worker to announce itself | 10 s |
| Time for `start()` of the plugin | 30 s (then the worker is restarted) |
| Time for a signal's `start()`, a command, `catalog()`, `panel()`, a webhook answer | 30 s each |
| Ping interval and tolerated misses | every 10 s, terminated after 3 unanswered |
| Time to stop (watched batch, disposals, flush) | 5 s |
| Restart delay after a crash | 1 s, doubling to 5 min; reset after 60 s of running |
| Heap of the worker | 128 MB, or the manifest's `heapMb` (128 to 512); `process.env` is empty |
| Store key, store value | 1 to 200 characters, 1 MiB as JSON |
| Log text, log data | 10 000 characters, 64 KiB as JSON |
| Status message | 10 000 characters |
| Answer of `catalog()`, `panel()` or a webhook | 16 MiB as JSON |
| Panel sections, catalog unit | 20, 32 characters |
| Webhook calls in flight per instance | 8 (429 beyond) |
| Body of a webhook call | 1 MiB (the server answers 413 beyond) |
| Watch batch, queue | 1000 values, 20 000 values |

## Rules

- Depend only on `@lox-nexus/plugin-sdk` and your own npm packages. No native modules (see
  [Publishing](publishing.md#what-may-be-bundled)).
- Register every timer, listener and connection through `every()`, `after()`, `listen()` and
  `own()`.
- Never log secrets or put them in a panel. Wrap secret config fields in `secret()`.
- Do not rename capability ids or change param meanings between versions without a migration
  plan: they are stored with every configured signal.
- Read what older versions stored (config and store) and tolerate what newer versions add, so
  updates and rollbacks keep working.
