import assert from "node:assert/strict"
import { test } from "node:test"
import type { ConfigExport, ForceDto, PluginInstanceDto } from "@lox-nexus/api"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { configured } from "../../test-support/ConfigPluginFixture.ts"

test("rules on a whole plugin instance travel; forces on plugin topics stay over an import", async t => {
  const { app, admin, instance, sensor } = await configured()
  t.after(() => app.dispose())
  await app.app.selections.setRules("history", [{ target: { instanceId: instance.id }, include: true }])
  await app.app.selections.setRules(instance.id, [{ target: { instanceId: instance.id }, include: true }])
  await admin.post("/api/bus/forces", { topic: sensor.topic, value: Value.number(7), reason: "test" })
  const file = (await admin.get("/api/config/export")).json<ConfigExport>()
  assert.deepEqual(file.selections?.history?.rules, [{ target: { instanceId: instance.id }, include: true }])
  assert.deepEqual(file.plugins?.[0]?.watch?.rules, [{ target: { instanceId: instance.id }, include: true }])
  const imported = await admin.post("/api/config/import", file)
  assert.equal(imported.statusCode, 200, imported.body)
  assert.deepEqual(app.app.selections.of("history").rules.map(rule => rule.target), [{ instanceId: instance.id }])
  assert.deepEqual((await admin.get("/api/bus/forces")).json<ForceDto[]>().map(force => force.topic), [sensor.topic], "the force came back on the same topic")
})

test("a file without plugin instances leaves them alone, also when it fails, and may wire to their signals", async t => {
  const { app, admin, instance, sensor, ms } = await configured()
  t.after(() => app.dispose())
  await admin.post(`/api/plugin-instances/${instance.id}/stop`, {})
  await admin.post("/api/bus/forces", { topic: sensor.topic, value: Value.number(3), reason: "test" })
  // a version 1 file: no plugin instances in it
  const v1: ConfigExport = { ...(await admin.get("/api/config/export")).json<ConfigExport>(), version: 1 }
  delete v1.plugins
  // two Miniservers on one listen port: the second fails, the import is rolled back
  const failing = { ...v1, miniservers: [...v1.miniservers, { ...v1.miniservers[0]!, id: "other", slug: "other", signals: [] }] }
  assert.equal((await admin.post("/api/config/import", failing)).statusCode, 409)
  assert.equal((await admin.get(`/api/plugin-instances/${instance.id}`)).json<PluginInstanceDto>().state, "stopped", "not restarted by the rollback")
  assert.deepEqual((await admin.get("/api/bus/forces")).json<ForceDto[]>().map(force => force.topic), [sensor.topic])
  const fine = await admin.post("/api/config/import", v1)
  assert.equal(fine.statusCode, 200, fine.body)
  assert.equal((await admin.get("/api/wires")).json<unknown[]>().length, 1, "the wire from the plugin's sensor to the Miniserver came back")
  assert.ok(ms.id)
})

test("a failing import with plugin instances restores them with their secrets and stores", async t => {
  const { app, admin, instance } = await configured()
  t.after(() => app.dispose())
  const file = (await admin.get("/api/config/export")).json<ConfigExport>()
  const failing = { ...file, miniservers: [...file.miniservers, { ...file.miniservers[0]!, id: "other", slug: "other", signals: [] }] }
  assert.equal((await admin.post("/api/config/import", failing)).statusCode, 409)
  const back = (await admin.get(`/api/plugin-instances/${instance.id}`)).json<PluginInstanceDto>()
  assert.deepEqual([back.state, back.secrets], ["running", ["token"]], "running again with its token")
  assert.deepEqual(app.app.persistence.pluginStore.load(instance.id), { pairing: { paired: true } })
})

test("an instance of a plugin that isn't installed exports no plain settings, and stays unavailable on import", async t => {
  const { app, admin } = await configured()
  t.after(() => app.dispose())
  app.app.persistence.pluginInstances.save({ id: "gone", plugin: "missing", slug: "gone", label: "Gone", config: { host: "x", key: "k" }, enabled: true })
  const file = (await admin.get("/api/config/export")).json<ConfigExport>()
  assert.deepEqual(file.plugins?.find(plugin => plugin.id === "gone")?.config, {})
  assert.equal((await admin.post("/api/config/import", file)).statusCode, 200)
  assert.deepEqual(app.app.persistence.pluginInstances.get("gone")?.config, { host: "x", key: "k" }, "kept from before: same id, same plugin")
  assert.equal((await admin.get("/api/plugin-instances/gone")).json<PluginInstanceDto>().state, "unavailable")
})
