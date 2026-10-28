import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, mock, test } from "node:test"
import { Value } from "@lox-nexus/plugin-sdk/values"
import type { BusMessage } from "../bus/BusMessage.ts"
import type { Signal } from "../wires/Signal.ts"
import { HistoryRecorder } from "./HistoryRecorder.ts"
import { HistoryRetention } from "./HistoryRetention.ts"
import { MemoryHistoryStore as MemoryStore } from "./test-support/MemoryHistoryStore.ts"

const temp: Signal = { id: "temp", topic: "loxone/haus/in/temp", label: "Temp", direction: "source", valueType: "number", delivery: "state" }
const lamp: Signal = { id: "lamp", topic: "ha/home/actuator/lamp", label: "Lamp", direction: "target", valueType: "any", delivery: "command" }
const message = (value: Value, extra: Partial<BusMessage> = {}) =>
  ({ id: "m", ts: Date.now(), topic: "t", kind: "state", value, source: { kind: "loxone", id: "haus" }, traceId: "x", ...extra }) as BusMessage & { value: Value }

describe("HistoryRecorder", () => {
  beforeEach(() => mock.timers.enable({ apis: ["setInterval", "Date"], now: 1_000_000_000 }))
  afterEach(() => mock.timers.reset())

  test("writes in batches every 5 s with flags; replayed values are skipped", async () => {
    const store = new MemoryStore()
    const recorder = new HistoryRecorder(store, { now: () => Date.now() }, () => ({ rawMinIntervalMs: 0 }), () => {})
    recorder.record(temp, message(Value.number(21)))
    recorder.record(temp, message(Value.number(5), { flags: { forced: true } }))
    recorder.record(temp, message(Value.number(20), { flags: { restored: true } }))
    recorder.record(lamp, message(Value.singleChannel({ channel: 40, fadeTime: 0 }), { kind: "command" }))
    recorder.record(lamp, message(Value.string("x".repeat(2000)), { kind: "command" }))
    assert.equal(store.samples.length, 0, "nothing is written per value")
    mock.timers.tick(HistoryRecorder.FLUSH_MS)
    assert.deepEqual(store.samples.map(s => [s.signalId, s.valueType, s.num, s.flags]), [
      ["temp", "number", 21, 0], ["temp", "number", 5, 1], ["lamp", "singleChannel", 40, 2], ["lamp", "string", null, 2]
    ])
    assert.equal(store.samples.at(-1)!.text!.length, 1000, "long text is cut")
    await recorder.dispose()
  })

  test("close changes keep only the latest raw value, but the buckets see all of them", async () => {
    const store = new MemoryStore()
    const recorder = new HistoryRecorder(store, { now: () => Date.now() }, () => ({ rawMinIntervalMs: 1000 }), () => {})
    for (const [ms, v] of [[0, 1], [300, 9], [600, 2], [1100, 3]] as const) {
      mock.timers.tick(ms - (Date.now() - 1_000_000_000))
      recorder.record(temp, message(Value.number(v)))
    }
    await recorder.dispose()
    assert.deepEqual(store.samples.map(s => s.num), [2, 3], "1 and 9 were replaced within the second")
    const fine = store.buckets.filter(b => b.width === 5 * 60_000)
    assert.deepEqual([fine.length, fine[0]!.max, fine[0]!.n], [1, 9, 4], "dispose writes the open bucket with every change")
  })

  test("a failed write keeps everything for the next try, and says so once", async () => {
    const store = new MemoryStore()
    const logged: string[] = []
    const recorder = new HistoryRecorder(store, { now: () => Date.now() }, () => ({ rawMinIntervalMs: 0 }), message => logged.push(message))
    store.fail = true
    recorder.record(temp, message(Value.number(1)))
    mock.timers.tick(HistoryRecorder.FLUSH_MS)
    recorder.record(temp, message(Value.number(2)))
    mock.timers.tick(HistoryRecorder.FLUSH_MS)
    store.fail = false
    mock.timers.tick(HistoryRecorder.FLUSH_MS)
    assert.deepEqual(store.samples.map(s => s.num), [1, 2])
    assert.equal(logged.length, 2, "failing, then working again")
    assert.equal(store.runs.at(-1)!.started, 1_000_000_000)
    await recorder.dispose()
  })
})

describe("HistoryRetention", () => {
  beforeEach(() => mock.timers.enable({ apis: ["setInterval", "Date"], now: 100 * 86_400_000 }))
  afterEach(() => mock.timers.reset())

  test("prunes each tier by its retention (0 keeps), all tiers sharing one budget per tick", async () => {
    const store = new MemoryStore()
    store.rows = 6000
    const retention = new HistoryRetention(store, { now: () => Date.now() }, () => ({ rawDays: 7, fineDays: 0, coarseDays: 30 }), () => true, () => {})
    assert.deepEqual(store.pruned, [], "nothing at boot, before the signals are loaded")
    mock.timers.tick(HistoryRetention.INTERVAL_MS)
    const now = Date.now()
    assert.deepEqual(store.pruned, [["raw", now - 7 * 86_400_000, 10_000], [3_600_000, now - 30 * 86_400_000, 4000]])
    await retention.dispose()
  })

  test("a signal's history goes only after it was missing from the configuration for an hour", async () => {
    const store = new MemoryStore()
    let configured = false
    const retention = new HistoryRetention(store, { now: () => Date.now() }, () => ({ rawDays: 0, fineDays: 0, coarseDays: 0 }), id => id === "temp" || configured, () => {})
    mock.timers.tick(HistoryRetention.INTERVAL_MS)
    configured = true
    mock.timers.tick(HistoryRetention.INTERVAL_MS)
    configured = false
    for (let i = 0; i < 60; i++) mock.timers.tick(HistoryRetention.INTERVAL_MS)
    assert.deepEqual(store.purged, [], "back in the configuration in between (an import), so the hour started again")
    mock.timers.tick(HistoryRetention.INTERVAL_MS)
    assert.deepEqual(store.purged, [["gone", 10_000]])
    await retention.dispose()
  })
})
