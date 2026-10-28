import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { test } from "node:test"
import type { LoxoneSignalDto, MiniserverDto } from "@lox-nexus/api"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { HistoryDatabase } from "../db/history/HistoryDatabase.ts"
import { TestApp } from "../test-support/TestApp.ts"
import { HistoryAssembly } from "./HistoryAssembly.ts"

const loxone = { source: { kind: "loxone" as const, id: "haus" } }

test("records the selected signals' values in history.db, keeps them across a rename, and purges deleted signals", { timeout: 10_000 }, async t => {
  const dir = TestApp.tempDir()
  let later = 0
  const app = await TestApp.start({ databaseFile: path.join(dir, "nexus.db"), clock: { now: () => Date.now() + later } })
  // a failed assertion must not leave the app running, which would keep the test run alive
  t.after(() => app.dispose())
  const admin = await app.admin()
  const ms = (await admin.post("/api/miniservers", { slug: "haus", label: "Haus", host: "127.0.0.1", port: 1, listenPort: 2, ownId: "nexus", remoteId: "ms", enabled: false })).json<MiniserverDto>()
  const add = async (packetId: string) => (await admin.post(`/api/miniservers/${ms.id}/signals`, { packetId, direction: "in", dataType: 1, label: packetId })).json<LoxoneSignalDto>()
  const [temp, other] = [await add("temp"), await add("other")]
  const { bus, history, selections } = app.app
  // the values below come within a second; keep each one, not only the latest
  history.settings.update({ rawMinIntervalMs: 0 })
  bus.publish(temp.topic, Value.number(1), loxone)
  selections.setRule(HistoryAssembly.CONSUMER, { signalId: temp.id }, true)
  bus.publish(temp.topic, Value.number(21), loxone)
  bus.publish(other.topic, Value.number(5), loxone)
  // a rename moves the value to the new topic as a replay, which is not recorded again
  const config = { slug: "home", label: "Haus", host: "127.0.0.1", port: 1, listenPort: 2, ownId: "nexus", remoteId: "ms", enabled: false }
  assert.equal((await admin.put(`/api/miniservers/${ms.id}`, config)).statusCode, 200)
  bus.publish("loxone/home/in/temp", Value.number(22), loxone)
  assert.equal(history.recorder.flush(true), true)
  assert.deepEqual(history.store.seriesIds(), [temp.id], "only the selected signal")
  const values = history.database.db.all<{ num: number }>("SELECT num FROM samples ORDER BY ts").map(row => row.num)
  assert.deepEqual(values, [21, 22], "kept across the rename; the replay of 21 to the new topic is not recorded again")
  // the history goes once the signal is deleted from the configuration
  assert.equal((await admin.delete(`/api/miniservers/${ms.id}/signals/${temp.id}`)).statusCode, 204)
  assert.deepEqual(selections.of(HistoryAssembly.CONSUMER).rules, [], "the rule went with the signal, also from the cache")
  // gone from the configuration for longer than the grace period
  history.retention.run()
  later = 2 * 60 * 60_000
  history.retention.run()
  later = 0
  assert.deepEqual(history.store.seriesIds(), [])
  // renamed along with the Miniserver
  bus.publish("loxone/home/in/other", Value.number(6), loxone)
  selections.setMode(HistoryAssembly.CONSUMER, "all")
  bus.publish("loxone/home/in/other", Value.number(7), loxone)
  await app.dispose()
  // dispose wrote the last value and the open buckets into the file next to nexus.db
  const reopened = new HistoryDatabase(path.join(dir, "history.db"))
  const rows = reopened.db.all<{ signal_id: string; num: number }>("SELECT signal_id, num FROM samples JOIN series ON series.id = samples.series")
  assert.deepEqual(rows.map(row => [row.signal_id, row.num]), [[other.id, 7]])
  assert.equal(reopened.db.get<{ n: number }>("SELECT count(*) AS n FROM buckets")?.n, 2, "one bucket per width")
  reopened.close()
})

test("history settings fall back to the defaults, and an update applies at once", async () => {
  const app = await TestApp.start()
  const { settings } = app.app.history
  assert.deepEqual(settings.current, { enabled: true, rawDays: 7, fineDays: 90, coarseDays: 730, rawMinIntervalMs: 1000 })
  settings.update({ enabled: false, rawDays: 3 })
  assert.equal(app.app.persistence.settings.get("history") !== undefined, true)
  assert.deepEqual([settings.current.enabled, settings.current.rawDays, settings.current.fineDays], [false, 3, 90])
  assert.throws(() => settings.update({ rawDays: -1 }))
  await app.dispose()
})

test("a restart merges the open buckets; a history.db that can't be opened is moved aside", { timeout: 10_000 }, async t => {
  const dir = TestApp.tempDir()
  const lifetime = async (value: number) => {
    const app = await TestApp.start({ databaseFile: path.join(dir, "nexus.db") })
    t.after(() => app.dispose())
    const admin = app.app.persistence.users.count() === 0 ? await app.admin() : await app.login()
    let signal = (await admin.get("/api/signals")).json<Array<{ id: string; topic: string }>>()[0]
    if (!signal) {
      const ms = (await admin.post("/api/miniservers", { slug: "haus", label: "Haus", host: "127.0.0.1", port: 1, listenPort: 2, ownId: "nexus", remoteId: "ms", enabled: false })).json<MiniserverDto>()
      signal = (await admin.post(`/api/miniservers/${ms.id}/signals`, { packetId: "temp", direction: "in", dataType: 1, label: "temp" })).json<LoxoneSignalDto>()
      app.app.selections.setMode(HistoryAssembly.CONSUMER, "all")
    }
    app.app.bus.publish(signal.topic, Value.number(value), loxone)
    await app.dispose()
  }
  await lifetime(1)
  await lifetime(2)
  const reopened = new HistoryDatabase(path.join(dir, "history.db"))
  const hours = reopened.db.all<{ n: number }>("SELECT n FROM buckets WHERE width = 3600000")
  assert.deepEqual(hours.map(row => row.n), [2], "one hour bucket with both changes")
  assert.equal(reopened.db.get<{ n: number }>("SELECT count(*) AS n FROM runs")?.n, 2)
  reopened.close()
  fs.writeFileSync(path.join(dir, "history.db"), "not a database")
  fs.rmSync(path.join(dir, "history.db-wal"), { force: true })
  await lifetime(3)
  assert.ok(fs.readdirSync(dir).some(name => name.startsWith("history.db.broken-")))
})

