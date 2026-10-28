import assert from "node:assert/strict"
import { test } from "node:test"
import { HistoryDatabase } from "./HistoryDatabase.ts"
import { HistoryRepository } from "./HistoryRepository.ts"

const run = { started: 1, seen: 2 }
const sample = (signalId: string, ts: number, num: number) => ({ signalId, valueType: "number", ts, num, text: null, flags: 0 })
const part = (start: number, min: number, max: number, wsum: number, wdur: number, last: number, flags = 0) =>
  ({ signalId: "temp", valueType: "number", width: 300_000, start, min, max, wsum, wdur, n: 1, last, flags })

function open() {
  const database = new HistoryDatabase(":memory:")
  return { database, repo: new HistoryRepository(database.db) }
}

test("bucket parts merge into one bucket; samples in the same millisecond keep the later", () => {
  const { database, repo } = open()
  repo.write({ samples: [sample("temp", 10, 1), sample("temp", 10, 2)], buckets: [part(0, 4, 6, 100, 10, 6)], run })
  repo.write({ samples: [], buckets: [part(0, 2, 5, 50, 5, 5, 1), { ...part(0, 0, 0, 0, 0, 0), min: null, max: null, last: null }], run: { started: 1, seen: 9 } })
  const bucket = database.db.get<Record<string, number | null>>("SELECT min, max, wsum, wdur, n, last, flags FROM buckets")
  assert.deepEqual({ ...bucket }, { min: 2, max: 6, wsum: 150, wdur: 15, n: 3, last: null, flags: 1 }, "a part without values keeps min and max")
  assert.deepEqual(database.db.all<{ num: number }>("SELECT num FROM samples").map(r => ({ ...r })), [{ num: 2 }])
  assert.deepEqual({ ...database.db.get<{ started: number; seen: number }>("SELECT started, seen FROM runs") }, { started: 1, seen: 9 })
  database.close()
})

test("prune deletes old rows per tier in chunks; purge removes a signal's history and its series", () => {
  const { database, repo } = open()
  const old = Array.from({ length: 5 }, (_, i) => sample("a", i, i))
  repo.write({ samples: [...old, sample("a", 100, 0), sample("b", 1, 0)], buckets: [part(0, 1, 1, 0, 0, 1)], run })
  assert.equal(repo.prune("raw", 50, 4), 4, "stops at the chunk size")
  assert.equal(repo.prune("raw", 50, 4), 2, "the rest, of both series")
  assert.equal(repo.prune(300_000, 1, 10), 1)
  assert.deepEqual(database.db.all<{ ts: number }>("SELECT ts FROM samples").map(r => r.ts), [100])
  assert.deepEqual(repo.seriesIds().sort(), ["a", "b", "temp"])
  assert.equal(repo.purge("a", 10), 1)
  assert.deepEqual(repo.seriesIds().sort(), ["b", "temp"])
  repo.write({ samples: [sample("a", 200, 1)], buckets: [], run })
  assert.deepEqual(database.db.all<{ ts: number }>("SELECT ts FROM samples").map(r => r.ts), [200], "a purged signal starts a new series")
  database.close()
})

test("a failed write stores nothing, and the next one still finds its series", () => {
  const { database, repo } = open()
  assert.throws(() => repo.write({ samples: [sample("x", 1, 1)], buckets: [{ ...part(0, 1, 1, 0, 0, 1), wsum: null as unknown as number }], run }))
  repo.write({ samples: [sample("x", 2, 1)], buckets: [], run })
  assert.deepEqual(database.db.all<{ signal_id: string; ts: number }>("SELECT s.signal_id, ts FROM samples JOIN series s ON s.id = samples.series").map(r => ({ ...r })), [{ signal_id: "x", ts: 2 }])
  database.close()
})
