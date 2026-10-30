import assert from "node:assert/strict"
import { readdir } from "node:fs/promises"
import { after, before, test } from "node:test"
import { Value } from "@lox-nexus/plugin-sdk/values"
import type { ClientNode } from "@matter/main"
import { OnOffClient } from "@matter/main/behaviors/on-off"
import { BridgeHarness } from "./test-support/BridgeHarness.ts"
import { TestController } from "./test-support/TestController.ts"

const { until, seen } = BridgeHarness
let bridge: BridgeHarness
let peer: ClientNode
let manualCode: string
let fabricIndex: number
let onOff: string

before(async () => {
  bridge = await BridgeHarness.start([
    { name: "Kitchen", type: "dimmable-light" },
    { name: "Door", type: "contact-sensor" },
    { name: "Living room", type: "temperature-sensor" }
  ])
})
after(() => bridge.close())

const pairingPart = async () => {
  const panel = await bridge.host.panel()
  assert.ok(panel?.type === "sections")
  return panel.sections[0]!.panel
}

test("a controller pairs with the code from the panel; matter.js sees no file system; nothing is shown before Nexus sends it", { timeout: 30_000 }, async () => {
  assert.equal(bridge.host.plugin.matter.hasFilesystem, false)
  const pairing = bridge.host.plugin.bridge.pairing()
  assert.ok(pairing && !pairing.commissioned && pairing.window === "basic")
  manualCode = pairing.manualCode
  assert.deepEqual(await pairingPart(), { type: "qr", data: pairing.qrCode, caption: `Manual pairing code ${manualCode.slice(0, 4)}-${manualCode.slice(4, 7)}-${manualCode.slice(7)}. Scan this in the Alexa, Google Home, Apple Home or Home Assistant app` })

  const started = performance.now()
  peer = await bridge.pair()
  assert.ok(performance.now() - started < 10_000, "pairs within 10 s")
  assert.equal(seen(peer, "Living room").temperatureMeasurement?.measuredValue, null, "no temperature until Nexus sends one")
  assert.equal(seen(peer, "Door").booleanState?.stateValue, true, "a contact starts closed")
  assert.equal(seen(peer, "Kitchen").onOff?.onOff, false, "a light starts off")
  // the file path would have put the bridge's data next to the controller's (storage.path)
  assert.deepEqual((await readdir(bridge.controller.directory)).filter(name => name.startsWith("bridge")), [])
})

test("states from Nexus reach the controller and don't come back as commands", { timeout: 20_000 }, async () => {
  onOff = await bridge.host.addSensor("on-off", { device: "Kitchen" })
  const { host } = bridge
  await host.actuate(await host.addActuator("on-off", { device: "Kitchen" }), Value.boolean(true))
  await host.actuate(await host.addActuator("contact", { device: "Door" }), Value.boolean(true))
  await host.actuate(await host.addActuator("temperature", { device: "Living room" }), Value.number(21.5))
  await until(() => seen(peer, "Kitchen").onOff?.onOff === true, 5000, "the light on at the controller")
  await until(() => seen(peer, "Door").booleanState?.stateValue === false, 5000, "the door open (contact not closed)")
  await until(() => seen(peer, "Living room").temperatureMeasurement?.measuredValue === 2150, 5000, "21.5 °C")
  assert.deepEqual(host.values(onOff), [], "no echo of the state as a command")
})

test("the panel lists the controller with a Remove button; a pairing window shows the QR code again", { timeout: 20_000 }, async () => {
  const controllers = bridge.host.plugin.bridge.controllers()
  assert.equal(controllers.length, 1)
  fabricIndex = controllers[0]!.fabricIndex
  assert.deepEqual(await pairingPart(), { type: "keyValue", items: [{ label: "Paired", value: "yes" }, { label: "Pairing window", value: "closed; Open pairing window to add another app" }] })
  const panel = await bridge.host.panel()
  assert.ok(panel?.type === "sections")
  const table = panel.sections[1]!.panel
  assert.ok(table.type === "table")
  assert.deepEqual(table.rows, [["matter.js", "0xFFF1", String(fabricIndex)]])
  assert.deepEqual(table.rowActions, [[{ action: "remove-pairing", label: "Remove", input: { fabricIndex } }]])

  assert.match(await bridge.host.action("open-pairing-window") ?? "", /15 minutes.*\d{4}-\d{3}-\d{4}/)
  const qr = await pairingPart()
  assert.ok(qr.type === "qr")
  assert.match(qr.caption ?? "", /Open until \d\d:\d\d:\d\d for another app/)
})

test("a second app pairs through the window, and removing it leaves the first one paired", { timeout: 30_000 }, async () => {
  const second = await TestController.start()
  try {
    const other = await second.pair(manualCode)
    await until(() => bridge.host.plugin.bridge.controllers().length === 2, 5000, "two controllers")
    await TestController.device(other, "Kitchen").commandsOf(OnOffClient).off()
    await until(() => bridge.last(onOff) === false, 3000, "a command from the second app")
    const index = bridge.host.plugin.bridge.controllers().find(controller => controller.fabricIndex !== fabricIndex)!.fabricIndex
    // a fabric without a label is named after its vendor (0xFFF1, the test vendor)
    assert.equal(await bridge.host.action("remove-pairing", { fabricIndex: index }), `Removed Test controller (fabric ${index}). Its app no longer reaches the bridge's devices`)
    await until(() => bridge.host.plugin.bridge.controllers().length === 1, 5000, "one controller left")
  } finally {
    await second.close()
  }
})

test("while a controller shares the bridge (enhanced window), the panel points to that app's code instead of the bridge's", { timeout: 30_000 }, async () => {
  const window = await peer.openEnhancedCommissioningWindow()
  assert.equal(bridge.host.plugin.bridge.pairing()?.window, "enhanced")
  assert.deepEqual(await pairingPart(), { type: "keyValue", items: [{ label: "Paired", value: "yes" }, { label: "Pairing window", value: "opened by a paired app to share the bridge; use the code that app shows" }] })
  await assert.rejects(bridge.host.action("open-pairing-window"), /a controller has opened a pairing window/)
  const third = await TestController.start()
  try {
    await third.pair(window.manualPairingCode)
    await until(() => bridge.host.plugin.bridge.controllers().length === 2, 5000, "the shared app paired")
    await until(() => bridge.host.plugin.bridge.pairing()?.window === "closed", 5000, "the window closed")
    const index = bridge.host.plugin.bridge.controllers().find(controller => controller.fabricIndex !== fabricIndex)!.fabricIndex
    await bridge.host.action("remove-pairing", { fabricIndex: index })
  } finally {
    await third.close()
  }
})

test("the pairing survives a restart: matter.js keeps its keys in the plugin store", { timeout: 30_000 }, async () => {
  assert.ok(Object.keys(bridge.host.store).some(key => key.startsWith("matter:bridge/")))
  await bridge.restart()
  assert.equal(bridge.host.plugin.bridge.pairing()?.commissioned, true)
  onOff = await bridge.host.addSensor("on-off", { device: "Kitchen" })
  assert.equal(seen(peer, "Kitchen").onOff?.onOff, false, "on/off is non-volatile in Matter: matter.js restored it")
  assert.equal(bridge.state("Living room").temperatureMeasurement?.measuredValue, 2150, "the temperature Nexus sent is kept too")
  await TestController.device(peer, "Kitchen").commandsOf(OnOffClient).on()
  await until(() => bridge.last(onOff) === true, 15_000, "a command after the restart")
  await bridge.host.actuate(await bridge.host.addActuator("on-off", { device: "Kitchen" }), Value.boolean(true))
})

test("removing the last pairing resets the bridge: it keeps its code and the states Nexus sent, and pairs again", { timeout: 40_000 }, async () => {
  const { host } = bridge
  const removed = await host.action("remove-pairing", { fabricIndex })
  assert.equal(removed, "Removed matter.js (fabric 1). No controller is left: the bridge resets and waits to be paired again")
  // the reset (some 60 ms) completes between two requests, so the next one finds the bridge back
  assert.match(await host.action("open-pairing-window") ?? "", /^The bridge is not paired yet/)
  await until(() => host.plugin.bridge.pairing()?.commissioned === false, 10_000, "the bridge waiting to be paired again")
  assert.equal(host.plugin.bridge.pairing()?.manualCode, manualCode)
  await assert.rejects(host.action("remove-pairing", { fabricIndex }), /no paired controller with fabric index 1/)
  // the reset wipes what matter.js stored (on/off among it); the bridge sets Nexus's states again
  await until(() => bridge.state("Kitchen").onOff?.onOff === true, 3000, "the light still on after the reset")
  assert.equal(bridge.state("Door").booleanState?.stateValue, false, "the door still open")
  assert.equal(bridge.state("Living room").temperatureMeasurement?.measuredValue, 2150)

  const again = await bridge.pair()
  const count = host.values(onOff).length
  await TestController.device(again, "Kitchen").commandsOf(OnOffClient).off()
  await until(() => host.values(onOff).length > count && bridge.last(onOff) === false, 5000, "a command after pairing again")
  assert.ok(host.sent.some(message => message.type === "log" && /^controller .*\(fabric 1\): added$/.test(message.message)))
})

test("matter.js logs reach the instance log, without the pairing code or the ASCII-art QR code", () => {
  const lines = bridge.host.sent.flatMap(message => message.type === "log" ? [message.message] : [])
  assert.ok(lines.some(line => line.startsWith("matter.js: ")))
  for (const line of lines) {
    assert.ok(!line.includes(manualCode), `the pairing code is not logged: ${line}`)
    assert.ok(!/[█▀▄]/.test(line), "no QR art")
  }
})
