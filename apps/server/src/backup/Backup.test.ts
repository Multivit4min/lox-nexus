import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { test } from "node:test"
import type { MiniserverDto, RestoreApplyDto, RestoreStatusDto } from "@lox-nexus/api"
import { PluginDirectory } from "../plugins/install/PluginDirectory.ts"
import { TestApp } from "../test-support/TestApp.ts"

test("a backup restores the installation as it was, only once restoring was asked for", { timeout: 30_000 }, async t => {
  const dir = TestApp.tempDir()
  const start = () => TestApp.start({ databaseFile: path.join(dir, "nexus.db") }, { NEXUS_DATA_DIR: dir })
  let app = await start()
  t.after(() => app.dispose())
  let admin = await app.admin()
  // an installed plugin: its row travels in nexus.db, its files with the backup
  const bundle = path.join(dir, "plugins", "demo", "1.0.0", "plugin.js")
  fs.mkdirSync(path.dirname(bundle), { recursive: true })
  fs.writeFileSync(bundle, "export default 1")
  app.app.persistence.pluginPackages.insert({
    pluginId: "demo", version: "1.0.0", name: "Demo", entry: "plugin.js", source: { kind: "local", folder: "/x" },
    bundleSha256: await PluginDirectory.sha256(bundle), description: "{}", installedAt: 1, installedBy: "admin"
  })
  const create = (slug: string) => admin.post("/api/miniservers", { slug, label: slug, host: "127.0.0.1", port: 1, listenPort: 2, ownId: "a", remoteId: slug, password: "ms-secret", enabled: false })
  const slugs = async () => (await admin.get("/api/miniservers")).json<MiniserverDto[]>().map(ms => ms.slug)
  await create("before")
  assert.equal((await admin.post("/api/backup", { passphrase: "short" })).statusCode, 400)
  // the browser posts a plain form
  const backup = await admin.post("/api/backup", "passphrase=correct%20horse%20battery&history=on", { "content-type": "application/x-www-form-urlencoded" })
  assert.equal(backup.statusCode, 200, backup.body)
  assert.match(String(backup.headers["content-disposition"]), /attachment; filename="lox-nexus-backup-.*\.nxbackup"/)
  const file = backup.rawPayload
  assert.ok(!file.includes(Buffer.from("ms-secret")), "the Miniserver password is encrypted")
  const leftovers = () => fs.readdirSync(dir).filter(name => name.startsWith(".backup-"))
  for (let i = 0; i < 500 && leftovers().length > 0; i++) await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(leftovers(), [], "temporary copies are gone once the download ended")
  assert.equal((await create("after")).statusCode, 201)
  fs.rmSync(path.join(dir, "plugins", "demo"), { recursive: true })
  const upload = (bytes: Buffer, passphrase = "correct horse battery") =>
    admin.post("/api/backup/restore", bytes, { "content-type": "application/octet-stream", "x-backup-passphrase": encodeURIComponent(passphrase) })
  assert.equal((await upload(file, "wrong horse battery")).statusCode, 400)
  const tampered = Buffer.from(file)
  tampered.writeUInt8(tampered.readUInt8(tampered.length - 1) ^ 1, tampered.length - 1)
  assert.equal((await upload(tampered)).statusCode, 400, "a changed tag is refused after the whole file was unpacked")
  assert.equal((await admin.get("/api/backup/restore")).json<RestoreStatusDto>().pending, null, "and nothing was kept")
  assert.equal((await upload(file)).statusCode, 200)
  const status = (await admin.get("/api/backup/restore")).json<RestoreStatusDto>()
  assert.deepEqual([status.pending?.manifest.history, status.pending?.manifest.plugins, status.pending?.applying, status.canRestart], [true, ["demo/1.0.0"], false, false])
  // a restart (an update, a power cut) doesn't apply a backup that was only checked
  await app.dispose()
  app = await start()
  admin = await app.login()
  assert.deepEqual(await slugs(), ["after", "before"])
  const applied = await admin.post("/api/backup/restore/apply")
  assert.deepEqual([applied.statusCode, applied.json<RestoreApplyDto>()], [200, { restarting: false }], "tests can't restart in-process")
  assert.equal((await admin.get("/api/backup/restore")).json<RestoreStatusDto>().pending?.applying, true)
  await app.dispose()
  app = await start()
  admin = await app.login()
  assert.deepEqual(await slugs(), ["before"])
  assert.equal((await admin.get("/api/miniservers")).json<MiniserverDto[]>()[0]?.hasPassword, true)
  assert.equal(fs.readFileSync(bundle, "utf8"), "export default 1")
  assert.ok(fs.readdirSync(dir).some(name => name.startsWith("before-restore-")))
  assert.equal((await admin.get("/api/backup/restore")).json<RestoreStatusDto>().pending, null)
})
