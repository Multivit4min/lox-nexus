import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { test } from "node:test"
import type { InstallOutcomeDto, RepositoryPluginDto, StagedInstallDto } from "@lox-nexus/api"
import { FixtureBundle } from "../../test-support/install/FixtureBundle.ts"
import { GitFixture } from "../../test-support/install/GitFixture.ts"
import { InstallTest } from "../../test-support/install/InstallTest.ts"
import { ZipFixture } from "../../test-support/install/ZipFixture.ts"
import { TestApp } from "../../test-support/TestApp.ts"

test("the same plugin from git and from a ZIP is the same install", async t => {
  const root = TestApp.tempDir()
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const repo = new GitFixture(root)
  const commit = repo.commit({ "package.json": FixtureBundle.manifest(), "dist/plugin.js": await FixtureBundle.bundle() }, "v1.0.0")
  const nexus = await InstallTest.start()
  t.after(() => nexus.dispose())
  const admin = await nexus.test.admin()

  const fromGit = await admin.post("/api/plugin-packages/stage/git", { url: repo.url, ref: "v1.0.0" })
  assert.equal(fromGit.statusCode, 201, fromGit.body)
  const review = fromGit.json<StagedInstallDto>()
  assert.deepEqual(review.source, { kind: "git", url: repo.url, ref: "v1.0.0", commit })
  const installed = (await admin.post(`/api/plugin-packages/stage/${review.stagingId}/confirm`, { expectedActive: null })).json<InstallOutcomeDto>()
  assert.deepEqual(installed.plugin.active.source, review.source)

  const fromZip = (await nexus.stageZip(admin, await ZipFixture.plugin())).json<StagedInstallDto>()
  assert.equal(fromZip.bundleSha256, review.bundleSha256)
  assert.equal(fromZip.sameAsInstalled, true)
  assert.equal(fromZip.installedVersion, "1.0.0")
  const again = (await admin.post(`/api/plugin-packages/stage/${fromZip.stagingId}/confirm`, { expectedActive: "1.0.0" })).json<InstallOutcomeDto>()
  // nothing changed: the git install stays what is recorded
  assert.equal(again.plugin.active.source.kind, "git")

  assert.equal((await admin.post("/api/plugin-packages/stage/git", { url: "ext::sh -c touch% /tmp/x", ref: "main" })).statusCode, 400)
  assert.equal((await admin.post("/api/plugin-packages/stage/git", { url: repo.url, ref: "--upload-pack=x" })).statusCode, 400)
})

test("the local repository lists its plugins and installs them by folder name", async t => {
  const repository = TestApp.tempDir()
  t.after(() => fs.rmSync(repository, { recursive: true, force: true }))
  fs.mkdirSync(path.join(repository, "fixture", "dist"), { recursive: true })
  fs.writeFileSync(path.join(repository, "fixture", "package.json"), FixtureBundle.manifest())
  fs.writeFileSync(path.join(repository, "fixture", "dist", "plugin.js"), await FixtureBundle.bundle())
  fs.mkdirSync(path.join(repository, "unbuilt"))
  fs.writeFileSync(path.join(repository, "unbuilt", "package.json"), FixtureBundle.manifest({}, { id: "unbuilt", name: "Unbuilt" }))
  fs.mkdirSync(path.join(repository, "linked", "dist"), { recursive: true })
  fs.writeFileSync(path.join(repository, "linked", "package.json"), FixtureBundle.manifest({}, { id: "linked", name: "Linked" }))
  fs.symlinkSync("/etc/hostname", path.join(repository, "linked", "dist", "plugin.js"))
  // a symlinked folder inside the plugin leads elsewhere even though the bundle itself is a plain file
  const outside = TestApp.tempDir()
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }))
  fs.writeFileSync(path.join(outside, "plugin.js"), "export default 1")
  fs.mkdirSync(path.join(repository, "escaping"))
  fs.writeFileSync(path.join(repository, "escaping", "package.json"), FixtureBundle.manifest({}, { id: "escaping", name: "Escaping" }))
  fs.symlinkSync(outside, path.join(repository, "escaping", "dist"))
  fs.mkdirSync(path.join(repository, "not-a-plugin"))
  fs.writeFileSync(path.join(repository, "not-a-plugin", "package.json"), "{\"name\":\"x\"}")
  const nexus = await InstallTest.start({ repository })
  t.after(() => nexus.dispose())
  const admin = await nexus.test.admin()

  const listed = (await admin.get("/api/plugin-packages/repository")).json<RepositoryPluginDto[]>()
  assert.deepEqual(listed.map(plugin => plugin.folder), ["escaping", "fixture", "linked", "unbuilt"])
  assert.equal(listed[1]?.problem, undefined)
  assert.match(listed[3]?.problem ?? "", /not built/)
  const escaping = await admin.post("/api/plugin-packages/stage/local", { folder: "escaping" })
  assert.equal(escaping.statusCode, 400)
  assert.match(escaping.json<{ error: string }>().error, /leads out of the plugin's folder/)
  assert.doesNotMatch(escaping.body, new RegExp(outside))

  const linked = await admin.post("/api/plugin-packages/stage/local", { folder: "linked" })
  assert.equal(linked.statusCode, 400)
  assert.match(linked.json<{ error: string }>().error, /plain file/)
  assert.equal((await admin.post("/api/plugin-packages/stage/local", { folder: "../etc" })).statusCode, 404)
  assert.equal((await admin.post("/api/plugin-packages/stage/local", { folder: "unbuilt" })).statusCode, 400)

  const staged = (await admin.post("/api/plugin-packages/stage/local", { folder: "fixture" })).json<StagedInstallDto>()
  assert.deepEqual(staged.source, { kind: "local", folder: path.join(repository, "fixture") })
  assert.equal((await admin.post(`/api/plugin-packages/stage/${staged.stagingId}/confirm`, { expectedActive: null })).statusCode, 200)
  assert.equal((await admin.get("/api/plugin-packages/repository")).json<RepositoryPluginDto[]>()[1]?.installedVersion, "1.0.0")
})

test("one operation at a time; a stale review, a discarded or replaced stage can't be confirmed", async t => {
  const nexus = await InstallTest.start()
  t.after(() => nexus.dispose())
  const admin = await nexus.test.admin()
  const zip = await ZipFixture.plugin()

  const both = await Promise.all([nexus.stageZip(admin, zip), nexus.stageZip(admin, zip)])
  assert.deepEqual(both.map(response => response.statusCode).sort(), [201, 409])

  const first = (await nexus.stageZip(admin, zip)).json<StagedInstallDto>()
  const second = (await nexus.stageZip(admin, zip)).json<StagedInstallDto>()
  // staging again discarded the first
  assert.equal((await admin.post(`/api/plugin-packages/stage/${first.stagingId}/confirm`, { expectedActive: null })).statusCode, 404)
  const stale = await admin.post(`/api/plugin-packages/stage/${second.stagingId}/confirm`, { expectedActive: "0.9.0" })
  assert.equal(stale.statusCode, 409)
  assert.match(stale.json<{ error: string }>().error, /check it again/)

  const third = (await nexus.stageZip(admin, zip)).json<StagedInstallDto>()
  assert.equal((await admin.delete(`/api/plugin-packages/stage/${third.stagingId}`)).statusCode, 204)
  assert.equal((await admin.delete(`/api/plugin-packages/stage/${third.stagingId}`)).statusCode, 404)
  assert.equal((await admin.post(`/api/plugin-packages/stage/${third.stagingId}/confirm`, { expectedActive: null })).statusCode, 404)
  assert.equal((await admin.post("/api/plugin-packages/stage/not-a-uuid/confirm", { expectedActive: null })).statusCode, 400)
  assert.deepEqual(nexus.staged(), [])
})
