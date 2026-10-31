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

const pairingPart = async () => BridgeHarness.section(await bridge.host.panel(), "Pairing")
const titles = async () => {
  const panel = await bridge.host.panel()
  return panel?.type === "sections" ? panel.sections.map(section => section.title) : []
}

test("a controller pairs with the code from the panel; matter.js sees no file system; nothing is shown before Nexus sends it", { timeout: 30_000 }, async () => {
  assert.equal(bridge.host.plugin.matter.hasFilesystem, false)
  const pairing = bridge.host.plugin.bridge.pairing()
  assert.ok(pairing && !pairing.commissioned && pairing.window === "basic")
  manualCode = pairing.manualCode
  const notice = await pairingPart()
  assert.ok(notice.type === "notice")
  assert.deepEqual([notice.tone, notice.title], ["warn", "Not paired yet"])
  const code = `${manualCode.slice(0, 4)}-${manualCode.slice(4, 7)}-${manualCode.slice(7)}`
  assert.deepEqual(BridgeHarness.section(await bridge.host.panel(), "Pairing code"), { type: "qr", data: pairing.qrCode, caption: `Manual pairing code ${code}` })
  const pushes = bridge.host.sent.filter(message => message.type === "panel.changed").length

  const started = performance.now()
  peer = await bridge.pair()
  assert.ok(performance.now() - started < 10_000, "pairs within 10 s")
  await until(() => bridge.host.sent.filter(message => message.type === "panel.changed").length > pushes, 3000, "the page told about the pairing")
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
  const paired = { label: "Paired", value: { text: "yes", tone: "ok" } }
  assert.deepEqual(await pairingPart(), { type: "keyValue", items: [paired, { label: "Pairing window", value: { text: "closed; Open pairing window to add another app", tone: "muted" } }] })
  assert.ok(!(await titles()).includes("Pairing code"), "no code while paired and closed")
  const table = BridgeHarness.section(await bridge.host.panel(), "Controllers")
  assert.ok(table.type === "table")
  assert.deepEqual(table.rows, [["matter.js", "0xFFF1", String(fabricIndex)]])
  assert.deepEqual(table.rowActions, [[{ action: "remove-pairing", label: "Remove", input: { fabricIndex } }]])

  const answer = await bridge.host.actionAnswer("open-pairing-window")
  assert.ok(typeof answer === "object" && answer.panel?.type === "qr", "the answer carries the QR code")
  assert.match(answer.message ?? "", /15 minutes.*\d{4}-\d{3}-\d{4}/)
  const window = await pairingPart()
  assert.ok(window.type === "keyValue")
  const until15 = window.items[1]!.value
  assert.ok(typeof until15 === "object" && until15.tone === "warn" && until15.until !== undefined)
  assert.ok(Math.abs(until15.until - Date.now() - 15 * 60_000) < 5000, "counts down the 15 minutes")
  assert.ok((await titles()).includes("Pairing code"))
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
  const plugin = bridge.host.plugin
  const push = plugin.panelChanged
  let pushes = 0
  plugin.panelChanged = () => void pushes++
  const window = await peer.openEnhancedCommissioningWindow()
  plugin.panelChanged = push
  assert.ok(pushes > 0, "open pages are told the app opened a window")
  assert.equal(bridge.host.plugin.bridge.pairing()?.window, "enhanced")
  assert.deepEqual(await pairingPart(), { type: "keyValue", items: [{ label: "Paired", value: { text: "yes", tone: "ok" } }, { label: "Pairing window", value: { text: "opened by a paired app to share the bridge; use the code that app shows", tone: "info" } }] })
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
