import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, mock, test } from "node:test"
import { Value } from "@lox-nexus/plugin-sdk/values"
import type { BusMessage } from "../bus/BusMessage.ts"
import type { Signal } from "../wires/Signal.ts"
import { HistoryRecorder } from "./HistoryRecorder.ts"
import { MemoryHistoryStore } from "./test-support/MemoryHistoryStore.ts"
import { ValueProjection } from "./ValueProjection.ts"

const MIN = 60_000
const temp: Signal = { id: "temp", topic: "t", label: "", direction: "source", valueType: "number", delivery: "state" }
const message = (value: number) => ({ id: "m", seq: 0, depth: 0, ts: Date.now(), topic: "t", kind: "state", value: Value.number(value), source: { kind: "loxone", id: "x" }, traceId: "x" }) as BusMessage & { value: Value }

describe("HistoryRecorder edge cases", () => {
  beforeEach(() => mock.timers.enable({ apis: ["setInterval", "Date"], now: 0 }))
  afterEach(() => mock.timers.reset())
  const setup = () => {
    const store = new MemoryHistoryStore()
    const logged: string[] = []
    const recorder = new HistoryRecorder(store, { now: () => Date.now() }, () => ({ rawMinIntervalMs: 0 }), text => logged.push(text))
    return { store, logged, recorder }
  }

  test("a batch that keeps failing is dropped and counted, so the history goes on", async () => {
    const { store, logged, recorder } = setup()
    store.fail = true
    recorder.record(temp, message(1))
    for (let i = 0; i < HistoryRecorder.MAX_ATTEMPTS; i++) mock.timers.tick(HistoryRecorder.FLUSH_MS)
    assert.equal(recorder.dropped, 3, "the value and the parts of its two open buckets")
    store.fail = false
    recorder.record(temp, message(2))
    mock.timers.tick(HistoryRecorder.FLUSH_MS)
    assert.deepEqual(store.samples.map(s => s.num), [2])
    assert.deepEqual(logged.length, 3, "failing, dropped, working again")
    await recorder.dispose()
  })

  test("a signal that leaves the selection gets its buckets closed, so its value isn't carried over a gap", async () => {
    const { store, recorder } = setup()
    recorder.record(temp, message(100))
    mock.timers.tick(MIN)
    recorder.release("temp")
    // three hours later it is recorded again
    for (let i = 0; i < 36; i++) mock.timers.tick(5 * MIN)
    recorder.record(temp, message(5))
    await recorder.dispose()
    const fine = store.buckets.filter(b => b.width === 5 * MIN)
    const last = fine.at(-1)!
    assert.deepEqual([last.min, last.max, last.n], [5, 5, 1], "not 100 from three hours before")
  })

  test("a clock jump starts a new run and closes the buckets where time was", async () => {
    const { store, recorder } = setup()
    recorder.record(temp, message(20))
    mock.timers.tick(HistoryRecorder.FLUSH_MS)
    mock.timers.setTime(Date.now() + 6 * 60 * MIN)
    recorder.record(temp, message(21))
    await recorder.dispose()
    assert.deepEqual(new Set(store.runs.map(r => r.started)), new Set([0, 6 * 60 * MIN + HistoryRecorder.FLUSH_MS]), "two runs, the gap between them")
    const before = store.buckets.filter(b => b.width === 5 * MIN && b.start === 0)
    assert.equal(before.reduce((sum, b) => sum + b.wdur, 0), HistoryRecorder.FLUSH_MS, "the old value was not drawn across the six hours")
  })

  test("forget while the store fails drops that signal's pending values only", async () => {
    const { store, recorder } = setup()
    store.fail = true
    recorder.record(temp, message(1))
    recorder.record({ ...temp, id: "other" }, message(2))
    mock.timers.tick(HistoryRecorder.FLUSH_MS)
    recorder.forget("temp")
    store.fail = false
    mock.timers.tick(HistoryRecorder.FLUSH_MS)
    assert.deepEqual(store.samples.map(s => s.signalId), ["other"])
    await recorder.dispose()
  })

  test("numbers too large to sum over time read as no value", () => {
    assert.equal(ValueProjection.of(Value.number(1e300)).num, null)
    assert.equal(ValueProjection.of(Value.number(-1e12)).num, -1e12)
  })
})
