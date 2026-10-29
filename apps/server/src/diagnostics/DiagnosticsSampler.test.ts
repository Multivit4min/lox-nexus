import assert from "node:assert/strict"
import { afterEach, beforeEach, mock, test } from "node:test"
import { EventBus } from "@lox-nexus/core"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { LoggerFactory } from "../logging/LoggerFactory.ts"
import { DiagnosticsSampler } from "./DiagnosticsSampler.ts"

const source = { source: { kind: "user" as const, id: "test" } }
const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve))
}

beforeEach(() => mock.timers.enable({ apis: ["setInterval", "Date"], now: Date.parse("2026-10-29T10:00:00Z") }))
afterEach(() => mock.timers.reset())

const start = (workers = async () => [{ instanceId: "p1", label: "Fronius", heapUsed: 5e6, heapTotal: 8e6, utilization: 0.01 }]) => {
  const bus = new EventBus()
  const sampler = new DiagnosticsSampler({
    bus, streamClients: () => 2, wires: () => 3, workers,
    miniservers: () => [{ id: "m1", label: "=Haus", incomingPerSecond: 1.5, outgoingPerSecond: 0.5 }],
    storage: { measure: () => ({ databaseBytes: 100, historyBytes: 200, pluginsBytes: 300 }) }
  }, { version: "1.0.0", startedAt: 0 }, { now: () => Date.now() }, LoggerFactory.silent())
  return { bus, sampler }
}

test("a sample every 30 s with the process, the bus rate, the sources and the workers", async t => {
  const { bus, sampler } = start()
  t.after(() => sampler.dispose())
  for (let i = 0; i < 60; i++) bus.publish(`x/${i}`, Value.number(i), source)
  mock.timers.tick(DiagnosticsSampler.INTERVAL_MS)
  await settle()
  const [sample] = sampler.snapshot().samples
  assert.ok(sample && sample.rss > 0 && sample.heapUsed > 0, JSON.stringify(sample))
  assert.deepEqual([sample.busPerSecond, sample.retainedTopics, sample.streamClients, sample.wires], [2, 60, 2, 3])
  assert.deepEqual([sample.databaseBytes, sample.historyBytes, sample.pluginsBytes], [100, 200, 300])
  assert.deepEqual(sample.workers.map(worker => worker.label), ["Fronius"])
  assert.equal(sampler.snapshot().intervalMs, DiagnosticsSampler.INTERVAL_MS)
})

test("keeps 48 hours; a failing source skips a sample instead of throwing", async t => {
  let fail = false
  const { sampler } = start(async () => {
    if (fail) throw new Error("worker gone")
    return []
  })
  t.after(() => sampler.dispose())
  const capacity = DiagnosticsSampler.KEEP_MS / DiagnosticsSampler.INTERVAL_MS
  for (let i = 0; i < capacity + 3; i++) {
    mock.timers.tick(DiagnosticsSampler.INTERVAL_MS)
    await settle()
  }
  assert.equal(sampler.snapshot().samples.length, capacity)
  const last = sampler.snapshot().samples.at(-1)?.ts
  fail = true
  mock.timers.tick(DiagnosticsSampler.INTERVAL_MS)
  await settle()
  assert.equal(sampler.snapshot().samples.at(-1)?.ts, last, "no sample for the failed take")
  fail = false
  mock.timers.tick(DiagnosticsSampler.INTERVAL_MS)
  await settle()
  assert.equal(sampler.snapshot().samples.at(-1)?.ts, last! + 2 * DiagnosticsSampler.INTERVAL_MS)
})

test("since gives only the newer samples", async t => {
  const { sampler } = start()
  t.after(() => sampler.dispose())
  for (let i = 0; i < 3; i++) {
    mock.timers.tick(DiagnosticsSampler.INTERVAL_MS)
    await settle()
  }
  const [first, second] = sampler.snapshot().samples
  assert.deepEqual(sampler.snapshot(first!.ts).samples.map(sample => sample.ts), [second!.ts, second!.ts + DiagnosticsSampler.INTERVAL_MS])
  assert.deepEqual(sampler.snapshot(Date.now()).samples, [])
})
