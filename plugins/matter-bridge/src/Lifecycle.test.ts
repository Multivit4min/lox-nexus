import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { createSocket } from "node:dgram"
import { test } from "node:test"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { BridgeNode } from "./matter/BridgeNode.ts"
import { MatterBridgePlugin } from "./MatterBridgePlugin.ts"
import { BridgeHarness } from "./test-support/BridgeHarness.ts"
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
  const store = BridgeHarness.store(devices)
  const baseline = process.getActiveResourcesInfo()
  for (let round = 0; round < 2; round++) {
    const host = await PluginTestHost.start(MatterBridgePlugin, { config: { port }, store })
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
  const first = await PluginTestHost.start(MatterBridgePlugin, { config: { port }, store: BridgeHarness.store(devices) })
  await first.actuate(await first.addActuator("contact", { device: "Door" }), Value.boolean(true))
  await first.stop()
  const second = await PluginTestHost.start(MatterBridgePlugin, { config: { port }, store: first.store })
  assert.equal((second.plugin.devices.get("Door")!.endpoint.state as unknown as { booleanState: { stateValue: boolean } }).booleanState.stateValue, false, "still open")
  await second.stop()
  const third = await PluginTestHost.start(MatterBridgePlugin, { config: { port }, store: { ...second.store, devices: [] } })
  assert.deepEqual(Object.keys(third.store).filter(key => key.startsWith("state:")), [])
  await third.stop()
})

test("a UDP port in use fails the start with a message saying so, and leaves nothing behind", { timeout: 30_000 }, async () => {
  const blocker = createSocket({ type: "udp6", ipv6Only: false })
  await new Promise<void>(resolve => blocker.bind(0, () => resolve()))
  const port = blocker.address().port
  const baseline = process.getActiveResourcesInfo()
  try {
    await assert.rejects(PluginTestHost.start(MatterBridgePlugin, { config: { port }, store: BridgeHarness.store(devices) }), new RegExp(`UDP port ${port} is in use by another program`))
    assert.deepEqual(await settled(baseline), [])
  } finally {
    await new Promise<void>(resolve => blocker.close(() => resolve()))
  }
})

test("devices of an old config are taken over once, keeping their Matter identity and their names as ids", { timeout: 30_000 }, async () => {
  const port = await FreePort.udp()
  const legacy = { port, devices: [{ name: "Kitchen", type: "dimmable-light" }, { name: "Door", type: "contact-sensor" }] }
  const host = await PluginTestHost.start(MatterBridgePlugin, { config: legacy })
  try {
    assert.deepEqual(host.store.devices, [
      { id: "Kitchen", name: "Kitchen", type: "dimmable-light", allowUnlock: false, seed: "dimmable-light\nKitchen" },
      { id: "Door", name: "Door", type: "contact-sensor", allowUnlock: false, seed: "contact-sensor\nDoor" }
    ])
    // the endpoint id the first versions derived from type and name, so a paired Alexa keeps the device
    const expected = `device-${createHash("sha256").update("dimmable-light\nKitchen").digest("hex").slice(0, 16)}`
    assert.equal(host.plugin.devices.get("Kitchen")?.identity.endpointId, expected)
    // signals of the old versions named the device, which is now its id
    await host.addSensor("on-off", { device: "Kitchen" })
  } finally {
    await host.stop()
  }
  // once stored, the config's list is ignored, and a config saved in the new form (name and port) keeps the devices
  const again = await PluginTestHost.start(MatterBridgePlugin, { config: { name: "Home", port }, store: host.store })
  assert.deepEqual(again.plugin.devices.all().map(device => device.id), ["Kitchen", "Door"])
  await again.stop()
})

test("pinned: a config saved from the form before the first start of this version has lost the old list (REFERENCE warns)", { timeout: 30_000 }, async () => {
  // the form sends only name and port, so the old devices key is gone before the takeover could run
  const host = await PluginTestHost.start(MatterBridgePlugin, { config: { name: "Lox Nexus", port: await FreePort.udp() } })
  assert.deepEqual(host.plugin.devices.all(), [])
  assert.equal(host.store.devices, undefined)
  await host.stop()
})

test("a stop with the paired controller gone ends within the deadline and still writes pending states", { timeout: 30_000 }, async () => {
  const bridge = await BridgeHarness.start([{ name: "Door", type: "contact-sensor" }])
  await bridge.pair()
  await bridge.host.actuate(await bridge.host.addActuator("contact", { device: "Door" }), Value.boolean(true))
  assert.equal(bridge.host.plugin.coalescer.size > 0, true, "the state waits in the coalescer")
  await bridge.controller.close()
  const started = performance.now()
  await bridge.host.plugin.dispose()
  const took = performance.now() - started
  assert.ok(took < BridgeNode.CLOSE_MS + 500, `took ${Math.round(took)} ms`)
  assert.deepEqual(bridge.host.store["state:" + bridge.host.plugin.devices.get("Door")!.identity.endpointId], { contact: true })
  assert.ok(bridge.host.sent.some(message => message.type === "log" && message.message.startsWith("the Matter bridge didn't close within 3 s")))
  await bridge.host.stop()
})

test("a long press still holding the button ends when the bridge stops", { timeout: 30_000 }, async () => {
  const host = await PluginTestHost.start(MatterBridgePlugin, { config: { port: await FreePort.udp() }, store: BridgeHarness.store([{ name: "Bell", type: "generic-switch" }]) })
  const press = host.actuate(await host.addActuator("long-press", { device: "Bell" }), Value.boolean(true)).then(() => "done", () => "failed")
  const held = () => (host.plugin.devices.get("Bell")!.endpoint.state as unknown as { switch: { rawPosition: number } }).switch.rawPosition === 1
  await BridgeHarness.until(held, 2000, "the button held")
  await host.stop()
  const settled = await Promise.race([press, new Promise(resolve => setTimeout(() => resolve("still waiting"), 1000))])
  assert.notEqual(settled, "still waiting", "the hold ended with the stop")
})
