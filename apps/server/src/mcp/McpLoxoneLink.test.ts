import assert from "node:assert/strict"
import { once } from "node:events"
import { after, before, describe, test } from "node:test"
import type { CreatedAccessTokenDto, PluginInstanceDto } from "@lox-nexus/api"
import { FakePluginTransport } from "@lox-nexus/core/testing"
import { DataType, IciReceiver, IciSocket, RemotePeer, type DataEvent } from "@lox-nexus/ici"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { HomePlugin } from "../test-support/HomePlugin.ts"
import { TestApp } from "../test-support/TestApp.ts"

type Side = {
  miniserver: { iciId: string }
  peer: { iciId: string; port: number }
  objects: Array<{ topic: string; loxone: { object: string; packetId: string; dataType: number } }>
}

/** a free UDP port on loopback (bound and released) */
const freePort = async () => {
  const socket = new IciSocket()
  await socket.bind(0, "127.0.0.1")
  const port = socket.address()!.port
  await socket.close()
  return port
}

// the A2 promise: an agent connects a plugin to a Miniserver, and the Loxone side is set up from loxone_side alone
describe("MCP: plugin to Miniserver, end to end", { timeout: 30_000 }, () => {
  let app: TestApp
  let token: string
  const loxone = new IciSocket()
  let receiver: IciReceiver
  let id = 0
  const json = async <T>(name: string, args: Record<string, unknown>) => {
    const answer = await app.client().post("/mcp", { jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name, arguments: args } }, { authorization: `Bearer ${token}` })
    const { result } = answer.json<{ result: { content: { text: string }[]; isError?: boolean } }>()
    assert.ok(!result.isError, result.content[0]!.text)
    return JSON.parse(result.content[0]!.text) as T
  }

  before(async () => {
    await loxone.bind(0, "127.0.0.1")
    const description = await PluginTestHost.describe(HomePlugin)
    app = await TestApp.start({ pluginTransport: new FakePluginTransport().add("home.ts", HomePlugin) }, {}, nexus =>
      nexus.pluginCatalog.setDevelopment({ pkg: { id: "home", name: "Home", entry: "home.ts", description }, version: "1.0.0" }))
    const admin = await app.admin()
    const instance = (await admin.post("/api/plugin-instances", { plugin: "home", slug: "ha", label: "HA" })).json<PluginInstanceDto>()
    await admin.post(`/api/plugin-instances/${instance.id}/start`, {})
    const ms = await admin.post("/api/miniservers", { slug: "haus", label: "Haus", host: "127.0.0.1", port: loxone.address()!.port, listenPort: await freePort(), listenAddress: "127.0.0.1", ownId: "nexus", remoteId: "ms" })
    assert.equal(ms.statusCode, 201, ms.body)
    token = (await admin.post("/api/tokens", { currentPassword: "correct horse", name: "agent", scopes: ["configure"] })).json<CreatedAccessTokenDto>().token
  })
  after(async () => {
    receiver?.dispose()
    await app.dispose()
    await loxone.close()
  })

  test("plan_bridge → bridge → loxone_side, then values flow both ways", async () => {
    const plan = await json<{ items: unknown[] }>("plan_bridge", { instance: "ha", miniserver: "haus", items: [
      { entry: { kind: "sensor", capability: "reading", params: { entity: "sensor.kitchen_temperature" }, label: "Kitchen temperature" } },
      { entry: { kind: "actuator", capability: "switch", params: { entity: "switch.kitchen_light" }, label: "Kitchen light" } }
    ] })
    const side = await json<Side>("loxone_side", { miniserver: "haus" })
    assert.deepEqual(side.objects, [], "nothing yet")
    // the Loxone side, set up from what loxone_side will answer: listen before bridge sends the sensor's value
    receiver = new IciReceiver(loxone, { ownId: side.miniserver.iciId })
    const arrived = once(receiver, "data") as Promise<[DataEvent]>
    const results = await json<Array<{ ok: boolean }>>("bridge", { instance: "ha", miniserver: "haus", items: plan.items })
    assert.ok(results.every(result => result.ok), JSON.stringify(results))

    const { objects, peer } = await json<Side>("loxone_side", { miniserver: "haus" })
    const input = objects.find(object => object.loxone.object === "intercommunication input")!
    const output = objects.find(object => object.loxone.object === "intercommunication output")!
    const [event] = await arrived
    assert.deepEqual([event.packet.packetId, event.packet.dataType, event.value], [input.loxone.packetId, input.loxone.dataType, 21.5])

    const miniserver = new RemotePeer(loxone, { ownId: side.miniserver.iciId, remoteId: peer.iciId, host: "127.0.0.1", port: peer.port, resendInterval: 0 })
    try {
      assert.equal(output.loxone.dataType, DataType.Digital)
      await miniserver.output(output.loxone.packetId, DataType.Digital).set(true)
      for (let i = 0; i < 50 && HomePlugin.switched.length === 0; i++) await new Promise(resolve => setImmediate(resolve))
      assert.deepEqual(HomePlugin.switched, [true])
    } finally {
      miniserver.close()
    }
  })
})
