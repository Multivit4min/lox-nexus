import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { Value } from "@lox-nexus/plugin-sdk/values"
import type { ClientNode } from "@matter/main"
import { OnOffClient } from "@matter/main/behaviors/on-off"
import { DeviceGroups } from "./config/DeviceGroups.ts"
import type { BridgedDevice } from "./devices/BridgedDevice.ts"
import { MatterBridgePlugin } from "./MatterBridgePlugin.ts"
import { BridgeHarness } from "./test-support/BridgeHarness.ts"
import { FreePort } from "./test-support/FreePort.ts"
import { TestController } from "./test-support/TestController.ts"

const { until, seen } = BridgeHarness
let bridge: BridgeHarness
let peer: ClientNode

before(async () => {
  bridge = await BridgeHarness.start([{ name: "Kitchen", type: "dimmable-light" }])
  peer = await bridge.pair()
})
after(() => bridge.close())

const visible = (name: string) => {
  try {
    TestController.device(peer, name)
    return true
  } catch {
    return false
  }
}
const storedIds = () => (bridge.host.store.devices as { id: string }[]).map(device => device.id)

/** the Add device form's input for a type: its group, and the type as the second choice where the group has several */
function typeInput(type: string) {
  const group = DeviceGroups.all.find(candidate => candidate.types.some(entry => entry.type === type))
  if (!group) return { type }
  return group.choice ? { type: group.id, [group.choice.field]: type } : { type: group.id }
}

/** adds a device through the action and returns its id */
async function add(name: string, type: string, allowUnlock?: boolean) {
  await bridge.host.action("add-device", { name, ...typeInput(type), ...allowUnlock === undefined ? {} : { allowUnlock } })
  return bridge.host.plugin.devices.named(name)!.id
}

test("a device added while paired appears at the controller and works, without a restart", { timeout: 30_000 }, async () => {
  const answer = await bridge.host.action("add-device", { name: "Hall light", ...typeInput("on-off-light") })
  assert.match(answer ?? "", /^Added Hall light \(hall-light-[0-9a-f]{4}\)\. In the Alexa app it may take a minute/)
  const id = bridge.host.plugin.devices.named("Hall light")!.id
  assert.ok(storedIds().includes(id))
  await until(() => visible("Hall light"), 15_000, "the new device at the controller")
  const command = await bridge.host.addSensor("on-off", { device: id })
  await TestController.device(peer, "Hall light").commandsOf(OnOffClient).on()
  await until(() => bridge.last(command) === true, 3000, "a command from the new device")
})

test("names are unique ignoring case; unknown types and devices are refused", async () => {
  const id = await add("Stairs", "plug")
  await assert.rejects(bridge.host.action("add-device", { name: "STAIRS", ...typeInput("plug") }), /already has a device named "Stairs"/)
  await assert.rejects(bridge.host.action("edit-device", { device: id, name: "kitchen" }), /already has a device named "Kitchen"/)
  await assert.rejects(bridge.host.action("add-device", { name: "Fan", type: "ceiling-fan" }))
  await assert.rejects(bridge.host.action("edit-device", { device: "nope", name: "X" }), /no device "nope"/)
})

test("renaming keeps the device: same id and Matter identity, the controller gets the new label, signals keep working", { timeout: 30_000 }, async () => {
  const id = await add("Desk lamp", "on-off-light")
  const command = await bridge.host.addSensor("on-off", { device: id })
  const endpointId = bridge.host.plugin.devices.get(id)!.identity.endpointId
  assert.match(await bridge.host.action("edit-device", { device: id, name: "Reading lamp" }) ?? "", /^Saved Reading lamp\. Alexa may show the old name/)
  await until(() => visible("Reading lamp"), 5000, "the new label at the controller")
  assert.equal(bridge.host.plugin.devices.get(id)!.identity.endpointId, endpointId)
  const catalog = await bridge.host.catalog()
  assert.ok(catalog.some(node => node.label === "Reading lamp (On/off light)" && node.entries?.[0]?.label === "Reading lamp: on/off from controllers"))
  await TestController.device(peer, "Reading lamp").commandsOf(OnOffClient).on()
  await until(() => bridge.last(command) === true, 3000, "the same signal after the rename")
})

test("an edit the endpoint refuses changes nothing", { timeout: 20_000 }, async () => {
  const id = await add("Porch", "plug")
  const device = bridge.host.plugin.devices.get(id) as BridgedDevice & { sync(): Promise<void> }
  const sync = device.sync
  device.sync = async () => {
    throw new Error("the endpoint refused")
  }
  try {
    await assert.rejects(bridge.host.action("edit-device", { device: id, name: "Terrace" }), /the endpoint refused/)
  } finally {
    device.sync = sync
  }
  assert.equal(device.name, "Porch")
  assert.equal((bridge.host.store.devices as { id: string; name: string }[]).find(entry => entry.id === id)?.name, "Porch")
})

test("Allow unlocking: kept by a rename, set with Edit lock, logged as a warning when turned on", { timeout: 20_000 }, async () => {
  const id = await add("Back door", "door-lock", true)
  assert.match(await bridge.host.action("edit-device", { device: id, name: "Garden door" }) ?? "", /^Saved Garden door\./)
  assert.equal(bridge.host.plugin.devices.get(id)!.allowUnlock, true, "a rename keeps it")
  assert.match(await bridge.host.action("edit-lock", { device: id, name: "Garden door", allowUnlock: false }) ?? "", /unlocking from the apps is refused/)
  assert.equal(bridge.host.plugin.devices.get(id)!.allowUnlock, false)
  await bridge.host.action("edit-lock", { device: id, name: "Garden door", allowUnlock: true })
  assert.ok(bridge.host.sent.some(message => message.type === "log" && message.level === "warn" && message.message === `unlocking from the paired apps is now allowed for "Garden door" (${id}), by an action`))
})

test("Edit lock refuses a device that isn't a lock, before changing anything", { timeout: 20_000 }, async () => {
  const id = await add("Hall plug", "plug")
  await assert.rejects(bridge.host.action("edit-lock", { device: id, name: "Hall", allowUnlock: true }), /not a door lock; use Edit device/)
  assert.equal(bridge.host.plugin.devices.get(id)!.name, "Hall plug")
})

test("a device that fails to set up is not left half-added", { timeout: 20_000 }, async () => {
  const { plugin } = bridge.host
  const create = plugin.devices.create.bind(plugin.devices)
  let created: BridgedDevice | undefined
  plugin.devices.create = record => {
    created = create(record)
    created.sync = async () => {
      throw new Error("set-up failed")
    }
    return created
  }
  try {
    await assert.rejects(bridge.host.action("add-device", { name: "Broken", ...typeInput("plug") }), /set-up failed/)
  } finally {
    plugin.devices.create = create
  }
  assert.equal(created?.endpoint.construction.status, "destroyed", "the endpoint was deleted again")
  assert.equal(plugin.devices.named("Broken"), undefined)
  assert.ok(!(bridge.host.store.devices as { name: string }[]).some(device => device.name === "Broken"))
  await add("Broken", "plug")
  await until(() => visible("Broken"), 5000, "the same name added properly")
})

test("removing a device takes it from the controller and fails its signals with the reason", { timeout: 30_000 }, async () => {
  const id = await add("Attic light", "on-off-light")
  await until(() => visible("Attic light"), 5000, "added")
  await bridge.host.addSensor("on-off", { device: id })
  const state = await bridge.host.addActuator("on-off", { device: id })
  assert.match(await bridge.host.action("remove-device", { device: id }) ?? "", /^Removed Attic light\./)
  await until(() => !visible("Attic light"), 15_000, "the device gone at the controller")
  assert.ok(!storedIds().includes(id))
  const errors = bridge.host.sent.flatMap(message => message.type === "signal.error" ? [message.error] : [])
  assert.ok(errors.includes(`the bridge has no device "${id}" (any more); add it with Add device, or pick another`))
  await assert.rejects(bridge.host.actuate(state, Value.boolean(true)), /the bridge has no device/)
  assert.equal(seen(peer, "Kitchen").onOff?.onOff, false, "the others stay")
})

test("a renamed device keeps its new label across a restart (matter.js stored the old one)", { timeout: 30_000 }, async () => {
  const id = await add("Cellar", "plug")
  await bridge.host.action("edit-device", { device: id, name: "Wine cellar" })
  await bridge.restart()
  assert.equal(bridge.state(id).bridgedDeviceBasicInformation?.nodeLabel, "Wine cellar")
  await until(() => visible("Wine cellar"), 5000, "the label at the controller")
})

test("at most 50 devices, Alexa's limit for one bridge", { timeout: 30_000 }, async () => {
  const devices = Array.from({ length: 50 }, (_, index) => ({ name: `Light ${index}`, type: "on-off-light" }))
  const host = await PluginTestHost.start(MatterBridgePlugin, { config: { port: await FreePort.udp() }, store: BridgeHarness.store(devices) })
  try {
    await assert.rejects(host.action("add-device", { name: "One more", ...typeInput("plug") }), /has 50 devices, Alexa's limit/)
    const table = BridgeHarness.section(await host.panel(), "Devices")
    assert.ok(table.type === "table" && table.rows.length === 50)
  } finally {
    await host.stop()
  }
})

test("open pages are told about added, edited and removed devices and new states", { timeout: 30_000 }, async () => {
  const devices = [{ name: "Lamp", type: "on-off-light" }]
  const host = await PluginTestHost.start(MatterBridgePlugin, { config: { port: await FreePort.udp() }, store: BridgeHarness.store(devices) })
  try {
    // counted where the plugin calls it, before the SDK's one-a-second throttle
    let pushes = 0
    host.plugin.panelChanged = () => void pushes++
    const pushed = async (work: () => Promise<unknown>, what: string) => {
      const before = pushes
      await work()
      assert.ok(pushes > before, what)
    }
    const lamp = host.plugin.devices.all()[0]!.id
    await pushed(async () => host.actuate(await host.addActuator("on-off", { device: lamp }), Value.boolean(true)), "a state from Nexus")
    await pushed(() => host.action("add-device", { name: "Plug", ...typeInput("plug") }), "an added device")
    await pushed(() => host.action("edit-device", { device: lamp, name: "Desk lamp" }), "an edited device")
    await pushed(() => host.action("remove-device", { device: lamp }), "a removed device")
  } finally {
    await host.stop()
  }
})
