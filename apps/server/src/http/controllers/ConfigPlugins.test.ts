import assert from "node:assert/strict"
import { test } from "node:test"
import type { ConfigExport, ConfigImportResultDto, PluginInstanceDto } from "@lox-nexus/api"
import { configured, installation } from "../../test-support/ConfigPluginFixture.ts"

test("plugin instances travel with the file; their secrets only sealed, opened with the passphrase", async t => {
  const source = await configured()
  t.after(() => source.app.dispose())
  const plain = (await source.admin.get("/api/config/export")).json<ConfigExport>()
  assert.deepEqual(plain.plugins?.map(plugin => [plugin.slug, plugin.config, (plugin.signals ?? []).map(signal => [signal.label, signal.unit])]), [["gw", { host: "gw.local" }, [["Power", "W"]]]])
  assert.equal(plain.wires.length, 1, "the wire from the plugin's sensor to the Miniserver comes along")
  assert.ok(!JSON.stringify(plain).includes("right"), "no secret in the plain file")
  assert.equal((await source.admin.post("/api/config/export", { passphrase: "short" })).statusCode, 400, "12 characters at least")
  const sealed = (await source.admin.post("/api/config/export", { passphrase: "a long passphrase" })).json<ConfigExport>()
  assert.ok(sealed.secrets && !JSON.stringify(sealed).includes("\"right\""))

  const target = await installation()
  t.after(() => target.app.dispose())
  const refused = await target.admin.post("/api/config/import", sealed)
  assert.deepEqual([refused.statusCode, refused.json<{ code: string }>().code], [400, "passphrase-required"])
  const wrong = await target.admin.post("/api/config/import", { file: sealed, passphrase: "not the passphrase" })
  assert.deepEqual([wrong.statusCode, wrong.json<{ code: string }>().code], [400, "wrong-passphrase"])
  const imported = await target.admin.post("/api/config/import", { file: sealed, passphrase: "a long passphrase" })
  assert.equal(imported.statusCode, 200, imported.body)
  assert.deepEqual(imported.json<ConfigImportResultDto>(), { miniservers: 1, signals: 1, wires: 1, inactiveWires: 0, keptPasswords: [], plugins: 1, pluginSignals: 1, missingSecrets: [] })
  const instances = (await target.admin.get("/api/plugin-instances")).json<PluginInstanceDto[]>()
  assert.deepEqual(instances.map(instance => [instance.id, instance.state]), [[source.instance.id, "running"]], "same id, started with its token")
  assert.equal(target.app.app.persistence.pluginStore.load(source.instance.id).pairing, undefined, "the store isn't in the file")
})

test("without its secrets an instance is created anyway and named; a re-import on the same installation keeps its store", async t => {
  const { app, admin, instance } = await configured()
  t.after(() => app.dispose())
  const plain = (await admin.get("/api/config/export")).json<ConfigExport>()
  const again = (await admin.post("/api/config/import", plain)).json<ConfigImportResultDto>()
  assert.deepEqual(again.missingSecrets, [], "the instance with the same id keeps the token it has")
  assert.deepEqual(app.app.persistence.pluginStore.load(instance.id), { pairing: { paired: true } }, "and its store")
  assert.equal((await admin.get(`/api/plugin-instances/${instance.id}`)).json<PluginInstanceDto>().state, "running")

  const other = await installation()
  t.after(() => other.app.dispose())
  const result = (await other.admin.post("/api/config/import", plain)).json<ConfigImportResultDto>()
  assert.deepEqual(result.missingSecrets, [{ id: instance.id, label: "Gateway", fields: ["token"] }])
  assert.equal((await other.admin.get(`/api/plugin-instances/${instance.id}`)).json<PluginInstanceDto>().state, "error", "it says what is wrong when it starts")
})
