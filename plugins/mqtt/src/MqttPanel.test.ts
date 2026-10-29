import assert from "node:assert/strict"
import { after, afterEach, before, test } from "node:test"
import type { Panel } from "@lox-nexus/plugin-sdk"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { MqttHarness } from "./test-support/MqttHarness.ts"

const { until } = MqttHarness

/** label → value of every keyValue section */
function facts(panel: Panel | undefined) {
  const items = panel?.type === "sections" ? panel.sections.flatMap(section => (section.panel.type === "keyValue" ? section.panel.items : [])) : []
  return Object.fromEntries(items.map(item => [item.label, item.value]))
}

const harness = new MqttHarness()
before(() => harness.open({ credentials: { username: "nexus", password: "pw-123456" } }))
afterEach(() => harness.cleanup())
after(() => harness.close())

test("the panel: connection, counters and export, without the password", async () => {
  const host = await harness.connected({ username: "nexus", password: "pw-123456", clientId: "panel-client", baseTopic: "nx" })
  const temp = await host.addSensor("number", { topic: "p/t" })
  const out = await host.addActuator("text", { topic: "p/o" })
  await until(() => harness.broker.subscribed.includes("p/t"))
  await harness.broker.publish("p/t", "1")
  await until(() => host.values(temp).length === 1)
  await host.actuate(out, Value.string("x"))
  await host.watchSignals([{ id: "a", topic: "x/y", label: "A", valueType: "number" }])
  await host.pushValues([{ signalId: "a", value: Value.number(1) }])
  const panel = await host.panel()
  const shown = facts(panel)
  assert.match(shown.State ?? "", /^connected since \d{4}-/)
  assert.equal(shown.Broker, `mqtt://127.0.0.1:${harness.broker.port}`)
  assert.equal(shown["Client ID"], "panel-client")
  assert.equal(shown.User, "nexus")
  assert.equal(shown["Last error"], "none")
  assert.equal(shown["Messages received"], "1")
  assert.equal(shown["Messages published"], "3 (failed 0)", "the online status, the command and the export")
  assert.equal(shown.Subscriptions, "1 (topics read by sensors: 1)")
  assert.equal(shown["Watched signals"], "1")
  assert.equal(shown["Published to"], "nx/<signal topic>")
  assert.equal(shown["Home Assistant discovery"], "off")
  assert.equal(shown["Values published"], "1")
  assert.doesNotMatch(JSON.stringify(panel), /pw-123456/)
})
