import assert from "node:assert/strict"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import { test } from "node:test"
import type { UnloadableRowDto } from "@lox-nexus/api"
import { TestApp } from "../test-support/TestApp.ts"

test("rows that can't be loaded are listed with the reason and can be deleted", async t => {
  const databaseFile = path.join(TestApp.tempDir(), "nexus.db")
  const first = await TestApp.start({ databaseFile })
  t.after(() => first.dispose())
  const admin = await first.admin()
  const miniserver = (body: object) => admin.post("/api/miniservers", { host: "127.0.0.1", ownId: "nexus", remoteId: "ms", enabled: false, ...body })
  const haus = (await miniserver({ slug: "haus", label: "Haus", port: 7000, listenPort: 7001 })).json<{ id: string }>()
  const garage = (await miniserver({ slug: "garage", label: "Garage", port: 7002, listenPort: 7003 })).json<{ id: string }>()
  const signal = async (packetId: string) => (await admin.post(`/api/miniservers/${haus.id}/signals`, { packetId, direction: "in", dataType: 1, label: packetId.toUpperCase() })).json<{ id: string }>()
  const broken = await signal("a")
  const fine = await signal("b")
  await first.dispose()

  // as if a newer version had written values this one doesn't know
  const db = new DatabaseSync(databaseFile)
  db.prepare("UPDATE miniservers SET port = 0 WHERE id = ?").run(garage.id)
  db.prepare("UPDATE loxone_signals SET data_type = 99 WHERE id = ?").run(broken.id)
  db.close()

  const second = await TestApp.start({ databaseFile })
  t.after(() => second.dispose())
  const client = await second.login()
  const rows = (await client.get("/api/miniservers/unloadable")).json<UnloadableRowDto[]>()
  assert.deepEqual(rows.map(({ error, ...row }) => ({ ...row, hasReason: error.length > 0 })).sort((a, b) => a.label.localeCompare(b.label)), [
    { kind: "signal", id: broken.id, miniserverId: haus.id, label: "A", hasReason: true },
    { kind: "miniserver", id: garage.id, label: "Garage", hasReason: true }
  ])
  assert.deepEqual((await client.get("/api/miniservers")).json<Array<{ id: string }>>().map(m => m.id), [haus.id])
  assert.deepEqual((await client.get(`/api/miniservers/${haus.id}/signals`)).json<Array<{ id: string }>>().map(s => s.id), [fine.id])

  assert.equal((await client.delete(`/api/miniservers/${haus.id}/signals/${broken.id}`)).statusCode, 204)
  assert.equal((await client.delete(`/api/miniservers/${garage.id}`)).statusCode, 204)
  assert.deepEqual((await client.get("/api/miniservers/unloadable")).json(), [])
  assert.equal((await client.delete(`/api/miniservers/${garage.id}`)).statusCode, 404, "gone from the database too")
  await second.dispose()

  const third = await TestApp.start({ databaseFile })
  t.after(() => third.dispose())
  const again = await third.login()
  assert.deepEqual((await again.get("/api/miniservers/unloadable")).json(), [])
})
