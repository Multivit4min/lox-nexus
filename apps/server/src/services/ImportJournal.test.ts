import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import { test } from "node:test"
import { ConfigExportSchema } from "@lox-nexus/api"
import { TestApp } from "../test-support/TestApp.ts"
import { ImportJournal } from "./ImportJournal.ts"

test("an import cut off in the middle is undone at the next start, passwords included", async t => {
  const dir = TestApp.tempDir()
  const databaseFile = path.join(dir, "nexus.db")
  const first = await TestApp.start({ databaseFile })
  t.after(() => first.dispose())
  const admin = await first.admin()
  const ms = (await admin.post("/api/miniservers", {
    slug: "haus", label: "Haus", host: "127.0.0.1", port: 7000, listenPort: 7001, ownId: "nexus", remoteId: "ms", enabled: false, password: "secret"
  })).json<{ id: string }>()
  await admin.post(`/api/miniservers/${ms.id}/signals`, { packetId: "a", direction: "in", dataType: 1, label: "A" })
  const exported = ConfigExportSchema.parse((await admin.get("/api/config/export")).json())
  assert.equal((await admin.post("/api/config/import", exported)).statusCode, 200)
  assert.equal(fs.existsSync(path.join(dir, "import-in-progress.json")), false, "a finished import leaves no journal")
  await first.dispose()

  // as if Nexus died after the import had written its journal and cleared the configuration
  ImportJournal.in(dir).write({ backup: exported, passwords: new Map([[ms.id, "secret"]]) })
  const db = new DatabaseSync(databaseFile)
  db.exec("PRAGMA foreign_keys = ON; DELETE FROM signals; DELETE FROM miniservers")
  db.close()

  const second = await TestApp.start({ databaseFile })
  t.after(() => second.dispose())
  const restored = second.app.miniservers.get(ms.id)
  assert.equal(restored?.config.label, "Haus")
  assert.equal(restored?.config.password, "secret")
  assert.deepEqual(second.app.signals.list().map(s => s.topic), ["loxone/haus/in/a"])
  assert.equal(fs.existsSync(path.join(dir, "import-in-progress.json")), false)
})

test("an unreadable journal is left alone and doesn't stop the start", async t => {
  const dir = TestApp.tempDir()
  fs.writeFileSync(path.join(dir, "import-in-progress.json"), "{ not json")
  const app = await TestApp.start({ databaseFile: path.join(dir, "nexus.db") })
  t.after(() => app.dispose())
  assert.equal(fs.readFileSync(path.join(dir, "import-in-progress.json"), "utf8"), "{ not json")
})
