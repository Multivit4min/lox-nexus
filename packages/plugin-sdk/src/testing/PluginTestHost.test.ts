import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { Plugin } from "../plugin/Plugin.ts"
import { Sensor } from "../plugin/Sensor.ts"
import { PluginTestHost } from "./PluginTestHost.ts"

class Silent extends Sensor<Quiet, object> {
  static readonly id = "silent"
}

class Quiet extends Plugin {
  static readonly sensors = [Silent]
  readonly marker = "quiet"
}

test("waits time out for real while a test mocks timers, instead of hanging or ending early", async t => {
  const host = await PluginTestHost.start(Quiet)
  t.after(() => host.stop())
  const id = await host.addSensor("silent")
  mock.timers.enable({ apis: ["setTimeout"] })
  try {
    const waiting = host.next(id, 50)
    // a mocked tick far beyond the timeout must not end the wait
    mock.timers.tick(10_000)
    const started = performance.now()
    await assert.rejects(waiting, /no matching message from the plugin within 50 ms/)
    assert.ok(performance.now() - started >= 30, "it waited in real time")
  } finally {
    mock.timers.reset()
  }
})

test("plugin gives the instance, typed as its class", async () => {
  const host = await PluginTestHost.start(Quiet)
  const marker: string = host.plugin.marker
  assert.equal(marker, "quiet")
  await host.stop()
})
