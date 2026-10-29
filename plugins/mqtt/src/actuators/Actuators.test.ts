import assert from "node:assert/strict"
import { after, afterEach, before, describe, test } from "node:test"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { MqttHarness } from "../test-support/MqttHarness.ts"

const { until } = MqttHarness

describe("actuators", { timeout: 20_000 }, () => {
  const harness = new MqttHarness()
  before(() => harness.open())
  afterEach(() => harness.cleanup())
  after(() => harness.close())

  /** actuates and waits until the broker saw the message; returns it */
  async function publish(host: Awaited<ReturnType<typeof harness.connected>>, id: string, topic: string, value: Value) {
    const before = harness.broker.on(topic).length
    await host.actuate(id, value)
    await until(() => harness.broker.on(topic).length > before, 3000, `a message on ${topic}`)
    return harness.broker.on(topic).at(-1)
  }

  const rgbw = Value.rgbw({ red: 100, green: 50, blue: 0, white: 10, fadeTime: 1, flags: 0 })

  test("text: plain values as text, structured values as their JSON object", async () => {
    const host = await harness.connected()
    const text = await host.addActuator("text", { topic: "out/text" })
    const payload = async (value: Value) => (await publish(host, text, "out/text", value))?.payload
    assert.equal(await payload(Value.string("Hallo")), "Hallo")
    assert.equal(await payload(Value.number(21.5)), "21.5")
    assert.equal(await payload(Value.boolean(true)), "true")
    assert.equal(await payload(rgbw), "{\"red\":100,\"green\":50,\"blue\":0,\"white\":10,\"fadeTime\":1,\"flags\":0}")
    assert.equal(await payload(Value.singleChannel({ channel: 50, fadeTime: 0.2 })), "{\"channel\":50,\"fadeTime\":0.2}")
    assert.equal(await payload(Value.tunableWhite({ temperature: 2700, brightness: 80, fadeTime: 0 })), "{\"temperature\":2700,\"brightness\":80,\"fadeTime\":0}")
  })

  test("number: values are converted to a number first", async () => {
    const host = await harness.connected()
    const number = await host.addActuator("number", { topic: "out/number" })
    assert.equal((await publish(host, number, "out/number", Value.number(-3.25)))?.payload, "-3.25")
    assert.equal((await publish(host, number, "out/number", Value.boolean(true)))?.payload, "1")
  })

  test("switch: ON/OFF by default, or the configured words", async () => {
    const host = await harness.connected()
    const plug = await host.addActuator("switch", { topic: "plug/set" })
    assert.equal((await publish(host, plug, "plug/set", Value.boolean(true)))?.payload, "ON")
    assert.equal((await publish(host, plug, "plug/set", Value.boolean(false)))?.payload, "OFF")
    assert.equal((await publish(host, plug, "plug/set", Value.number(0)))?.payload, "OFF")
    const words = await host.addActuator("switch", { topic: "relay", on: "1", off: "0" })
    assert.equal((await publish(host, words, "relay", Value.boolean(true)))?.payload, "1")
  })

  test("json: the whole value with its type", async () => {
    const host = await harness.connected()
    const json = await host.addActuator("json", { topic: "out/json" })
    assert.equal((await publish(host, json, "out/json", Value.number(3)))?.payload, "{\"type\":\"number\",\"value\":3}")
    assert.deepEqual(JSON.parse((await publish(host, json, "out/json", rgbw))?.payload ?? ""), rgbw)
    assert.equal((await publish(host, json, "out/json", Value.null()))?.payload, "{\"type\":\"null\"}")
  })

  test("retain and QoS are passed to the broker", async () => {
    const host = await harness.connected()
    const plain = await host.addActuator("text", { topic: "q/0" })
    const retained = await host.addActuator("text", { topic: "q/1", retain: true, qos: "1" })
    const exactly = await host.addActuator("text", { topic: "q/2", qos: "2" })
    assert.deepEqual(await publish(host, plain, "q/0", Value.string("a")), { topic: "q/0", payload: "a", retain: false, qos: 0, clientId: host.plugin.clientId })
    const one = await publish(host, retained, "q/1", Value.string("b"))
    assert.deepEqual([one?.retain, one?.qos], [true, 1])
    assert.equal((await publish(host, exactly, "q/2", Value.string("c")))?.qos, 2)
    await assert.rejects(host.addActuator("text", { topic: "q", qos: "3" }))
    await assert.rejects(host.addActuator("text", { topic: "q/#" }), /no wildcards/)
  })

  test("a retained command is read back by a sensor on the same topic", async () => {
    const host = await harness.connected()
    const out = await host.addActuator("number", { topic: "loop/value", retain: true })
    await publish(host, out, "loop/value", Value.number(7))
    const sensor = await host.addSensor("number", { topic: "loop/value" })
    await until(() => host.values(sensor).length === 1)
    assert.deepEqual(host.values(sensor), [Value.number(7)])
  })
})
