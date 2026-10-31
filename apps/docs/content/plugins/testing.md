# Testing plugins

`@lox-nexus/plugin-sdk/testing` runs a plugin class in-process, through the same runtime that runs
it in a worker. So you test the real code paths (config validation, signals, causes, store, status)
without a Nexus server, and without starting a thread.

Tests use `node:test` and `node:assert/strict`, and sit next to the code as `*.test.ts`. Run them
with `npm test`.

```ts
import assert from "node:assert/strict"
import { test } from "node:test"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { Value } from "@lox-nexus/plugin-sdk/values"

test("power is emitted and the switch works", async () => {
  const host = await PluginTestHost.start(MyPlugin, { config: { host: "http://127.0.0.1:8080", token: "t" } })
  try {
    const power = await host.addSensor("power", { path: "pv" })
    assert.deepEqual(await host.next(power), Value.number(3412))
    const sw = await host.addActuator("switch", { id: "kitchen" })
    await host.actuate(sw, Value.boolean(true))
    assert.equal(host.status.status, "running")
  } finally {
    await host.stop()
  }
})
```

Always stop the host in `finally`: it disposes the plugin, which clears its timers and closes its
connections. A test that leaves a timer behind keeps `node --test` from exiting.

## How a test host works

`PluginTestHost` plays the part of Nexus. `start()` does what a real start does (validate the
config, build the plugin, run its `start()`), and every other method sends the message Nexus would
send: `addSensor()` is a `signal.add` request, `actuate()` is an `actuate` request, and so on. The
[lifecycle](authoring.md#the-lifecycle-of-a-plugin) you read about is the lifecycle you test.

What the plugin sends back is recorded. Everything passes through `structuredClone`, like at the
real worker boundary, so data that cannot cross it (a function in a log's `data`) fails in tests too.

## What the host gives you

### Starting and stopping

**`PluginTestHost.start(MyPlugin, options)`** starts the plugin and resolves when it is ready. It
throws an `Error` with the plugin's own message when the config is invalid or `start()` throws, so
a test for a refused start is `await assert.rejects(PluginTestHost.start(...), /message/)`.

| Option | Default | Meaning |
|---|---|---|
| `config` | `{}` | The instance settings, validated against your `config` schema with defaults applied. |
| `store` | `{}` | What the store holds at start, to simulate an earlier run. |
| `instanceId`, `slug` | `"test"` | The instance's id and `this.slug`. |
| `clock` | system clock | A [`TestClock`](#time) for the plugin's timers and `this.clock`. |
| `timeZone` | none | The zone Nexus would send, for `this.timeZone`. Without one the plugin sees the server's. |
| `forwardRejections` | `false` | See [Unhandled promise rejections](#unhandled-promise-rejections). |

**`host.stop()`** shuts the plugin down like Nexus does: signals are disposed, then the plugin, and
it resolves when the plugin reported `stopped`. A test can call it as the thing under test, too:
assert that a timer is gone, or that a last write was flushed.

In production Nexus gives a plugin 5 seconds to stop. The test host waits for the plugin's
`stopped` answer for only **2 seconds** of real time, so a plugin whose shutdown takes longer fails
the test with `no matching message from the plugin within 2000 ms`. Keep teardowns quick, or fake
the slow part in tests.

**Tip: stopping with a `TestClock`.** A timer the plugin starts during shutdown (say an `after()`
deadline for a graceful disconnect) runs on the `TestClock`, which only moves when the test says so.
`stop()` then waits for a timer that never fires and can hang. Advance the clock while stopping:

```ts
const stopping = host.stop()
await clock.advance(5000)
await stopping
```

**`PluginTestHost.describe(MyPlugin)`** returns the description the UI would get (the JSON Schemas of
config and params, labels, value types), without starting the plugin. Use it to check the form: a
secret is `writeOnly`, a token has `format: "token"`.

### Signals

**`addSensor(capability, params?, label?)`** and **`addActuator(...)`** add a signal the way the user
does and resolve after its `start()`. They return the signal's id (`"sensor-1"`, `"actuator-2"`, in
order). They throw for an unknown capability, params that do not match your schema (the message
lists the fields), and a `start()` that throws. `label` becomes `this.signal.label`.

**`next(signal, timeoutMs = 2000)`** waits for the next value the sensor emits **after the call** and
returns it. It throws after the timeout, so a missing value fails the test instead of hanging.
**`values(signal)`** returns every value emitted so far. Use `values()` for what already happened
and `next()` to wait.

```ts
const power = await host.addSensor("power", { path: "pv" })
const first = host.next(power)          // start waiting before the trigger
await host.plugin.poller.poll()
assert.deepEqual(await first, Value.number(3412))
assert.equal(host.values(power).length, 1)
```

Note that a sensor which emits in `start()` has already done so by the time `addSensor()` resolves:
read it with `values()`, not `next()`.

**`actuate(signal, value, causeId?)`** runs the actuator and resolves when `run()` has finished. It
throws an `Error` with the message `run()` threw, which is how a failed command looks to Nexus. The
value is converted to `accepts` first, exactly as in production, so `Value.number(42)` to a string
actuator arrives as `"42"`. `causeId` is the bus message it answers; emits and logs made while it
runs carry it (look for `causeId` in `host.sent`). The `concurrency` is honoured: two `actuate()`
calls on a `"latest"` actuator, the second made while the first runs, reject the superseded one.

**`remove(signal)`** disposes the signal as when the user deletes it. Unknown ids are ignored. To
test an edited signal, remove it and add it again with the new params, which is what Nexus does.

### Catalog, panel, webhooks

**`catalog()`** and **`panel()`** call the plugin's methods and return the answer (`panel()` may be
`undefined`). Both throw if the plugin throws. Panel values are cells (text, or text with a tone
and a time); **`cellText(cell)`** from `@lox-nexus/plugin-sdk/testing` reads the text:

```ts
const panel = await host.panel()
const items = panel?.type === "keyValue" ? Object.fromEntries(panel.items.map(item => [item.label, cellText(item.value)])) : {}
assert.equal(items.Firmware, "1.34")
```

**What an older Nexus gets.** By default the plugin runs as on a current Nexus. Start it with
`hostFeatures: []` to see what an older one gets: tiles and notices as key-value lists, cells as
text, an action's message without its panel part, and no `panel.changed` or `action.progress`
messages (on a current host they are in `host.sent`).

**Actions.** **`action(id, input)`** resolves with the action's message; **`actionAnswer(id, input)`**
with the whole answer, `{ message?, panel? }` where the action returns one. **`actuate(id, value,
causeId, replayed)`** with `replayed` true shows what a run sees for a force delivered again.

**Find on the network.** **`PluginTestHost.discover(Plugin, field, config?)`** runs `static
discover` as the form's Find does. Test the search itself against a responder on 127.0.0.1:
`Mdns.browse(type, { address: "127.0.0.1", port, timeoutMs: 300 })` asks it instead of the
network.

**`http({ path, method, headers, query, body })`** calls a webhook route. Only `path` is required;
the method defaults to `POST`. It returns `{ status, headers, body }`, with the defaults filled in.
An unknown route answers 404, and a throwing handler makes `http()` reject (Nexus would answer 502).

```ts
const response = await host.http({ path: "/github", headers: { "x-hook-secret": "s" }, body: "{}" })
assert.equal(response.status, 204)
```

### Reading what the plugin did

| Member | Use |
|---|---|
| `status` | The last status the plugin reported: `{ status: "running" \| "degraded", message? }`; `running` if none. |
| `store` | What the plugin persisted, as plain data. Pass `store` to `start` to simulate an earlier run. |
| `sent` | Every message the plugin sent, in order. A log line is `{ type: "log", level, message, data?, causeId? }`. Filter it for what no other member shows. |
| `plugin` | The plugin object, typed as your class, for state that signals, `catalog()`, `panel()`, `http()` and `status` can't show. Prefer those where you can. |

```ts
const warnings = host.sent.filter(message => message.type === "log" && message.level === "warn")
assert.equal(warnings.length, 1)
assert.equal(host.store["token"], "abc")
```

## Fake external systems

Do not call real services in tests. Start a small server on the loopback interface and port 0 (the
OS picks a free port), and point the plugin's config at it:

```ts
import http from "node:http"
import type { AddressInfo } from "node:net"

const server = http.createServer((request, response) => {
  response.setHeader("content-type", "application/json")
  response.end(JSON.stringify({ pv: 3412 }))
})
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
const { port } = server.address() as AddressInfo
// ... PluginTestHost.start(MyPlugin, { config: { host: `http://127.0.0.1:${port}` } })
server.close()
```

Put recorded (or documented) responses under `test/fixtures/` and serve those. Close servers in
`finally`, too. WebSocket and UDP fakes work the same way (bind to `127.0.0.1`, port 0).

## Time

A plugin that polls or waits uses timers, and a test must not sleep for real. Give the host a
`TestClock` and move it by hand:

```ts
import { PluginTestHost, TestClock } from "@lox-nexus/plugin-sdk/testing"

const clock = new TestClock("2026-11-02T08:00:00Z")
const host = await PluginTestHost.start(MyPlugin, { clock, config })
await clock.advance(5000)                     // or: await clock.advanceTo("2026-11-02T09:30:00Z")
```

The plugin's `every()` and `after()` run on it, and `this.clock.now()` reads it, in the plugin and
in its sensors and actuators.

| `TestClock` member | What it does |
|---|---|
| `new TestClock(start?)` | Starts at an epoch-milliseconds number, an ISO string or a `Date`; default 0. |
| `now()` | The current fake time. |
| `advance(ms)` | Moves the time forward, running every timer that comes due, in order. Rejects if a timer callback throws, or if another `advance()` is still running. |
| `advanceTo(time)` | Like `advance()` up to a time. Never moves backwards. |
| `jump(ms)` | A wall-clock step (negative goes back) that runs nothing, like an NTP correction. |
| `pending` | How many timers are still waiting (intervals count until cleared). Assert `0` after `stop()` to check a plugin cleans up. |

- **Each timer runs at its own due time.** `advance()` goes from one due timer to the next, so a
  callback that reads the time or sets the next timer sees the time it was due at. After each
  callback it lets promise callbacks and I/O events run once.
- **Network I/O stays real.** A read that a timer starts against a test server is still running
  when `advance()` returns. Wait for it the way your plugin lets you (an awaited `refresh()`, or
  polling with `setImmediate`).
- **`clock.jump(ms)`** steps the time without running anything: pending timers keep their remaining
  delay, because real timers count elapsed time, not wall-clock time. Use it to test that a plugin
  catches a wall-clock step. (An `after()` longer than about 24.8 days is the exception: it
  re-measures its rest against the clock in steps, so a jump shortens or lengthens it.)
- **A timer callback that throws** makes `advance()` reject with that error; the time stays at
  that timer's due time. In production it would be an uncaught exception. Like in Node, a 0 ms
  timer waits 1 ms.
- The host's own waits (`next()`, `stop()`) use real timers, so they work with any clock.

The first-party Calendar plugin is tested this way: see
`plugins/calendar/src/test-support/CalendarHarness.ts`.

### With `mock.timers`

A plugin that reads `Date.now()` itself, or code outside the plugin, can still be tested with
`mock.timers`: the default clock looks up the global timers on every call. Two things to know:
`tick(ms)` sets `Date` to the end of the tick before it runs the timers due within it, so a timer
set from a callback sees a time that is too late; and with `setTimeout` faked, waiting for real
network I/O needs `setImmediate` in a loop. `TestClock` avoids both.

## Unhandled promise rejections

In a worker, a rejected promise that nobody handles goes to your plugin's `unhandledRejection()`.
Under `node --test` it fails the test instead. To test your handler, start the host with
`forwardRejections: true`: from start until `stop()` returns, the process's unhandled rejections
go to the plugin as they would in a worker. Use it for one host at a time (a second throws).
`host.unhandledRejection(reason)` hands a single reason to the plugin without it.

```ts
const host = await PluginTestHost.start(MyPlugin, { forwardRejections: true })
host.unhandledRejection(new Error("boom"))
assert.equal(host.status.status, "degraded")      // if your override sets it
await host.stop()
```

## Watching signals

For a plugin that declares `watches`: `await host.watchSignals([...])` sets the chosen signals
(calls `watchChanged()`), and `await host.pushValues([...], dropped?)` delivers one batch and
resolves once `watched()` finished. `ts` defaults to now (on the host's clock) and `kind` to
`"state"`. Values are checked like the host's: numbers must be finite, so an invalid value throws
with the reason.

```ts
await host.watchSignals([{ id: "t", topic: "loxone/home/in/t", label: "Temperature", valueType: "number" }])
await host.pushValues([{ signalId: "t", value: Value.number(21.5) }])
```

Call `watchSignals()` before `pushValues()`, as Nexus does: `this.watch.signal(id)` is empty until
then.

## What the test host does not cover

It does not start a thread, so it cannot test the heap limit, the 30-second timeouts, the restart
delay or the empty `process.env`; those belong to Nexus and are described in the
[plugin guide](authoring.md#limits-at-a-glance). It does enforce the checks the runtime makes on
what you send (store limits, answer shapes), because it is the same runtime.
`PluginRuntimeForTests` is exported for Nexus' own tests; its constructor may change, don't use it.
