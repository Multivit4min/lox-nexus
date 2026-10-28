import assert from "node:assert/strict"
import { after, before, describe, test } from "node:test"
import type { LoxoneSignalDto, MiniserverDto, PluginInstanceDto, PluginSignalDto } from "@lox-nexus/api"
import type { BusMessage } from "@lox-nexus/core"
import { CounterPlugin, FakePluginTransport } from "@lox-nexus/core/testing"
import { IciSocket } from "@lox-nexus/ici"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { Value } from "@lox-nexus/plugin-sdk/values"
import type { ApiClient } from "../../test-support/ApiClient.ts"
import { TestApp } from "../../test-support/TestApp.ts"

/** a free UDP port on loopback (bound and released) */
const freePort = async () => {
  const socket = new IciSocket()
  await socket.bind(0, "127.0.0.1")
  const port = socket.address()!.port
  await socket.close()
  return port
}

/** waits for queued fake-worker messages (microtasks and immediates) to be handled */
const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve))
}

describe("starting a Miniserver or plugin sends its values once", { timeout: 10_000 }, () => {
  let app: TestApp
  let admin: ApiClient
  let ms: MiniserverDto
  const seen: BusMessage[] = []
  const on = (topic: string) => seen.filter(message => message.topic === topic)

  before(async () => {
    const description = await PluginTestHost.describe(CounterPlugin)
    const pluginTransport = new FakePluginTransport().add("counter.ts", CounterPlugin)
    app = await TestApp.start({ pluginTransport }, {}, nexus =>
      nexus.pluginCatalog.setDevelopment({ pkg: { id: "counter", name: "Counter", entry: "counter.ts", description }, version: "1.0.0" }))
    admin = await app.admin()
    ms = (await admin.post("/api/miniservers", {
      slug: "haus", label: "Haus", host: "127.0.0.1", port: 9, listenPort: await freePort(), listenAddress: "127.0.0.1", ownId: "nexus", remoteId: "ms", enabled: false
    })).json<MiniserverDto>()
    app.app.bus.tap(message => void seen.push(message))
  })
  after(() => app.dispose())

  const output = async (packetId: string) =>
    (await admin.post(`/api/miniservers/${ms.id}/signals`, { packetId, direction: "out", dataType: 1, label: packetId })).json<LoxoneSignalDto>()
  const wire = async (sourceId: string, targetId: string) =>
    assert.equal((await admin.post("/api/wires", { label: `${sourceId}→${targetId}`, sourceId, targetId })).statusCode, 201)

  test("a Miniserver output whose wire never delivered gets the source's value at start", async () => {
    const input = (await admin.post(`/api/miniservers/${ms.id}/signals`, { packetId: "in", direction: "in", dataType: 1, label: "in" })).json<LoxoneSignalDto>()
    const out = await output("mirror")
    await wire(input.id, out.id)
    // restored values don't go through wires, so the output stays empty, as after a restart
    app.app.bus.restoreSnapshot([{ topic: input.topic, value: Value.number(0), ts: 0 }])
    assert.equal(app.app.bus.current(out.topic), undefined)
    assert.equal((await admin.post(`/api/miniservers/${ms.id}/start`)).json<MiniserverDto>().running, true)
    assert.deepEqual(app.app.bus.current(out.topic)?.value, Value.number(0))
    await admin.post(`/api/miniservers/${ms.id}/stop`)
  })

  test("a plugin start sends its sensors' values to their outputs again, but nothing to its actuators", async () => {
    const instance = (await admin.post("/api/plugin-instances", { plugin: "counter", slug: "home", label: "Home" })).json<PluginInstanceDto>()
    const base = `/api/plugin-instances/${instance.id}`
    const sensor = (await admin.post(`${base}/signals`, { kind: "sensor", capability: "value", params: { start: 5 }, label: "count" })).json<PluginSignalDto>()
    const actuator = (await admin.post(`${base}/signals`, { kind: "actuator", capability: "set", label: "set" })).json<PluginSignalDto>()
    const input = (await admin.post(`/api/miniservers/${ms.id}/signals`, { packetId: "cmd", direction: "in", dataType: 1, label: "cmd" })).json<LoxoneSignalDto>()
    const out = await output("count")
    await settle()
    await wire(sensor.id, out.id)
    assert.deepEqual(on(out.topic).map(message => message.value), [Value.number(5)], "the new wire sent the value")
    // the input has a value, but neither a new wire nor a start sends it to the device
    app.app.bus.publish(input.topic, Value.number(7), { source: { kind: "user", id: "test" } })
    await wire(input.id, actuator.id)
    assert.equal(on(actuator.topic).length, 0)

    await admin.post(`${base}/stop`)
    assert.equal((await admin.post(`${base}/start`)).statusCode, 200)
    await settle()
    assert.deepEqual(on(out.topic).map(message => message.value), [Value.number(5), Value.number(5)], "sent again although unchanged")
    assert.equal(on(actuator.topic).length, 0, "the actuator got nothing")
  })
})
