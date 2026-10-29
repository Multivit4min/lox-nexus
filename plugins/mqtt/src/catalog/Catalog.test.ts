import assert from "node:assert/strict"
import { after, afterEach, before, describe, test } from "node:test"
import type { CatalogNode } from "@lox-nexus/plugin-sdk"
import { TestClock } from "@lox-nexus/plugin-sdk/testing"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { MqttHarness, type MqttHost } from "../test-support/MqttHarness.ts"
import { TopicBrowser } from "./TopicBrowser.ts"

const { until } = MqttHarness

/** the node at a path of labels */
function find(nodes: CatalogNode[] | undefined, ...labels: string[]): CatalogNode | undefined {
  const [first, ...rest] = labels
  const node = nodes?.find(candidate => candidate.label === first)
  return rest.length === 0 ? node : find(node?.children, ...rest)
}

describe("catalog", { timeout: 20_000 }, () => {
  const harness = new MqttHarness()
  before(async () => {
    const broker = await harness.open({ deny: ["denied/#"] })
    await broker.publish("home/kitchen/temp", "21.5", true)
    await broker.publish("home/kitchen/light", "ON", true)
    await broker.publish("home/name", "Haus am See", true)
    await broker.publish("solo", "x", true)
    await broker.publish("z2m/sensor", JSON.stringify({ temperature: 20.5, state: "OFF", ok: true, battery: { level: 90 }, list: [1], "a.b": 1 }), true)
    for (let index = 0; index < 150; index++) await broker.publish(`many/${String(index).padStart(3, "0")}`, String(index), true)
  })
  afterEach(() => harness.cleanup())
  after(() => harness.close())

  /** asks the catalog, moving the clock on until the collection ends */
  async function catalog(host: MqttHost, clock: TestClock, filter: string) {
    const answer = host.catalog()
    await until(() => harness.broker.subscribed.includes(filter), 3000, `the subscription to ${filter}`)
    await until(() => host.plugin.browser.cache.size > 0, 3000, "retained messages")
    await clock.advance(TopicBrowser.COLLECT_MS)
    return answer
  }

  test("browses the broker's topics as a tree of levels, with guessed readers and the last values", async () => {
    const clock = new TestClock()
    const host = await harness.connected({}, { clock })
    const nodes = await catalog(host, clock, "#")
    assert.deepEqual(find(nodes, "home", "kitchen")?.entries, [
      { kind: "sensor", capability: "switch", label: "home/kitchen/light", params: { topic: "home/kitchen/light" }, value: Value.boolean(true) },
      { kind: "sensor", capability: "number", label: "home/kitchen/temp", params: { topic: "home/kitchen/temp" }, value: Value.number(21.5) }
    ])
    assert.deepEqual(find(nodes, "home")?.entries?.map(entry => [entry.capability, entry.value]), [["text", Value.string("Haus am See")]])
    assert.deepEqual(find(nodes, "solo")?.entries?.map(entry => entry.label), ["solo"])
    const sensor = find(nodes, "z2m", "sensor")
    assert.deepEqual(sensor?.entries?.map(entry => [entry.capability, (entry.params as { path?: string }).path, entry.value]), [
      ["text", "", Value.string(JSON.stringify({ temperature: 20.5, state: "OFF", ok: true, battery: { level: 90 }, list: [1], "a.b": 1 }))],
      ["number", "temperature", Value.number(20.5)],
      ["switch", "state", Value.boolean(false)],
      ["switch", "ok", Value.boolean(true)],
      ["number", "battery.level", Value.number(90)]
    ])
    assert.deepEqual(sensor?.entries?.[1]?.params, { topic: "z2m/sensor", read: "json", path: "temperature" })
    const added = await host.addSensor("number", sensor?.entries?.[4]?.params)
    await until(() => host.values(added).length === 1)
    assert.deepEqual(host.values(added), [Value.number(90)], "an entry's params make a working sensor")
  })

  test("subscribes only while browsing: unsubscribed and forgotten a while after the last request", async () => {
    const clock = new TestClock()
    const host = await harness.connected({ browseFilter: "home/#" }, { clock })
    assert.equal(host.plugin.subscriptions.size, 0, "nothing before the first request")
    await catalog(host, clock, "home/#")
    await clock.advance(60_000)
    await host.catalog()
    assert.equal(harness.broker.subscribed.filter(filter => filter === "home/#").length, 1, "a second request within the linger time reuses it")
    assert.match(JSON.stringify(await host.panel()), /subscribed to home\/#/)
    await clock.advance(TopicBrowser.LINGER_MS)
    await until(() => harness.broker.unsubscribed.includes("home/#"), 3000, "the unsubscribe")
    assert.equal(host.plugin.browser.cache.size, 0)
    assert.equal(host.plugin.browser.active, false)
  })

  test("the cache is bounded: the topics heard of longest ago are dropped", async () => {
    const clock = new TestClock()
    const host = await harness.connected({ browseFilter: "many/#", browseLimit: 100 }, { clock })
    const answer = host.catalog()
    await until(() => host.plugin.browser.cache.evicted === 50, 3000, "150 topics")
    await clock.advance(TopicBrowser.COLLECT_MS)
    const entries = find(await answer, "many")?.entries ?? []
    assert.equal(entries.length, 100)
    assert.equal(entries[0]?.label, "many/050")
    assert.match(JSON.stringify(await host.panel()), /"Topics kept","value":"100 of 100"/)
  })

  test("a sensor topic shared with the browse filter keeps its subscription when browsing ends", async () => {
    const clock = new TestClock()
    const host = await harness.connected({ browseFilter: "home/name" }, { clock })
    const name = await host.addSensor("text", { topic: "home/name" })
    await catalog(host, clock, "home/name")
    await clock.advance(TopicBrowser.LINGER_MS)
    assert.equal(harness.broker.unsubscribed.includes("home/name"), false)
    assert.equal(host.plugin.subscriptions.size, 1)
    assert.deepEqual(host.values(name).at(-1), Value.string("Haus am See"))
  })

  test("browsing a refused filter, or without a connection, says why", async () => {
    const clock = new TestClock()
    const host = await harness.connected({ browseFilter: "denied/#" }, { clock })
    await assert.rejects(host.catalog(), /refused the subscription to denied\/#/)
    await harness.broker.close()
    await until(() => !host.plugin.connection.connected)
    await assert.rejects(host.catalog(), /not connected/)
    await harness.restartBroker()
  })
})
