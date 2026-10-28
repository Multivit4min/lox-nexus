// Measures what history costs: `node --conditions=@lox-nexus/source --import tsx
// src/test-support/HistoryLoadCheck.ts [signals] [secondsBetweenChanges] [hours]` from apps/server.
// Writes into a temporary history.db exactly as the recorder does, then reports size and timing.
import fs from "node:fs"
import path from "node:path"
import { HistoryRecorder, type Signal } from "@lox-nexus/core"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { HistoryDatabase } from "../db/history/HistoryDatabase.ts"
import { HistoryRepository } from "../db/history/HistoryRepository.ts"
import { TestApp } from "./TestApp.ts"

const signals = Number(process.argv[2] ?? 500)
const every = Number(process.argv[3] ?? 10)
const hours = Number(process.argv[4] ?? 24)
const file = path.join(TestApp.tempDir(), "history.db")
const database = new HistoryDatabase(file)
let now = Date.UTC(2026, 0, 1)
const recorder = new HistoryRecorder(new HistoryRepository(database.db), { now: () => now }, () => ({ rawMinIntervalMs: 1000 }), message => console.error(message))
const list: Signal[] = Array.from({ length: signals }, (_, i) => ({ id: `signal-${i}`, topic: `t/${i}`, label: "", direction: "source", valueType: "number", delivery: "state" }))
const flushTimes: number[] = []
for (let second = 0; second < hours * 3600; second++) {
  now += 1000
  // each signal changes once every `every` seconds, spread over the seconds
  for (let i = second % every; i < signals; i += every) {
    recorder.record(list[i]!, { id: "m", ts: now, topic: list[i]!.topic, kind: "state", value: Value.number(Math.sin(second / 600 + i) * 20 + 20), source: { kind: "system", id: "x" }, traceId: "x", seq: 0, depth: 0 })
  }
  if (second % 5 === 4) {
    const started = performance.now()
    recorder.flush()
    flushTimes.push(performance.now() - started)
  }
}
const before = performance.now()
// dispose writes the open buckets, and stops the recorder's timer so the script can end
await recorder.dispose()
const walBytes = fs.existsSync(`${file}-wal`) ? fs.statSync(`${file}-wal`).size : 0
database.db.exec("PRAGMA wal_checkpoint(TRUNCATE)")
const closing = Math.round(performance.now() - before)
const count = (sql: string) => database.db.get<{ n: number }>(sql)!.n
const sorted = flushTimes.sort((a, b) => a - b)
console.log(JSON.stringify({
  signals, secondsBetweenChanges: every, hours,
  rawRows: count("SELECT count(*) AS n FROM samples"), bucketRows: count("SELECT count(*) AS n FROM buckets"),
  megabytes: Math.round(fs.statSync(file).size / 1e5) / 10, walMegabytes: Math.round(walBytes / 1e5) / 10, finalFlushAndCheckpointMs: closing,
  flushMs: { median: Math.round(sorted[sorted.length >> 1]! * 10) / 10, p99: Math.round(sorted[Math.floor(sorted.length * 0.99)]! * 10) / 10, max: Math.round(sorted.at(-1)! * 10) / 10 }
}))
database.close()
fs.rmSync(path.dirname(file), { recursive: true })
