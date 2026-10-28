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

Use `mock.timers` instead of sleeping:

```ts
import { mock, test } from "node:test"

mock.timers.enable({ apis: ["setInterval"] })
// ... start the host, then:
mock.timers.tick(5000)
mock.timers.reset()
```

Enable only the timer APIs your plugin uses. See the [quick start](index.md#3-test-it) for a
complete example.

### When the plugin needs `setTimeout` and `Date`

Time-based plugins (a calendar, a schedule) need `setTimeout` and `Date` faked too. Watch for these:

- **The host's own waits use `setTimeout`.** `next()` and `stop()` wait with a real-looking
  timeout. With `setTimeout` faked they freeze unless you advance the clock, and a hung test
  never ends. Give the suite a safety net (`{ timeout: 10_000 }` on `test()` or `describe()`), and
  stop every host in `finally` or a cleanup function.
- **`tick(ms)` sets `Date` to the end of the tick first**, then runs the timers due within it. A
  timer set from a callback therefore sees a time that is too late. Advance in small steps:

  ```ts
  function advanceTo(time: string, stepMs = 60_000) {
    const target = Date.parse(time)
    while (Date.now() < target) mock.timers.tick(Math.min(stepMs, target - Date.now()))
  }
  ```

- **Waiting for network I/O cannot use fake `setTimeout`.** A real socket needs real event-loop
  turns, so wait with `setImmediate` in a loop and measure the deadline with `performance.now()`
  (not faked by default):

  ```ts
  async function until(done: () => boolean, ms = 2000) {
    const start = performance.now()
    while (!done()) {
      if (performance.now() - start > ms) throw new Error("timed out")
      await new Promise<void>(resolve => setImmediate(resolve))
    }
  }
  ```

- Enable `Date` together with the timers: `mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: Date.parse("2026-11-02T08:00:00Z") })`.
- Call `mock.timers.reset()` in `finally`, after the hosts have stopped.

The first-party Calendar plugin has a working harness for all of this in
`plugins/calendar/src/test-support/CalendarHarness.ts`.

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
