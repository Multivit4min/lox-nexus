import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { test } from "node:test"
import type { BatchOutcomeDto, BatchReviewDto, PluginUpdatesDto, StagedInstallDto } from "@lox-nexus/api"
import type { ApiClient } from "../../test-support/ApiClient.ts"
import { FixtureBundle } from "../../test-support/install/FixtureBundle.ts"
import { InstallTest } from "../../test-support/install/InstallTest.ts"
import { TestApp } from "../../test-support/TestApp.ts"

/** a plugin folder in the local repository: package.json and its bundle */
async function write(repository: string, folder: string, id: string, bundle: Buffer) {
  fs.mkdirSync(path.join(repository, folder, "dist"), { recursive: true })
  fs.writeFileSync(path.join(repository, folder, "package.json"), FixtureBundle.manifest({}, { id, name: `Plugin ${id}` }))
  fs.writeFileSync(path.join(repository, folder, "dist", "plugin.js"), bundle)
}

async function install(admin: ApiClient, folder: string) {
  const staged = (await admin.post("/api/plugin-packages/stage/local", { folder })).json<StagedInstallDto>()
  const confirmed = await admin.post(`/api/plugin-packages/stage/${staged.stagingId}/confirm`, { expectedActive: null })
  assert.equal(confirmed.statusCode, 200, confirmed.body)
}

test("updates from the local repository are listed, reviewed together and installed with one confirmation", async t => {
  const repository = TestApp.tempDir()
  t.after(() => fs.rmSync(repository, { recursive: true, force: true }))
  const v1 = await FixtureBundle.bundle()
  await write(repository, "first", "first", v1)
  await write(repository, "second", "second", v1)
  const nexus = await InstallTest.start({ repository })
  t.after(() => nexus.dispose())
  const admin = await nexus.test.admin()
  await install(admin, "first")
  await install(admin, "second")
  const updates = async () => (await admin.get("/api/plugin-packages/updates")).json<PluginUpdatesDto>()
  assert.deepEqual((await updates()).updates, [], "nothing newer right after installing")

  // a rebuild with the same version is an update too: that is what a changed first-party plugin looks like
  await write(repository, "first", "first", await FixtureBundle.bundle(2))
  await write(repository, "second", "second", Buffer.concat([v1, Buffer.from("\n// rebuilt\n")]))
  assert.deepEqual((await updates()).updates.map(update => [update.id, update.source]), [["first", "local"], ["second", "local"]])

  const reviewed = await admin.post("/api/plugin-packages/batch", { ids: ["first", "second", "missing"] })
  assert.equal(reviewed.statusCode, 201, reviewed.body)
  const review = reviewed.json<BatchReviewDto>()
  assert.deepEqual(review.items.map(item => [item.id, !!item.to, item.problem]), [["first", true, undefined], ["second", true, undefined], ["missing", false, "not installed"]])
  assert.deepEqual(review.items[0]?.impact?.instances, [], "the impact on instances comes with the review")
  assert.deepEqual(nexus.staged(), [], "the review leaves nothing staged")

  // changed again after the review: installed only if it is still what was reviewed
  await write(repository, "second", "second", Buffer.concat([v1, Buffer.from("\n// changed again\n")]))
  const confirmed = await admin.post(`/api/plugin-packages/batch/${review.batchId}/confirm`, {})
  assert.equal(confirmed.statusCode, 200, confirmed.body)
  const outcome = confirmed.json<BatchOutcomeDto>()
  assert.deepEqual(outcome.items.map(item => [item.id, item.ok]), [["first", true], ["second", false]])
  assert.match(outcome.items[1]?.error ?? "", /changed in the local repository since the review/)
  assert.deepEqual((await updates()).updates.map(update => update.id), ["second"])
  assert.equal((await admin.post(`/api/plugin-packages/batch/${review.batchId}/confirm`, {})).statusCode, 404, "a review is confirmed once")
})

test("a review keeps someone else's pending install; nothing to update gives no batch; an uninstalled plugin fails at confirm", async t => {
  const repository = TestApp.tempDir()
  t.after(() => fs.rmSync(repository, { recursive: true, force: true }))
  await write(repository, "first", "first", await FixtureBundle.bundle())
  await write(repository, "other", "other", await FixtureBundle.bundle())
  const nexus = await InstallTest.start({ repository })
  t.after(() => nexus.dispose())
  const admin = await nexus.test.admin()
  await install(admin, "first")

  const nothing = (await admin.post("/api/plugin-packages/batch", { ids: ["first"] })).json<BatchReviewDto>()
  assert.equal(nothing.batchId, undefined, "no batch to confirm when no plugin can be updated")
  assert.match(nothing.items[0]?.problem ?? "", /no newer version/)

  // another admin is reviewing a new install meanwhile
  const pending = (await admin.post("/api/plugin-packages/stage/local", { folder: "other" })).json<StagedInstallDto>()
  await write(repository, "first", "first", await FixtureBundle.bundle(2))
  const review = (await admin.post("/api/plugin-packages/batch", { ids: ["first"] })).json<BatchReviewDto>()
  assert.ok(review.batchId)
  assert.equal((await admin.delete(`/api/plugin-packages/stage/${pending.stagingId}`)).statusCode, 204, "the review didn't replace the pending install")

  assert.equal((await admin.delete("/api/plugin-packages/first")).statusCode, 204)
  const outcome = (await admin.post(`/api/plugin-packages/batch/${review.batchId}/confirm`, {})).json<BatchOutcomeDto>()
  assert.deepEqual(outcome.items.map(item => [item.id, item.ok]), [["first", false]])
  assert.match(outcome.items[0]?.error ?? "", /changed since it was checked/)
})
