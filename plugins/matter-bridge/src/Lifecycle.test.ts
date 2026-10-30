import assert from "node:assert/strict"
import { createSocket } from "node:dgram"
import { test } from "node:test"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { MatterBridgePlugin } from "./MatterBridgePlugin.ts"
import { FreePort } from "./test-support/FreePort.ts"
import { LoopbackMdns } from "./test-support/LoopbackMdns.ts"

// test bridges announce on loopback only, not to the LAN
LoopbackMdns.use()

/** resource types active now beyond the baseline (counted per type) */
function added(baseline: string[]) {
  const left = new Map<string, number>()
  for (const type of baseline) left.set(type, (left.get(type) ?? 0) + 1)
  return process.getActiveResourcesInfo().filter(type => {
    const count = left.get(type) ?? 0
    left.set(type, count - 1)
    return count <= 0
  })
}

/** what is still open a moment after a stop (sockets close on the next turn) */
async function settled(baseline: string[]) {
  for (let tries = 0; tries < 50 && added(baseline).length > 0; tries++) await new Promise(resolve => setTimeout(resolve, 20))
  return added(baseline)
}

const devices = [{ name: "Door", type: "contact-sensor" }, { name: "Kitchen", type: "dimmable-light" }]

test("stop/start cycles leave no sockets or timers behind, and the next start works", { timeout: 30_000 }, async () => {
  const port = await FreePort.udp()
  const store = {}
  const baseline = process.getActiveResourcesInfo()
  for (let round = 0; round < 2; round++) {
    const host = await PluginTestHost.start(MatterBridgePlugin, { config: { port, devices }, store })
    const door = await host.addActuator("contact", { device: "Door" })
    await host.addSensor("on-off", { device: "Kitchen" })
    await host.actuate(door, Value.boolean(round === 0))
    assert.ok(added(baseline).includes("UDPWrap"), "the bridge listens")
    await host.panel()
    await host.stop()
    assert.deepEqual(await settled(baseline), [], `round ${round}`)
  }
})

test("a contact keeps the state Nexus sent last across a restart; removed devices are forgotten", { timeout: 30_000 }, async () => {
  const port = await FreePort.udp()
  const first = await PluginTestHost.start(MatterBridgePlugin, { config: { port, devices } })
  await first.actuate(await first.addActuator("contact", { device: "Door" }), Value.boolean(true))
  await first.stop()
  const second = await PluginTestHost.start(MatterBridgePlugin, { config: { port, devices }, store: first.store })
  assert.equal((second.plugin.devices.get("Door")!.endpoint.state as unknown as { booleanState: { stateValue: boolean } }).booleanState.stateValue, false, "still open")
  await second.stop()
  const third = await PluginTestHost.start(MatterBridgePlugin, { config: { port, devices: [] }, store: second.store })
  assert.deepEqual(Object.keys(third.store).filter(key => key.startsWith("state:")), [])
  await third.stop()
})

test("a UDP port in use fails the start with a message saying so, and leaves nothing behind", { timeout: 30_000 }, async () => {
  const blocker = createSocket({ type: "udp6", ipv6Only: false })
  await new Promise<void>(resolve => blocker.bind(0, () => resolve()))
  const port = blocker.address().port
  const baseline = process.getActiveResourcesInfo()
  try {
    await assert.rejects(PluginTestHost.start(MatterBridgePlugin, { config: { port, devices } }), new RegExp(`UDP port ${port} is in use by another program`))
    assert.deepEqual(await settled(baseline), [])
  } finally {
    await new Promise<void>(resolve => blocker.close(() => resolve()))
  }
})
