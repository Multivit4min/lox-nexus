# Testing plugins

`@lox-nexus/plugin-sdk/testing` runs a plugin class in-process, through the same runtime that runs
it in a worker. You test the real code paths (config validation, signals, causes, store, status)
without a Nexus server.

Tests use `node:test` and `node:assert/strict`, and sit next to the code as `*.test.ts`.

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

## What the host gives you

| Member | Use |
|---|---|
| `PluginTestHost.start(MyPlugin, { config, store, instanceId })` | Starts the plugin. Throws with the plugin's message when the config is invalid or `start()` throws. |
| `PluginTestHost.describe(MyPlugin)` | The description the UI would get (JSON Schemas of config and params), without starting. |
| `addSensor(id, params)`, `addActuator(id, params)` | Add a signal; return its id. Throw for invalid params or a failing `start()`. |
| `next(signal, timeoutMs = 2000)` | The next value the signal emits after the call. |
| `values(signal)` | Every value emitted so far. |
| `actuate(signal, value, causeId?)` | Run an actuator; throws with the message `run()` threw. |
| `catalog()`, `panel()` | Call the plugin's `catalog()` and `panel()`. |
| `http({ path, method, headers, query, body })` | Call a webhook route; method defaults to `POST`. Returns `{ status, headers, body }`. |
| `status` | The last reported `{ status, message }`. |
| `store` | What the plugin persisted, as plain data. Pass `store` to `start` to simulate an earlier run. |
| `sent` | Every message the plugin sent, in order (logs, emits, status). |
| `remove(signal)`, `stop()` | Remove a signal, stop the plugin. |

Messages pass through `structuredClone` like at the real worker boundary, so data that cannot cross
it fails in tests too.

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

Give the host a `TestClock` and move it by hand, instead of sleeping:

```ts
import { PluginTestHost, TestClock } from "@lox-nexus/plugin-sdk/testing"

const clock = new TestClock("2026-11-02T08:00:00Z")
const host = await PluginTestHost.start(MyPlugin, { clock, config })
await clock.advance(5000)                     // or: await clock.advanceTo("2026-11-02T09:30:00Z")
```

The plugin's `every()` and `after()` run on it, and `this.clock.now()` reads it, in the plugin and
in its sensors and actuators.

- **Each timer runs at its own due time.** `advance()` goes from one due timer to the next, so a
  callback that reads the time or sets the next timer sees the time it was due at. After each
  callback it lets promise callbacks and I/O events run once.
- **Network I/O stays real.** A read that a timer starts against a test server is still running
  when `advance()` returns. Wait for it the way your plugin lets you (an awaited `refresh()`, or
  polling with `setImmediate`).
- **`clock.jump(ms)`** steps the time without running anything, like an NTP correction: pending
  timers keep their remaining delay. Use it to test that a plugin catches a wall-clock step.
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
go to the plugin as they would in a worker. Use it for one host at a time. `host.unhandledRejection(reason)`
hands a single reason to the plugin without it.

## Reaching the plugin instance

`host.plugin` is the plugin object, typed as your class, for state that signals, `catalog()`,
`panel()`, `http()` and `status` can't show. Prefer those where you can.

## Watching signals

For a plugin that declares `watches`: `await host.watchSignals([...])` sets the chosen signals
(calls `watchChanged()`), and `await host.pushValues([...], dropped?)` delivers one batch and
resolves once `watched()` finished. `ts` defaults to now and `kind` to `"state"`. Values are
checked like the host's: numbers must be finite, so an invalid value throws with the reason.

```ts
await host.watchSignals([{ id: "t", topic: "loxone/home/in/t", label: "Temperature", valueType: "number" }])
await host.pushValues([{ signalId: "t", value: Value.number(21.5) }])
```

## Webhooks

```ts
const response = await host.http({ path: "/github", headers: { "x-hook-secret": "s" }, body: "{}" })
assert.equal(response.status, 204)
```
