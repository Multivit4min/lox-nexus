# The plugin class

You need this page for every plugin: the class that owns what its signals share.

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

## Static declarations

`config`, `sensors`, `actuators` and `watches` are static fields of your class, all optional. They
are static so Nexus can describe the plugin (to build forms and JSON Schema) without starting it.
On each sensor and actuator the static fields are `id` (required), `label`, `description`,
`params`, and `valueType` (sensors) or `accepts` and `concurrency` (actuators).

Give each sensor and actuator a `description`. Users pick from a list of them, and one sentence on
what it reads or does tells them more than a label alone.

## What the instance gives you

| Member | What it is for |
|---|---|
| `this.config` | The validated settings. Never changes during a run; saving new settings restarts the instance. |
| `this.log` | Log lines that show on the instance's page. See [Logging, store and status](logging-and-store.md). |
| `this.store` | Small state that survives restarts, such as a token or a cursor. |
| `this.status` | Reports `degraded` or `running` to the UI. |
| `this.http` | Registers [webhook](webhooks.md) routes. |
| `this.slug` | The instance's slug (its topic segment and webhook path), for example to show the hook URL. |
| `this.clock`, `this.timeZone` | The time to use instead of `Date.now()` and the installation's zone, see [Time](lifetimes.md#time-and-time-zones). |
| `this.watch` | The signals the user chose, for [watching plugins](watching.md). |
| `this.context.instanceId` | The instance's stable id. The slug can change; the id cannot. |

## The methods you can override

| Method | When it is called |
|---|---|
| `start()` | Once per run, after construction. See [lifecycle](lifecycle.md). |
| `catalog()` | When the user browses what to add. See [Catalog](catalog.md). |
| `panel()` | Every 3 s while the instance page is open, or, with `static panelUpdates = "push"`, when you call `panelChanged()` (and every 30 s). See [Panel](panel.md). |
| `watched()`, `watchChanged()` | For plugins that declare `watches`. See [Watching](watching.md). |
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
