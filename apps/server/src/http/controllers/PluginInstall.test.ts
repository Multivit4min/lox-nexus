import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import type { InstallOutcomeDto, InstalledPluginDto, PluginInstanceDto, PluginPackageDto, PluginSignalDto, StagedInstallDto } from "@lox-nexus/api"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { FixtureBundle } from "../../test-support/install/FixtureBundle.ts"
import { InstallTest } from "../../test-support/install/InstallTest.ts"
import { ZipFixture } from "../../test-support/install/ZipFixture.ts"
import { TestApp } from "../../test-support/TestApp.ts"

test("a ZIP is staged, reviewed, installed and runs in a worker; uninstall waits for its instances", async t => {
  const nexus = await InstallTest.start()
  t.after(() => nexus.dispose())
  const admin = await nexus.test.admin()

  const staged = await nexus.stageZip(admin, await ZipFixture.plugin("fixture-1.0.0/"))
  assert.equal(staged.statusCode, 201, staged.body)
  const review = staged.json<StagedInstallDto>()
  assert.equal(review.id, "fixture")
  assert.equal(review.version, "1.0.0")
  assert.equal(review.sensors, 2)
  assert.equal(review.sameAsInstalled, false)
  assert.equal(review.source.kind, "zip")
  // staged is not installed
  assert.equal((await admin.get("/api/plugins")).json<PluginPackageDto[]>().some(pkg => pkg.id === "fixture"), false)

  const confirmed = await admin.post(`/api/plugin-packages/stage/${review.stagingId}/confirm`, { expectedActive: null })
  assert.equal(confirmed.statusCode, 200, confirmed.body)
  const outcome = confirmed.json<InstallOutcomeDto>()
  assert.equal(outcome.plugin.active.version, "1.0.0")
  assert.equal(outcome.plugin.active.available, true)
  assert.equal(outcome.plugin.active.bundleSha256, review.bundleSha256)
  assert.deepEqual(nexus.staged(), [])
  assert.deepEqual(fs.readdirSync(path.join(nexus.pluginsDir, "fixture", "1.0.0"), { recursive: true }).map(String).sort(), ["dist", "dist/plugin.js", "package.json"])
  const pkg = (await admin.get("/api/plugins")).json<PluginPackageDto[]>().find(entry => entry.id === "fixture")
  assert.equal(pkg?.source, "installed")

  // an instance of the installed plugin runs from the installed bundle
  const instance = (await admin.post("/api/plugin-instances", { plugin: "fixture", slug: "fx", label: "Fixture", config: { start: 21 } })).json<PluginInstanceDto>()
  assert.equal(instance.state, "running", instance.lastError ?? "no lastError")
  const signal = (await admin.post(`/api/plugin-instances/${instance.id}/signals`, { kind: "sensor", capability: "b", label: "B" })).json<PluginSignalDto>()
  assert.deepEqual(await nexus.value(signal.topic), Value.number(42))

  const refused = await admin.delete("/api/plugin-packages/fixture")
  assert.equal(refused.statusCode, 409)
  assert.match(refused.json<{ error: string }>().error, /"Fixture"/)
  await admin.delete(`/api/plugin-instances/${instance.id}`)
  assert.equal((await admin.delete("/api/plugin-packages/fixture")).statusCode, 204)
  assert.deepEqual((await admin.get("/api/plugin-packages")).json(), [])
  assert.equal(fs.existsSync(path.join(nexus.pluginsDir, "fixture")), false)
  assert.equal((await admin.get("/api/plugins")).json<PluginPackageDto[]>().some(entry => entry.id === "fixture"), false)
  assert.equal((await admin.delete("/api/plugin-packages/fixture")).statusCode, 404)
})

test("installs survive a restart with their heap limit, and the instance starts again", async t => {
  const first = await InstallTest.start()
  t.after(() => first.dispose())
  const admin = await first.test.admin()
  const zip = await ZipFixture.plugin("", FixtureBundle.manifest({}, { heapMb: 256 }))
  assert.equal((await first.stageZip(admin, zip)).json<StagedInstallDto>().heapMb, 256, "the review shows it")
  assert.equal((await first.installZip(admin, zip)).statusCode, 200)
  const instance = (await admin.post("/api/plugin-instances", { plugin: "fixture", slug: "fx", label: "Fixture" })).json<PluginInstanceDto>()
  await first.dispose(false)

  const second = await InstallTest.start({ dataDir: first.dataDir })
  t.after(() => second.dispose())
  const again = await second.test.login()
  const [installed] = (await again.get("/api/plugin-packages")).json<InstalledPluginDto[]>()
  assert.equal(installed?.active.version, "1.0.0")
  assert.equal(installed?.instances, 1)
  assert.deepEqual(installed?.instanceNames, ["Fixture"])
  assert.equal(installed?.shadowedByDevelopment, false)
  await second.until(() => second.app.plugins.get(instance.id)?.state === "running")
  assert.equal(second.app.plugins.get(instance.id)?.pkg.heapMb, 256)
})

test("a plugin that doesn't load, and a changed bundle with the same version", async t => {
  const nexus = await InstallTest.start()
  t.after(() => nexus.dispose())
  const admin = await nexus.test.admin()
  const broken = ZipFixture.zip({ "package.json": FixtureBundle.manifest(), "dist/plugin.js": "throw new Error(\"boom on load\")" })
  const failed = await nexus.stageZip(admin, broken)
  assert.equal(failed.statusCode, 400)
  assert.match(failed.json<{ error: string }>().error, /could not be loaded: .*boom on load/)
  assert.deepEqual(nexus.staged(), [])

  assert.equal((await nexus.installZip(admin, await ZipFixture.plugin())).statusCode, 200)
  const changed = ZipFixture.zip({ "package.json": FixtureBundle.manifest(), "dist/plugin.js": `${(await FixtureBundle.bundle()).toString()}\n// changed\n` })
  const exists = await nexus.stageZip(admin, changed)
  assert.equal(exists.statusCode, 409)
  assert.match(exists.json<{ error: string }>().error, /raise the version/)
  assert.deepEqual(nexus.staged(), [])
})

test("uploads must be ZIP bytes within the limit, from a logged-in user", async t => {
  const zip = await ZipFixture.plugin()
  const nexus = await InstallTest.start({ limits: { uploadBytes: zip.length } })
  t.after(() => nexus.dispose())
  const admin = await nexus.test.admin()
  assert.equal((await admin.post("/api/plugin-packages/stage/zip", { not: "a zip" })).statusCode, 415)
  assert.equal((await nexus.stageZip(admin, Buffer.from("PK nope"))).statusCode, 400)
  assert.equal((await nexus.stageZip(admin, Buffer.concat([zip, Buffer.alloc(1)]))).statusCode, 413)
  // Windows browsers label .zip files like this
  assert.equal((await admin.post("/api/plugin-packages/stage/zip", zip, { "content-type": "application/x-zip-compressed" })).statusCode, 201)
  const anonymous = nexus.test.client()
  assert.equal((await anonymous.get("/api/plugin-packages")).statusCode, 401)
  assert.equal((await nexus.stageZip(anonymous, zip)).statusCode, 401)
  assert.deepEqual(nexus.staged().length, 1)
})

test("a development copy with the same id runs instead of the installed plugin, and survives its uninstall", async t => {
  const devPlugins = TestApp.tempDir()
  t.after(() => fs.rmSync(devPlugins, { recursive: true, force: true }))
  fs.mkdirSync(path.join(devPlugins, "fixture", "src"), { recursive: true })
  fs.writeFileSync(path.join(devPlugins, "fixture", "package.json"), FixtureBundle.manifest({}, { name: "Fixture (dev)" }))
  const source = fileURLToPath(new URL("../../test-support/install/FixturePlugin.ts", import.meta.url))
  fs.writeFileSync(path.join(devPlugins, "fixture", "src", "index.ts"), `export { default } from ${JSON.stringify(source)}\n`)
  const nexus = await InstallTest.start({ devPlugins })
  t.after(() => nexus.dispose())
  const admin = await nexus.test.admin()

  const outcome = (await nexus.installZip(admin, await ZipFixture.plugin())).json<InstallOutcomeDto>()
  assert.equal(outcome.plugin.shadowedByDevelopment, true)
  const effective = (await admin.get("/api/plugins")).json<PluginPackageDto[]>().find(pkg => pkg.id === "fixture")
  assert.equal(effective?.source, "development")
  assert.equal(effective?.name, "Fixture (dev)")

  assert.equal((await admin.delete("/api/plugin-packages/fixture")).statusCode, 204)
  assert.equal((await admin.get("/api/plugins")).json<PluginPackageDto[]>().find(pkg => pkg.id === "fixture")?.source, "development")
})
