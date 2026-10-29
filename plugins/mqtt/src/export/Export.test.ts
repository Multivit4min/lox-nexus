import assert from "node:assert/strict"
import { after, afterEach, before, describe, test } from "node:test"
import type { WatchedSignal } from "@lox-nexus/plugin-sdk"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { MqttHarness, type MqttHost } from "../test-support/MqttHarness.ts"

const { until } = MqttHarness

const SIGNALS: WatchedSignal[] = [
  { id: "t1", topic: "loxone/home/in/temperature", label: "Living room", valueType: "number", owner: { kind: "miniserver", id: "ms1" } },
  { id: "d1", topic: "loxone/home/in/door", label: "Front door", valueType: "boolean" },
  { id: "s1", topic: "script/x/sensor/mode", label: "Mode", valueType: "string" },
  { id: "l1", topic: "hue/bridge/actuator/kitchen", label: "Kitchen light", valueType: "rgbw" }
]
const rgbw = Value.rgbw({ red: 100, green: 50, blue: 0, white: 10, fadeTime: 1, flags: 0 })

describe("export", { timeout: 20_000 }, () => {
  const harness = new MqttHarness()
  before(() => harness.open())
  afterEach(async () => {
    await harness.cleanup()
    harness.broker.published.length = 0
  })
  after(() => harness.close())

  const last = (topic: string) => harness.broker.on(topic).at(-1)
  const payloads = (topic: string) => harness.broker.on(topic).map(message => message.payload)
  const arrived = (topic: string, count = 1) => until(() => harness.broker.on(topic).length >= count, 3000, `${count} on ${topic}`)

  async function exporting(config: Record<string, unknown> = {}, signals = SIGNALS, store: Record<string, unknown> = {}) {
    const host = await harness.connected(config, { store, slug: "home", instanceId: "inst-1" })
    await host.watchSignals(signals)
    return host
  }

  async function push(host: MqttHost) {
    await host.pushValues([
      { signalId: "t1", value: Value.number(21.5), initial: true },
      { signalId: "d1", value: Value.boolean(true) },
      { signalId: "s1", value: Value.string("eco") },
      { signalId: "l1", value: rgbw },
      { signalId: "t1", value: Value.null() },
      { signalId: "unknown", value: Value.number(1) }
    ])
  }

  test("values are published retained below the base topic: text, and JSON for structured values", async () => {
    const host = await exporting()
    await push(host)
    await arrived("lox-nexus/hue/bridge/actuator/kitchen")
    assert.deepEqual(last("lox-nexus/loxone/home/in/temperature"), { topic: "lox-nexus/loxone/home/in/temperature", payload: "21.5", retain: true, qos: 0, clientId: host.plugin.clientId })
    assert.equal(last("lox-nexus/loxone/home/in/door")?.payload, "true")
    assert.equal(last("lox-nexus/script/x/sensor/mode")?.payload, "eco")
    assert.deepEqual(JSON.parse(last("lox-nexus/hue/bridge/actuator/kitchen")?.payload ?? ""), rgbw.value)
    assert.deepEqual(payloads("lox-nexus/loxone/home/in/temperature"), ["21.5"], "null is skipped")
    const { exporter } = host.plugin
    assert.deepEqual([exporter.stats.published, exporter.stats.skipped], [4, 2])
  })

  test("a custom base topic; wildcard characters in signal topics become _", async () => {
    const host = await exporting({ baseTopic: "nexus/haus" }, [{ id: "x", topic: "a/b+c/#d", label: "X", valueType: "number" }])
    await host.pushValues([{ signalId: "x", value: Value.number(1) }])
    await arrived("nexus/haus/a/b_c/_d")
    assert.equal(last("nexus/haus/a/b_c/_d")?.payload, "1")
  })

  test("online at connect and offline at stop, retained; the broker sends offline as last will when Nexus vanishes", async () => {
    const host = await exporting()
    await arrived("lox-nexus/status")
    assert.deepEqual([last("lox-nexus/status")?.payload, last("lox-nexus/status")?.retain], ["online", true])
    harness.broker.dropClients()
    await until(() => last("lox-nexus/status")?.payload === "offline", 3000, "the last will")
    await until(() => last("lox-nexus/status")?.payload === "online", 5000, "online again after reconnecting")
    await harness.stop(host)
    assert.deepEqual([last("lox-nexus/status")?.payload, last("lox-nexus/status")?.clientId], ["offline", host.plugin.clientId])
  })

  test("without online status nothing is published on the status topic", async () => {
    const host = await exporting({ onlineStatus: false })
    await push(host)
    await harness.stop(host)
    assert.deepEqual(harness.broker.on("lox-nexus/status"), [])
  })

  test("after a reconnect the last values are published again (a broker that lost its retained messages)", async () => {
    const host = await exporting()
    await push(host)
    const broker = await harness.restartBroker()
    await until(() => broker.on("lox-nexus/loxone/home/in/temperature").length === 1, 5000, "the value again")
    assert.equal(broker.on("lox-nexus/script/x/sensor/mode").at(-1)?.payload, "eco")
    await host.pushValues([{ signalId: "t1", value: Value.number(22) }])
    await until(() => broker.on("lox-nexus/loxone/home/in/temperature").at(-1)?.payload === "22", 3000, "the new value")
  })

  test("Home Assistant discovery: a retained config per signal, with availability and the device", async () => {
    const host = await exporting({ discovery: true })
    const temperature = "homeassistant/sensor/lox_nexus_inst-1/t1/config"
    await arrived(temperature)
    assert.equal(last(temperature)?.retain, true)
    assert.deepEqual(JSON.parse(last(temperature)?.payload ?? ""), {
      name: "Living room",
      unique_id: "lox_nexus_inst-1_t1",
      state_topic: "lox-nexus/loxone/home/in/temperature",
      device: { identifiers: ["lox_nexus_inst-1"], name: "Lox Nexus home", manufacturer: "Lox Nexus", model: "MQTT export" },
      origin: { name: "Lox Nexus" },
      availability_topic: "lox-nexus/status",
      payload_available: "online",
      payload_not_available: "offline",
      state_class: "measurement"
    })
    const door = JSON.parse(last("homeassistant/binary_sensor/lox_nexus_inst-1/d1/config")?.payload ?? "{}") as Record<string, unknown>
    assert.deepEqual([door.payload_on, door.payload_off], ["true", "false"])
    const light = JSON.parse(last("homeassistant/sensor/lox_nexus_inst-1/l1/config")?.payload ?? "{}") as Record<string, unknown>
    assert.equal(light.json_attributes_topic, "lox-nexus/hue/bridge/actuator/kitchen")
    assert.equal(light.unit_of_measurement, "%")
    const mode = JSON.parse(last("homeassistant/sensor/lox_nexus_inst-1/s1/config")?.payload ?? "{}") as Record<string, unknown>
    assert.equal(mode.state_class, undefined, "text has no state class")
    assert.match(JSON.stringify(await host.panel()), /on: 4 configs under homeassistant\//)
  })

  test("a signal no longer watched: its config and value are removed (empty retained); renames keep the entity", async () => {
    const host = await exporting({ discovery: true })
    await push(host)
    const config = "homeassistant/binary_sensor/lox_nexus_inst-1/d1/config"
    await arrived(config)
    await host.watchSignals(SIGNALS.filter(signal => signal.id !== "d1").map(signal => (signal.id === "t1" ? { ...signal, label: "Wohnzimmer" } : signal)))
    await until(() => last(config)?.payload === "", 3000, "the config removed")
    await until(() => last("lox-nexus/loxone/home/in/door")?.payload === "", 3000, "the value removed")
    await until(() => harness.broker.on("homeassistant/sensor/lox_nexus_inst-1/t1/config").length === 2, 3000, "the renamed config")
    assert.equal(last(config)?.retain, true)
    const renamed = JSON.parse(last("homeassistant/sensor/lox_nexus_inst-1/t1/config")?.payload ?? "{}") as Record<string, unknown>
    assert.deepEqual([renamed.name, renamed.unique_id], ["Wohnzimmer", "lox_nexus_inst-1_t1"])
    assert.equal(harness.broker.on("homeassistant/sensor/lox_nexus_inst-1/s1/config").length, 1, "unchanged configs aren't sent again")
  })

  test("a signal chosen again after it was dropped is announced again", async () => {
    const host = await exporting({ discovery: true })
    await push(host)
    const config = "homeassistant/binary_sensor/lox_nexus_inst-1/d1/config"
    await arrived(config)
    await host.watchSignals(SIGNALS.filter(signal => signal.id !== "d1"))
    await until(() => last(config)?.payload === "", 3000, "the config removed")
    await host.watchSignals(SIGNALS)
    await until(() => (last(config)?.payload ?? "") !== "", 3000, "the config announced again")
  })

  test("a signal whose topic changes takes its last value to the new topic at once", async () => {
    const host = await exporting()
    await push(host)
    await arrived("lox-nexus/loxone/home/in/door")
    await host.watchSignals(SIGNALS.map(signal => (signal.id === "d1" ? { ...signal, topic: "loxone/house/in/door" } : signal)))
    await until(() => last("lox-nexus/loxone/home/in/door")?.payload === "", 3000, "the old topic cleared")
    await until(() => last("lox-nexus/loxone/house/in/door")?.payload === "true", 3000, "the value on the new topic")
  })

  test("removals survive a restart: turning discovery off removes the configs announced before", async () => {
    const first = await exporting({ discovery: true })
    await arrived("homeassistant/sensor/lox_nexus_inst-1/t1/config")
    await harness.stop(first)
    const store = { ...first.store }
    await exporting({ discovery: false }, SIGNALS, store)
    for (const topic of ["sensor/lox_nexus_inst-1/t1", "binary_sensor/lox_nexus_inst-1/d1", "sensor/lox_nexus_inst-1/s1", "sensor/lox_nexus_inst-1/l1"]) {
      await until(() => last(`homeassistant/${topic}/config`)?.payload === "", 3000, `${topic} removed`)
    }
  })

  test("while disconnected values are kept (the last per signal) and published after the connect", async () => {
    const host = await exporting()
    await harness.broker.close()
    await until(() => !host.plugin.connection.connected)
    await host.pushValues([{ signalId: "t1", value: Value.number(1) }, { signalId: "t1", value: Value.number(2) }])
    const broker = await harness.restartBroker()
    await until(() => broker.on("lox-nexus/loxone/home/in/temperature").length === 1, 5000, "the value")
    assert.deepEqual(broker.on("lox-nexus/loxone/home/in/temperature").map(message => message.payload), ["2"])
  })
})
