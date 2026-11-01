// #region imports
import assert from "node:assert/strict"
import http from "node:http"
import type { AddressInfo } from "node:net"
import { afterEach, beforeEach, test } from "node:test"
import { PluginTestHost, TestClock } from "@lox-nexus/plugin-sdk/testing"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { FakePlug } from "./fake/FakePlug.ts"
import { SmartPlugPlugin } from "./SmartPlugPlugin.ts"
// #endregion

// #region setup
let plug: FakePlug
let address: string

// every test gets its own plug on a free port, so tests can't see each other's switching
beforeEach(async () => {
  plug = new FakePlug()
  address = await plug.start()
})
afterEach(() => plug.stop())

/** starts the plugin against the fake plug and waits for its first reading */
async function started(clock = new TestClock()) {
  const host = await PluginTestHost.start(SmartPlugPlugin, { config: { address }, clock })
  await host.plugin.poll()
  return host
}
// #endregion

// #region test-connection
test("Test connection names the plug, and says what is wrong when it can't reach it", async () => {
  assert.equal(await PluginTestHost.testConfig(SmartPlugPlugin, { address }), "Connected to \"Desk lamp\", which is off")
  const unplugged = new FakePlug()
  const nowhere = await unplugged.start()
  await unplugged.stop()
  await assert.rejects(PluginTestHost.testConfig(SmartPlugPlugin, { address: nowhere }), /can't reach the plug at http:\/\/127\.0\.0\.1:\d+/)
})
// #endregion

// #region sensors
test("the sensors send the plug's readings, and again after each poll", async () => {
  const clock = new TestClock()
  const host = await started(clock)
  try {
    const power = await host.addSensor("meter", { reading: "power" })
    const on = await host.addSensor("switched-on")
    assert.deepEqual([host.values(power), host.values(on)], [[Value.number(0)], [Value.boolean(false)]])
    plug.on = true
    const next = host.next(on)
    await clock.advance(5000)
    assert.deepEqual(await next, Value.boolean(true))
    assert.deepEqual(host.values(power).at(-1), Value.number(60))
  } finally {
    await host.stop()
  }
})
// #endregion

// #region switch
test("the switch switches the plug, and Switched on follows at once", async () => {
  const host = await started()
  try {
    const on = await host.addSensor("switched-on")
    const button = await host.addActuator("switch")
    await host.actuate(button, Value.boolean(true))
    assert.equal(plug.on, true)
    assert.deepEqual(host.values(on), [Value.boolean(false), Value.boolean(true)])
  } finally {
    await host.stop()
  }
})
// #endregion

// #region unexpected
test("an answer that isn't a plug's is refused with a message, not read as values", async () => {
  const other = http.createServer((_request, response) => void response.end("<html>router login</html>"))
  await new Promise<void>(resolve => other.listen(0, "127.0.0.1", resolve))
  const { port } = other.address() as AddressInfo
  try {
    await assert.rejects(PluginTestHost.testConfig(SmartPlugPlugin, { address: `http://127.0.0.1:${port}` }), /answered something unexpected/)
  } finally {
    await new Promise(resolve => other.close(resolve))
  }
})
// #endregion

// #region unplugged
test("an unplugged plug degrades the instance, which recovers when it is back", async () => {
  const host = await started()
  try {
    const port = Number(new URL(address).port)
    await plug.stop()
    await host.plugin.poll()
    assert.equal(host.status.status, "degraded")
    assert.match(host.status.message ?? "", /can't reach the plug/)
    plug = new FakePlug()
    await plug.start(port)
    await host.plugin.poll()
    assert.equal(host.status.status, "running")
  } finally {
    await host.stop()
  }
})
// #endregion

// #region catalog-panel
test("the catalog offers every signal with its value now, and the panel shows the plug", async () => {
  plug.on = true
  const host = await started()
  try {
    const [node] = await host.catalog()
    assert.equal(node?.label, "Desk lamp")
    assert.deepEqual(node?.entries?.map(entry => [entry.label, entry.value]), [
      ["Power", Value.number(60)], ["Energy", Value.number(0)], ["Switched on", Value.boolean(true)], ["Switch", undefined]
    ])
    const panel = await host.panel()
    assert.equal(panel?.type, "keyValue")
    assert.deepEqual(panel.type === "keyValue" && panel.items.map(item => item.value), [
      "Desk lamp", { text: "on", tone: "ok" }, "60 W", "0 kWh", { at: 0 }
    ])
  } finally {
    await host.stop()
  }
})
// #endregion
