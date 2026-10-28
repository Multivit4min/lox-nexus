import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { mock, test } from "node:test"
import type { InstallOutcomeDto, InstalledPluginDto, PluginInstanceDto, PluginSignalDto, StagedInstallDto, WireDto } from "@lox-nexus/api"
import { PluginDirectory } from "../../plugins/install/PluginDirectory.ts"
import type { ApiClient } from "../../test-support/ApiClient.ts"
import { FixtureBundle } from "../../test-support/install/FixtureBundle.ts"
import { InstallTest } from "../../test-support/install/InstallTest.ts"
import { ZipFixture } from "../../test-support/install/ZipFixture.ts"

const zip = (version: string, bundle: 1 | 2) => ZipFixture.plugin("", FixtureBundle.manifest({ version }), bundle)

async function install(nexus: InstallTest, admin: ApiClient, version: string, bundle: 1 | 2, expectedActive: string | null) {
  const staged = (await nexus.stageZip(admin, await zip(version, bundle))).json<StagedInstallDto>()
  return admin.post(`/api/plugin-packages/stage/${staged.stagingId}/confirm`, { expectedActive })
}

const installed = async (admin: ApiClient) => (await admin.get("/api/plugin-packages")).json<InstalledPluginDto[]>()[0]

test("an orphan survives a restart, can't be edited, can be deleted, and comes back with its wire after a rollback", async t => {
  const first = await InstallTest.start()
  t.after(() => first.dispose())
  const admin = await first.test.admin()
  await install(first, admin, "1.0.0", 1, null)
  const instance = (await admin.post("/api/plugin-instances", { plugin: "fixture", slug: "fx", label: "Fx", config: { start: 3 } })).json<PluginInstanceDto>()
  const b = (await admin.post(`/api/plugin-instances/${instance.id}/signals`, { kind: "sensor", capability: "b", label: "B" })).json<PluginSignalDto>()
  const extra = (await admin.post(`/api/plugin-instances/${instance.id}/signals`, { kind: "sensor", capability: "b", label: "Extra" })).json<PluginSignalDto>()
  const sink = (await admin.post(`/api/plugin-instances/${instance.id}/signals`, { kind: "actuator", capability: "sink", label: "Sink" })).json<PluginSignalDto>()
  await admin.post("/api/wires", { label: "b to sink", sourceId: b.id, targetId: sink.id })
  assert.equal((await install(first, admin, "2.0.0", 2, "1.0.0")).statusCode, 200)
  await first.dispose(false)

  const nexus = await InstallTest.start({ dataDir: first.dataDir })
  t.after(() => nexus.dispose())
  const again = await nexus.test.login()
  const signals = () => again.get(`/api/plugin-instances/${instance.id}/signals`).then(response => response.json<PluginSignalDto[]>())
  const orphan = (await signals()).find(signal => signal.id === b.id)
  assert.deepEqual([orphan?.orphaned, orphan?.valueType, orphan?.error], [true, "any", "Fixture 2.0.0 no longer offers sensor \"b\""])
  const edit = await again.put(`/api/plugin-instances/${instance.id}/signals/${b.id}`, { kind: "sensor", capability: "b", label: "Renamed" })
  assert.equal(edit.statusCode, 409)
  assert.match(edit.json<{ error: string }>().error, /no longer offers sensor "b": roll the plugin back or delete the signal/)
  assert.equal((await again.delete(`/api/plugin-instances/${instance.id}/signals/${extra.id}`)).statusCode, 204)

  await again.post("/api/plugin-packages/fixture/activate", { version: "1.0.0", expectedActive: "2.0.0" })
  const back = (await signals()).find(signal => signal.id === b.id)
  assert.deepEqual([back?.orphaned, back?.valueType], [undefined, "number"])
  assert.deepEqual((await signals()).map(signal => signal.id).sort(), [b.id, sink.id].sort())
  assert.equal((await again.get("/api/wires")).json<WireDto[]>()[0]?.active, true)
})

test("activate refuses a previous version whose files are gone; installing it again repairs them", async t => {
  const nexus = await InstallTest.start()
  t.after(() => nexus.dispose())
  const admin = await nexus.test.admin()
  await install(nexus, admin, "1.0.0", 1, null)
  await install(nexus, admin, "2.0.0", 2, "1.0.0")
  fs.rmSync(path.join(nexus.pluginsDir, "fixture", "1.0.0"), { recursive: true })
  const refused = await admin.post("/api/plugin-packages/fixture/activate", { version: "1.0.0", expectedActive: "2.0.0" })
  assert.equal(refused.statusCode, 400)
  assert.match(refused.json<{ error: string }>().error, /files are missing/)
  assert.equal((await installed(admin))?.active.version, "2.0.0")

  const repaired = (await install(nexus, admin, "1.0.0", 1, "2.0.0")).json<InstallOutcomeDto>()
  assert.deepEqual([repaired.plugin.active.version, repaired.plugin.active.available], ["1.0.0", true])
  assert.ok(fs.existsSync(path.join(nexus.pluginsDir, "fixture", "1.0.0", "dist", "plugin.js")))
})

test("a confirmed version that can't be put into service leaves the previous state active", async t => {
  const nexus = await InstallTest.start()
  t.after(() => nexus.dispose())
  const admin = await nexus.test.admin()
  await install(nexus, admin, "1.0.0", 1, null)
  const stopped = (await admin.post("/api/plugin-instances", { plugin: "fixture", slug: "off", label: "Off" })).json<PluginInstanceDto>()
  await admin.post(`/api/plugin-instances/${stopped.id}/stop`)
  const staged = (await nexus.stageZip(admin, await zip("2.0.0", 2))).json<StagedInstallDto>()
  const sha256 = PluginDirectory.sha256.bind(PluginDirectory)
  // the moved bundle reads differently from the staged one, as if the disk corrupted it
  const corrupt = mock.method(PluginDirectory, "sha256", async (file: string) => file.includes(`${path.sep}2.0.0${path.sep}`) ? "0".repeat(64) : sha256(file))
  const failed = await admin.post(`/api/plugin-packages/stage/${staged.stagingId}/confirm`, { expectedActive: "1.0.0" })
  corrupt.mock.restore()
  assert.equal(failed.statusCode, 400)
  const after = await installed(admin)
  assert.deepEqual([after?.active.version, after?.previous], ["1.0.0", undefined])
  assert.deepEqual(fs.readdirSync(path.join(nexus.pluginsDir, "fixture")), ["1.0.0"])

  // a real update leaves an instance stopped by hand stopped
  const outcome = (await install(nexus, admin, "2.0.0", 2, "1.0.0")).json<InstallOutcomeDto>()
  assert.deepEqual(outcome.instances.map(instance => [instance.label, instance.state]), [["Off", "stopped"]])
})
