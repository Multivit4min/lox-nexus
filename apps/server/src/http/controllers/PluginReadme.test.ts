import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { test } from "node:test"
import type { InstallOutcomeDto, StagedInstallDto } from "@lox-nexus/api"
import { FixtureBundle } from "../../test-support/install/FixtureBundle.ts"
import { GitFixture } from "../../test-support/install/GitFixture.ts"
import { InstallTest } from "../../test-support/install/InstallTest.ts"
import { ZipFixture } from "../../test-support/install/ZipFixture.ts"
import { TestApp } from "../../test-support/TestApp.ts"

const README = "# Fixture\n\nWhat it does.\n"

test("an installed plugin's README comes from the version in use, whichever source and spelling it had", async t => {
  const root = TestApp.tempDir()
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const repo = new GitFixture(root)
  repo.commit({ "package.json": FixtureBundle.manifest(), "dist/plugin.js": await FixtureBundle.bundle(), "readme.md": README }, "v1.0.0")
  const nexus = await InstallTest.start()
  t.after(() => nexus.dispose())
  const admin = await nexus.test.admin()
  assert.equal((await admin.get("/api/plugin-packages/fixture/readme")).statusCode, 404, "nothing installed yet")
  assert.equal((await nexus.test.client().get("/api/plugin-packages/fixture/readme")).statusCode, 401)

  const fromGit = (await admin.post("/api/plugin-packages/stage/git", { url: repo.url, ref: "v1.0.0" })).json<StagedInstallDto>()
  await admin.post(`/api/plugin-packages/stage/${fromGit.stagingId}/confirm`, { expectedActive: null })
  assert.deepEqual((await admin.get("/api/plugin-packages/fixture/readme")).json(), { markdown: README })

  // version 2 from a ZIP without a README: the page shows none for it
  const zip = ZipFixture.zip({ "package.json": FixtureBundle.manifest({ version: "2.0.0" }), "dist/plugin.js": await FixtureBundle.bundle(2) })
  const fromZip = (await nexus.stageZip(admin, zip)).json<StagedInstallDto>()
  const updated = (await admin.post(`/api/plugin-packages/stage/${fromZip.stagingId}/confirm`, { expectedActive: "1.0.0" })).json<InstallOutcomeDto>()
  assert.equal(updated.plugin.active.version, "2.0.0")
  assert.equal((await admin.get("/api/plugin-packages/fixture/readme")).statusCode, 404)
})

test("a README from the local repository is kept; one above the limit is left out and the install goes on", async t => {
  const repository = TestApp.tempDir()
  t.after(() => fs.rmSync(repository, { recursive: true, force: true }))
  fs.mkdirSync(path.join(repository, "fixture", "dist"), { recursive: true })
  fs.writeFileSync(path.join(repository, "fixture", "package.json"), FixtureBundle.manifest())
  fs.writeFileSync(path.join(repository, "fixture", "dist", "plugin.js"), await FixtureBundle.bundle())
  fs.writeFileSync(path.join(repository, "fixture", "README.md"), README)
  const nexus = await InstallTest.start({ repository, limits: { readmeBytes: 64 } })
  t.after(() => nexus.dispose())
  const admin = await nexus.test.admin()
  const install = async () => {
    const staged = (await admin.post("/api/plugin-packages/stage/local", { folder: "fixture" })).json<StagedInstallDto>()
    const confirmed = await admin.post(`/api/plugin-packages/stage/${staged.stagingId}/confirm`, { expectedActive: null })
    assert.equal(confirmed.statusCode, 200, confirmed.body)
  }
  await install()
  assert.deepEqual((await admin.get("/api/plugin-packages/fixture/readme")).json(), { markdown: README })

  await admin.delete("/api/plugin-packages/fixture")
  fs.writeFileSync(path.join(repository, "fixture", "README.md"), "x".repeat(65))
  await install()
  assert.equal((await admin.get("/api/plugin-packages/fixture/readme")).statusCode, 404)
})

test("a README edited in the local repository, the bundle unchanged, is offered and installed as an update", async t => {
  const repository = TestApp.tempDir()
  t.after(() => fs.rmSync(repository, { recursive: true, force: true }))
  fs.mkdirSync(path.join(repository, "fixture", "dist"), { recursive: true })
  fs.writeFileSync(path.join(repository, "fixture", "package.json"), FixtureBundle.manifest())
  fs.writeFileSync(path.join(repository, "fixture", "dist", "plugin.js"), await FixtureBundle.bundle())
  fs.writeFileSync(path.join(repository, "fixture", "README.md"), README)
  const nexus = await InstallTest.start({ repository })
  t.after(() => nexus.dispose())
  const admin = await nexus.test.admin()
  const listed = async () => (await admin.get("/api/plugin-packages/repository")).json<Array<{ folder: string; version?: string }>>().find(p => p.folder === "fixture")?.version
  const install = async (expectedActive: string | null) => {
    const staged = (await admin.post("/api/plugin-packages/stage/local", { folder: "fixture" })).json<StagedInstallDto>()
    const confirmed = await admin.post(`/api/plugin-packages/stage/${staged.stagingId}/confirm`, { expectedActive })
    assert.equal(confirmed.statusCode, 200, confirmed.body)
  }
  const first = await listed()
  await install(null)
  fs.writeFileSync(path.join(repository, "fixture", "README.md"), "# Fixture\n\nNow with more to say.\n")
  const second = await listed()
  assert.notEqual(second, first, "a new version to offer")
  await install(first!)
  assert.deepEqual((await admin.get("/api/plugin-packages/fixture/readme")).json(), { markdown: "# Fixture\n\nNow with more to say.\n" })
})

