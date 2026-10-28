import assert from "node:assert/strict"
import { after, before, describe, test } from "node:test"
import type { BridgeResultDto, LoxoneSignalDto, MiniserverDto, PluginInstanceDto, PluginSignalDto, WireDto } from "@lox-nexus/api"
import { CounterPlugin, FakePluginTransport } from "@lox-nexus/core/testing"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { Value } from "@lox-nexus/plugin-sdk/values"
import type { ApiClient } from "../../test-support/ApiClient.ts"
import { TestApp } from "../../test-support/TestApp.ts"

/** waits for queued fake-worker messages (microtasks and immediates) to be handled */
const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve))
}

const sensor = (label: string, start = 1) => ({ type: "new", signal: { kind: "sensor", capability: "value", params: { start }, label } })

describe("POST /api/plugin-instances/:id/bridge", { timeout: 10_000 }, () => {
  let app: TestApp
  let admin: ApiClient
  let instance: PluginInstanceDto
  let miniserver: MiniserverDto
  const bridge = (items: unknown[], miniserverId = miniserver.id) => admin.post(`/api/plugin-instances/${instance.id}/bridge`, { miniserverId, items })
  const ok = (result: BridgeResultDto | undefined) => {
    assert.ok(result?.ok, JSON.stringify(result))
    return result
  }
  const counts = async () => [
    (await admin.get(`/api/plugin-instances/${instance.id}/signals`)).json<PluginSignalDto[]>().length,
    (await admin.get(`/api/miniservers/${miniserver.id}/signals`)).json<LoxoneSignalDto[]>().length,
    (await admin.get("/api/wires")).json<WireDto[]>().length
  ]

  before(async () => {
    const description = await PluginTestHost.describe(CounterPlugin)
    const pluginTransport = new FakePluginTransport().add("counter.ts", CounterPlugin)
    app = await TestApp.start({ pluginTransport }, {}, nexus =>
      nexus.pluginCatalog.setDevelopment({ pkg: { id: "counter", name: "Counter", entry: "counter.ts", description }, version: "1.0.0" }))
    admin = await app.admin()
    instance = (await admin.post("/api/plugin-instances", { plugin: "counter", slug: "home", label: "Home" })).json<PluginInstanceDto>()
    miniserver = (await admin.post("/api/miniservers", {
      slug: "haus", label: "Haus", host: "127.0.0.1", port: 1, listenPort: 2, ownId: "nexus", remoteId: "ms", enabled: false
    })).json<MiniserverDto>()
  })
  after(() => app.dispose())

  test("a new sensor becomes a Loxone output and an actuator a Loxone input, each wired", async () => {
    const response = await bridge([
      { plugin: sensor("Temperature", 21), loxone: { packetId: "temp", dataType: 1 } },
      { plugin: { type: "new", signal: { kind: "actuator", capability: "set", label: "Target" } }, loxone: { packetId: "target", dataType: 1, label: "Soll" } }
    ])
    assert.equal(response.statusCode, 200, response.body)
    const [temp, target] = response.json<BridgeResultDto[]>().map(ok)
    assert.deepEqual([temp!.loxone.direction, temp!.loxone.label, temp!.loxone.topic], ["out", "Temperature", "loxone/haus/out/temperature"])
    assert.deepEqual([temp!.wire.sourceId, temp!.wire.targetId, temp!.wire.label], [temp!.signal.id, temp!.loxone.id, "Temperature → Temperature"])
    assert.deepEqual([target!.loxone.direction, target!.loxone.topic], ["in", "loxone/haus/in/soll"])
    assert.deepEqual([target!.wire.sourceId, target!.wire.targetId], [target!.loxone.id, target!.signal.id])
    await settle()
    assert.deepEqual(app.app.bus.current("loxone/haus/out/temperature")?.value, Value.number(21))
  })

  test("an existing sensor's current value goes to the Miniserver right away", async () => {
    const existing = (await admin.post(`/api/plugin-instances/${instance.id}/signals`, { kind: "sensor", capability: "value", params: { start: 7 }, label: "Level" }))
      .json<PluginSignalDto>()
    await settle()
    const [result] = (await bridge([{ plugin: { type: "existing", signalId: existing.id }, loxone: { packetId: "level", dataType: 1 } }])).json<BridgeResultDto[]>()
    const connected = ok(result)!
    assert.equal(connected.signal.id, existing.id)
    // no settle: the wire delivered the value the sensor already had
    assert.deepEqual(app.app.bus.current(connected.loxone.topic)?.value, Value.number(7))
  })

  test("an actuator gets no command when it is connected; the Miniserver's first value sends one", async () => {
    const [result] = (await bridge([{ plugin: { type: "new", signal: { kind: "actuator", capability: "set", label: "Quiet" } }, loxone: { packetId: "quiet", dataType: 1 } }]))
      .json<BridgeResultDto[]>()
    const { signal, loxone } = ok(result)!
    await settle()
    assert.deepEqual(app.app.recorder.recent(100, signal.topic), [])
    app.app.bus.publish(loxone.topic, Value.number(3), { source: { kind: "loxone", id: miniserver.id } })
    assert.deepEqual(app.app.recorder.recent(100, signal.topic).map(m => [m.kind, m.value]), [["command", Value.number(3)]])
  })

  test("names at their limits still make a wire label", async () => {
    const long = "x".repeat(100)
    const [result] = (await bridge([{ plugin: sensor(long), loxone: { packetId: "long", dataType: 1, label: "y".repeat(100) } }])).json<BridgeResultDto[]>()
    assert.equal(ok(result)!.wire.label.length, 200)
  })

  test("same names get free topic names on both sides", async () => {
    const results = (await bridge([
      { plugin: sensor("Power"), loxone: { packetId: "p1", dataType: 1 } },
      { plugin: sensor("Power"), loxone: { packetId: "p2", dataType: 1 } }
    ])).json<BridgeResultDto[]>().map(ok)
    assert.deepEqual(results.map(r => [r!.signal.slug, r!.loxone.topic]), [["power", "loxone/haus/out/power"], ["power-2", "loxone/haus/out/power-2"]])
  })

  test("a failed item is undone completely; the others are kept", async () => {
    const before = await counts()
    const results = (await bridge([
      { plugin: sensor("Fresh"), loxone: { packetId: "fresh", dataType: 1 } },
      { plugin: sensor("Clash"), loxone: { packetId: "temp", dataType: 1 } },
      { plugin: { type: "existing", signalId: "nope" }, loxone: { packetId: "x", dataType: 1 } }
    ])).json<BridgeResultDto[]>()
    assert.deepEqual(results.map(r => r.ok), [true, false, false])
    assert.deepEqual(results.slice(1).map(r => !r.ok && r.label), ["Clash", "nope"])
    assert.match(!results[1]!.ok ? results[1]!.error : "", /temp/)
    assert.deepEqual(await counts(), before.map(n => n + 1), "only the first item's signals and wire are added")
  })

  test("an actuator that is already controlled keeps its wire, and the new Loxone input is removed", async () => {
    const [first] = (await bridge([{ plugin: { type: "new", signal: { kind: "actuator", capability: "set", label: "Once" } }, loxone: { packetId: "once", dataType: 1 } }]))
      .json<BridgeResultDto[]>()
    const before = await counts()
    const [second] = (await bridge([{ plugin: { type: "existing", signalId: ok(first)!.signal.id }, loxone: { packetId: "twice", dataType: 1 } }]))
      .json<BridgeResultDto[]>()
    assert.match(!second!.ok ? second!.error : "", /already fed/)
    assert.deepEqual(await counts(), before)
  })

  test("an unknown Miniserver or instance is a 404 before anything is created", async () => {
    const before = await counts()
    assert.equal((await bridge([{ plugin: sensor("X"), loxone: { packetId: "x", dataType: 1 } }], "nope")).statusCode, 404)
    const unknown = await admin.post("/api/plugin-instances/nope/bridge", { miniserverId: miniserver.id, items: [{ plugin: sensor("X"), loxone: { packetId: "x", dataType: 1 } }] })
    assert.equal(unknown.statusCode, 404)
    assert.equal((await bridge([])).statusCode, 400)
    assert.deepEqual(await counts(), before)
  })
})
