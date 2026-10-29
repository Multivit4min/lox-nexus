import assert from "node:assert/strict"
import { after, afterEach, before, describe, test } from "node:test"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { MqttHarness } from "../test-support/MqttHarness.ts"

const { until, signalStates } = MqttHarness

describe("sensors", { timeout: 20_000 }, () => {
  const harness = new MqttHarness()
  before(() => harness.open({ deny: ["secret/topic"] }))
  afterEach(() => harness.cleanup())
  after(() => harness.close())

  /** waits until the broker saw the plugin subscribe to a topic */
  const subscribed = (topic: string) => until(() => harness.broker.subscribed.includes(topic), 3000, `subscription to ${topic}`)

  test("number: plain text, decimal comma, JSON numbers and booleans", async () => {
    const host = await harness.connected()
    const temp = await host.addSensor("number", { topic: "home/temp" })
    await subscribed("home/temp")
    for (const [payload, expected] of [["21.5", 21.5], [" -3 ", -3], ["12,25", 12.25], ["1e3", 1000]] as const) {
      const next = host.next(temp)
      await harness.broker.publish("home/temp", payload)
      assert.deepEqual(await next, Value.number(expected), payload)
    }
    const json = await host.addSensor("number", { topic: "home/json", read: "json", path: "state.values[1]" })
    await subscribed("home/json")
    const next = host.next(json)
    await harness.broker.publish("home/json", JSON.stringify({ state: { values: [1, true] } }))
    assert.deepEqual(await next, Value.number(1))
  })

  test("switch: on/off words in any case, JSON booleans and numbers", async () => {
    const host = await harness.connected()
    const plug = await host.addSensor("switch", { topic: "plug/state" })
    await subscribed("plug/state")
    for (const [payload, expected] of [["ON", true], ["off", false], [" True ", true], ["0", false], ["open", true], ["Closed", false]] as const) {
      const next = host.next(plug)
      await harness.broker.publish("plug/state", payload)
      assert.deepEqual(await next, Value.boolean(expected), payload)
    }
    const json = await host.addSensor("switch", { topic: "z2m/plug", read: "json", path: "state" })
    await subscribed("z2m/plug")
    const next = host.next(json)
    await harness.broker.publish("z2m/plug", "{\"state\":\"ON\",\"power\":3}")
    assert.deepEqual(await next, Value.boolean(true))
  })

  test("text: the payload as it is; from JSON, objects become their JSON", async () => {
    const host = await harness.connected()
    const text = await host.addSensor("text", { topic: "msg" })
    const part = await host.addSensor("text", { topic: "doc", read: "json", path: "a" })
    const whole = await host.addSensor("text", { topic: "doc", read: "json" })
    await subscribed("msg")
    await subscribed("doc")
    const next = host.next(text)
    await harness.broker.publish("msg", "  Hallo Welt ")
    assert.deepEqual(await next, Value.string("  Hallo Welt "))
    const nextPart = host.next(part)
    await harness.broker.publish("doc", "{\"a\":{\"b\":[1,2]}}")
    assert.deepEqual(await nextPart, Value.string("{\"b\":[1,2]}"))
    await until(() => host.values(whole).length === 1)
    assert.deepEqual(host.values(whole), [Value.string("{\"a\":{\"b\":[1,2]}}")], "a JSON object as a whole is its text")
  })

  test("an unreadable payload is a signal error, not a value, until the next good one", async () => {
    const host = await harness.connected()
    const temp = await host.addSensor("number", { topic: "bad/temp", read: "json", path: "t" })
    await subscribed("bad/temp")
    await harness.broker.publish("bad/temp", "{\"t\":20}")
    await until(() => host.values(temp).length === 1)
    await harness.broker.publish("bad/temp", "not json")
    await until(() => signalStates(host, temp).length === 1)
    await harness.broker.publish("bad/temp", "not json")
    await harness.broker.publish("bad/temp", "{\"x\":1}")
    await harness.broker.publish("bad/temp", "{\"t\":\"warm\"}")
    await until(() => signalStates(host, temp).length === 3)
    const next = host.next(temp)
    await harness.broker.publish("bad/temp", "{\"t\":21}")
    assert.deepEqual(await next, Value.number(21))
    assert.deepEqual(host.values(temp), [Value.number(20), Value.number(21)], "nothing made up in between")
    assert.deepEqual(signalStates(host, temp), [
      "error: the payload is not valid JSON",
      "error: JSON path \"t\" not found",
      "error: JSON t: \"warm\" is not a number"
    ], "the same problem twice is reported once")
  })

  test("a retained value arrives on subscribe, also for a second signal on a subscribed topic", async () => {
    await harness.broker.publish("retained/temp", "19.5", true)
    const host = await harness.connected()
    const first = await host.addSensor("number", { topic: "retained/temp" })
    await until(() => host.values(first).length === 1, 3000, "the retained value")
    const second = await host.addSensor("text", { topic: "retained/temp" })
    assert.deepEqual(host.values(second), [Value.string("19.5")], "from the router's last message, at once")
    assert.equal(harness.broker.subscribed.filter(topic => topic === "retained/temp").length, 1, "one subscription for both")
  })

  test("the topic is unsubscribed when the last signal using it goes", async () => {
    const host = await harness.connected()
    const a = await host.addSensor("number", { topic: "shared/t" })
    const b = await host.addSensor("text", { topic: "shared/t" })
    await subscribed("shared/t")
    await host.remove(a)
    assert.equal(host.plugin.router.topics, 1)
    await host.remove(b)
    await until(() => harness.broker.unsubscribed.includes("shared/t"), 3000, "the unsubscribe")
    assert.equal(host.plugin.router.topics, 0)
    assert.equal(host.plugin.subscriptions.size, 0)
  })

  test("a subscription the broker refuses is a signal error", async () => {
    const host = await harness.connected()
    const secret = await host.addSensor("text", { topic: "secret/topic" })
    await until(() => signalStates(host, secret).length === 1)
    assert.match(signalStates(host, secret)[0] ?? "", /refused the subscription/)
  })

  test("params: exact topics only, and a valid JSON path", async () => {
    const host = await harness.connected()
    await assert.rejects(host.addSensor("number", { topic: "home/+/temp" }), /no wildcards/)
    await assert.rejects(host.addSensor("number", { topic: "home/#" }), /no wildcards/)
    await assert.rejects(host.addSensor("number", { topic: "" }), /empty/)
    await assert.rejects(host.addSensor("number", { topic: "a", read: "json", path: "a..b" }), /can't read the path/)
    await assert.rejects(host.addSensor("number", { topic: "a", read: "json", path: "__proto__" }), /isn't allowed/)
    await host.addSensor("number", { topic: "$SYS/broker/uptime" })
  })
})
