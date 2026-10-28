import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import type { LoxoneSignalDto, MiniserverDto, PluginInstanceDto, SelectionDto } from "@lox-nexus/api"
import { ExporterPlugin, FakePluginTransport } from "@lox-nexus/core/testing"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { Value } from "@lox-nexus/plugin-sdk/values"
import type { ApiClient } from "../../test-support/ApiClient.ts"
import { TestApp } from "../../test-support/TestApp.ts"

const settle = async () => {
  for (let i = 0; i < 30; i++) await new Promise(resolve => setImmediate(resolve))
}

let app: TestApp
let admin: ApiClient
before(async () => {
  const description = await PluginTestHost.describe(ExporterPlugin)
  app = await TestApp.start({ pluginTransport: new FakePluginTransport().add("exporter.ts", ExporterPlugin) }, {}, nexus =>
    nexus.pluginCatalog.setDevelopment({ pkg: { id: "exporter", name: "Exporter", entry: "exporter.ts", description }, version: "1.0.0" }))
  admin = await app.admin()
})
after(() => app.dispose())

test("a watching plugin gets the values of the signals chosen for it, through the selections API", { timeout: 10_000 }, async () => {
  const ms = (await admin.post("/api/miniservers", { slug: "haus", label: "Haus", host: "127.0.0.1", port: 1, listenPort: 2, ownId: "nexus", remoteId: "ms", enabled: false })).json<MiniserverDto>()
  const temp = (await admin.post(`/api/miniservers/${ms.id}/signals`, { packetId: "temp", direction: "in", dataType: 1, label: "Temperature" })).json<LoxoneSignalDto>()
  const instance = (await admin.post("/api/plugin-instances", { plugin: "exporter", slug: "influx", label: "Influx" })).json<PluginInstanceDto>()
  const stored = () => (app.app.persistence.pluginStore.load(instance.id) as { got?: string[] }).got ?? []
  assert.deepEqual((await admin.get(`/api/selections/${instance.id}`)).json<SelectionDto>().mode, "selected", "nothing until chosen")
  app.app.bus.publish(temp.topic, Value.number(1), { source: { kind: "loxone", id: ms.id } })
  await settle()
  assert.deepEqual(stored(), [])
  const chosen = await admin.put(`/api/selections/${instance.id}/rules`, [{ target: { miniserverId: ms.id }, include: true }])
  assert.equal(chosen.statusCode, 200, chosen.body)
  // the feed follows the new choice at once, with the current value
  await settle()
  app.app.bus.publish(temp.topic, Value.number(2), { source: { kind: "loxone", id: ms.id } })
  await settle()
  assert.deepEqual(stored(), ["Temperature=1 (initial)", "Temperature=2"])
  assert.equal((await admin.get("/api/selections/not-an-instance")).statusCode, 404, "only the history and watching instances have a selection")
  // deleting the instance deletes its choice
  assert.equal((await admin.delete(`/api/plugin-instances/${instance.id}`)).statusCode, 204)
  assert.equal(app.app.persistence.selections.rules(instance.id).length, 0)
})
