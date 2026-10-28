import assert from "node:assert/strict"
import { after, before, describe, test } from "node:test"
import type { ConfigExport, HistorySeriesDto, HistoryStatsDto, LoxoneSignalDto, MiniserverDto, SelectionDto } from "@lox-nexus/api"
import { Value } from "@lox-nexus/plugin-sdk/values"
import type { ApiClient } from "../../test-support/ApiClient.ts"
import { TestApp } from "../../test-support/TestApp.ts"

const loxone = { source: { kind: "loxone" as const, id: "haus" } }

describe("history and selections API", { timeout: 10_000 }, () => {
  let app: TestApp
  let admin: ApiClient
  let ms: MiniserverDto
  let temp: LoxoneSignalDto
  let other: LoxoneSignalDto
  const series = (id: string, query: string) => admin.get(`/api/history/signals/${id}?${query}`)
  // values one second apart; the store keeps one per millisecond
  let now = Date.now()

  before(async () => {
    app = await TestApp.start({ clock: { now: () => now } })
    admin = await app.admin()
    ms = (await admin.post("/api/miniservers", { slug: "haus", label: "Haus", host: "127.0.0.1", port: 1, listenPort: 2, ownId: "nexus", remoteId: "ms", enabled: false })).json<MiniserverDto>()
    const add = async (packetId: string) => (await admin.post(`/api/miniservers/${ms.id}/signals`, { packetId, direction: "in", dataType: 1, label: packetId })).json<LoxoneSignalDto>()
    temp = await add("temp")
    other = await add("other")
    assert.equal((await admin.put("/api/history/settings", { rawMinIntervalMs: 0 })).json<{ rawDays: number }>().rawDays, 7, "fields left out keep their value")
  })
  after(() => app.dispose())

  test("selections: nothing until chosen; rules in bulk, all or none", async () => {
    assert.deepEqual((await admin.get("/api/selections/history")).json<SelectionDto>(), { consumer: "history", mode: "selected", rules: [] })
    assert.deepEqual((await admin.get("/api/history/recorded")).json(), [])
    const refused = await admin.put("/api/selections/history/rules", [{ target: { signalId: temp.id }, include: true }, { target: { signalId: "nope" }, include: true }])
    assert.equal(refused.statusCode, 400)
    assert.deepEqual((await admin.get("/api/selections/history")).json<SelectionDto>().rules, [], "nothing of a refused update")
    const set = await admin.put("/api/selections/history/rules", [{ target: { signalId: temp.id }, include: true }])
    assert.deepEqual(set.json<SelectionDto>().rules, [{ target: { signalId: temp.id }, include: true }])
    assert.deepEqual((await admin.get("/api/history/recorded")).json(), [temp.id])
    assert.equal((await admin.get("/api/selections/nope")).statusCode, 404)
    assert.equal((await admin.put("/api/selections/history/mode", { mode: "some" })).statusCode, 400)
  })

  test("a range of every change, the value before it, and buckets once there are too many changes", async () => {
    const start = now
    for (let i = 0; i < 60; i++) {
      now += 1000
      app.app.bus.publish(temp.topic, Value.number(i), loxone)
    }
    app.app.bus.publish(other.topic, Value.number(1), loxone)
    assert.equal(app.app.history.recorder.flush(true), true)
    const raw = (await series(temp.id, `from=${start - 1000}&to=${now + 1000}&points=20`)).json<HistorySeriesDto>()
    assert.equal(raw.resolution, "raw")
    assert.equal(raw.points.length, 60)
    const fewer = (await series(temp.id, `from=${start - 1000}&to=${now + 1000}&points=10`)).json<HistorySeriesDto>()
    assert.equal(fewer.resolution, "5m", "60 changes are more than 4 x 10 points")
    const buckets = fewer.resolution === "5m" ? fewer.points : []
    // the minute may cross a 5-minute boundary
    assert.deepEqual([Math.min(...buckets.map(b => b.min!)), Math.max(...buckets.map(b => b.max!)), buckets.at(-1)?.last], [0, 59, 59])
    assert.equal(buckets.reduce((sum, b) => sum + b.n, 0), 60)
    const later = (await series(temp.id, `from=${now + 1}&to=${now + 60_000}`)).json<HistorySeriesDto>()
    assert.deepEqual([later.points.length, later.before?.v], [0, 59], "an empty range still knows the value before it")
    assert.deepEqual((await series(other.id, `from=0&to=${now + 1000}`)).json<HistorySeriesDto>().points, [], "not recorded")
  })

  test("refuses bad ranges and unknown signals; deletes a signal's history; reports stats", async () => {
    assert.equal((await series(temp.id, "from=10&to=5")).statusCode, 400)
    assert.equal((await series("nope", "from=0&to=5")).statusCode, 404)
    const stats = (await admin.get("/api/history/stats")).json<HistoryStatsDto>()
    assert.deepEqual([stats.enabled, stats.series, stats.recorded, stats.lastHour.raw, stats.dropped], [true, 1, 1, 60, 0])
    assert.ok(stats.projectedBytes! > 0)
    assert.equal((await admin.delete(`/api/history/signals/${temp.id}`)).statusCode, 204)
    // the recorder held nothing of it any more, so a flush doesn't bring it back
    app.app.history.recorder.flush(true)
    assert.equal((await admin.get("/api/history/stats")).json<HistoryStatsDto>().lastHour.raw, 0)
    assert.equal((await admin.put("/api/history/settings", { rawDays: -1 })).statusCode, 400)
    assert.equal((await admin.put("/api/selections/history/rules", [{ target: { signalId: temp.id, miniserverId: ms.id }, include: true }])).statusCode, 400)
    assert.equal((await admin.put("/api/selections/history/rules", [{ target: { signalId: temp.id } }])).statusCode, 400)
    // switched off, the selection still says what will be recorded, so the record switches work
    await admin.put("/api/history/settings", { enabled: false })
    assert.deepEqual((await admin.get("/api/history/recorded")).json(), [temp.id])
    await admin.put("/api/history/settings", { enabled: true })
  })

  test("an import of a file without the record choice keeps the current rules on its signals", async () => {
    const exported = (await admin.get("/api/config/export")).json<ConfigExport>()
    const { selections, ...older } = exported
    assert.ok(selections)
    assert.equal((await admin.post("/api/config/import", older)).statusCode, 200)
    assert.deepEqual((await admin.get("/api/history/recorded")).json(), [temp.id])
  })

  test("the record choice travels with the config export and comes back with an import", async () => {
    await admin.put("/api/selections/history/rules", [{ target: { miniserverId: ms.id }, include: false }])
    const exported = (await admin.get("/api/config/export")).json<ConfigExport>()
    assert.deepEqual(exported.selections?.history?.rules.length, 2)
    const imported = await admin.post("/api/config/import", exported)
    assert.equal(imported.statusCode, 200, imported.body)
    const after = (await admin.get("/api/selections/history")).json<SelectionDto>()
    assert.deepEqual(after.rules.map(rule => rule.include).sort(), [false, true], "the deletion removed them; the import restored them")
    assert.deepEqual((await admin.get("/api/history/recorded")).json(), [temp.id])
  })
})
