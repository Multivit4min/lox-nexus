import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { test } from "node:test"
import type { InstallOutcomeDto, InstalledPluginDto, PluginInstanceDto, PluginSignalDto, StagedInstallDto, UpdateImpactDto, WireDto } from "@lox-nexus/api"
import { Value } from "@lox-nexus/plugin-sdk/values"
import type { ApiClient } from "../../test-support/ApiClient.ts"
import { FixtureBundle } from "../../test-support/install/FixtureBundle.ts"
import { InstallTest } from "../../test-support/install/InstallTest.ts"
import { ZipFixture } from "../../test-support/install/ZipFixture.ts"

const zip = (version: string, bundle: 1 | 2) => ZipFixture.plugin("", FixtureBundle.manifest({ version }), bundle)

async function stage(nexus: InstallTest, admin: ApiClient, version: string, bundle: 1 | 2) {
  const staged = await nexus.stageZip(admin, await zip(version, bundle))
  assert.equal(staged.statusCode, 201, staged.body)
  return staged.json<StagedInstallDto>()
}

async function signals(admin: ApiClient, instanceId: string) {
  return Object.fromEntries((await admin.get(`/api/plugin-instances/${instanceId}/signals`)).json<PluginSignalDto[]>().map(signal => [signal.slug, signal]))
}

test("an update restarts instances on the new version, orphans what it dropped, and a rollback brings it back", async t => {
  const nexus = await InstallTest.start()
  t.after(() => nexus.dispose())
  const admin = await nexus.test.admin()
  assert.equal((await nexus.installZip(admin, await zip("1.0.0", 1))).statusCode, 200)
  const good = (await admin.post("/api/plugin-instances", { plugin: "fixture", slug: "good", label: "Good", config: { start: 21 } })).json<PluginInstanceDto>()
  const failing = (await admin.post("/api/plugin-instances", { plugin: "fixture", slug: "failing", label: "Failing", config: { start: -1 } })).json<PluginInstanceDto>()
  assert.deepEqual([good.state, failing.state], ["running", "error"])
  const b = (await admin.post(`/api/plugin-instances/${good.id}/signals`, { kind: "sensor", capability: "b", label: "B" })).json<PluginSignalDto>()
  const sink = (await admin.post(`/api/plugin-instances/${good.id}/signals`, { kind: "actuator", capability: "sink", label: "Sink" })).json<PluginSignalDto>()
  assert.equal((await admin.post("/api/wires", { label: "b to sink", sourceId: b.id, targetId: sink.id })).statusCode, 201)
  assert.deepEqual(await nexus.value(b.topic), Value.number(42))

  const review = await stage(nexus, admin, "2.0.0", 2)
  assert.equal(review.installedVersion, "1.0.0")
  assert.deepEqual(review.impact?.removed, [{ kind: "sensor", capability: "b", signals: 1 }])
  assert.deepEqual(review.impact?.instances.map(instance => instance.label), ["Failing", "Good"])
  // a review based on another active version is refused
  assert.equal((await admin.post(`/api/plugin-packages/stage/${review.stagingId}/confirm`, { expectedActive: null })).statusCode, 409)

  const again = await stage(nexus, admin, "2.0.0", 2)
  const updated = (await admin.post(`/api/plugin-packages/stage/${again.stagingId}/confirm`, { expectedActive: "1.0.0" })).json<InstallOutcomeDto>()
  assert.deepEqual([updated.plugin.active.version, updated.plugin.previous?.version], ["2.0.0", "1.0.0"])
  // the failed instance got the fix, the running one restarted
  assert.deepEqual(updated.instances.map(instance => [instance.label, instance.state]), [["Failing", "running"], ["Good", "running"]])
  const orphaned = (await signals(admin, good.id)).b!
  assert.equal(orphaned.orphaned, true)
  assert.equal(orphaned.error, "Fixture 2.0.0 no longer offers sensor \"b\"")
  assert.equal((await admin.get("/api/wires")).json<WireDto[]>().length, 1, "the wire stays")

  const rollbackImpact = (await admin.get("/api/plugin-packages/fixture/versions/1.0.0/impact")).json<UpdateImpactDto>()
  assert.deepEqual(rollbackImpact.removed, [])
  assert.equal((await admin.post("/api/plugin-packages/fixture/activate", { version: "1.0.0", expectedActive: "1.0.0" })).statusCode, 409)
  const rolledBack = (await admin.post("/api/plugin-packages/fixture/activate", { version: "1.0.0", expectedActive: "2.0.0" })).json<InstallOutcomeDto>()
  assert.deepEqual([rolledBack.plugin.active.version, rolledBack.plugin.previous?.version], ["1.0.0", "2.0.0"])
  assert.equal((await signals(admin, good.id)).b?.orphaned, undefined)
  assert.deepEqual(rolledBack.instances.map(instance => [instance.label, instance.state]), [["Failing", "error"], ["Good", "running"]])
  await nexus.until(() => nexus.app.bus.current(b.topic)?.value?.type === "number")
  assert.equal((await admin.get("/api/wires")).json<WireDto[]>()[0]?.active, true)
})

test("only active and previous versions are kept; a stored version comes back by installing it again", async t => {
  const nexus = await InstallTest.start()
  t.after(() => nexus.dispose(false))
  const admin = await nexus.test.admin()
  assert.equal((await nexus.installZip(admin, await zip("1.0.0", 1))).statusCode, 200)
  for (const version of ["2.0.0", "3.0.0"]) {
    const review = await stage(nexus, admin, version, 2)
    const previous = version === "2.0.0" ? "1.0.0" : "2.0.0"
    assert.equal((await admin.post(`/api/plugin-packages/stage/${review.stagingId}/confirm`, { expectedActive: previous })).statusCode, 200)
  }
  assert.deepEqual(fs.readdirSync(path.join(nexus.pluginsDir, "fixture")).sort(), ["2.0.0", "3.0.0"])
  // installing the previous version again activates the stored copy
  const back = await stage(nexus, admin, "2.0.0", 2)
  assert.equal(back.sameAsInstalled, false)
  const outcome = (await admin.post(`/api/plugin-packages/stage/${back.stagingId}/confirm`, { expectedActive: "3.0.0" })).json<InstallOutcomeDto>()
  assert.deepEqual([outcome.plugin.active.version, outcome.plugin.previous?.version], ["2.0.0", "3.0.0"])
  // the same version with another bundle is refused
  assert.equal((await nexus.stageZip(admin, await zip("3.0.0", 1))).statusCode, 409)
  await nexus.test.dispose()

  const restarted = await InstallTest.start({ dataDir: nexus.dataDir })
  t.after(() => restarted.dispose())
  const [installed] = (await (await restarted.test.login()).get("/api/plugin-packages")).json<InstalledPluginDto[]>()
  assert.deepEqual([installed?.active.version, installed?.previous?.version, installed?.previous?.available], ["2.0.0", "3.0.0", true])
})
