import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, mock, test } from "node:test"
import { Value } from "@lox-nexus/plugin-sdk/values"
import type { BusMessage } from "../bus/BusMessage.ts"
import type { Signal } from "../wires/Signal.ts"
import { HistoryRecorder } from "./HistoryRecorder.ts"
import { MemoryHistoryStore } from "./test-support/MemoryHistoryStore.ts"

const temp: Signal = { id: "temp", topic: "loxone/haus/in/temp", label: "Temp", direction: "source", valueType: "number", delivery: "state" }
const message = (value: Value, extra: Partial<BusMessage> = {}) =>
  ({ id: "m", ts: Date.now(), topic: "t", kind: "state", value, source: { kind: "loxone", id: "haus" }, traceId: "x", ...extra }) as BusMessage & { value: Value }
const start = 1_000_000_000

describe("recording pauses", () => {
  beforeEach(() => mock.timers.enable({ apis: ["setInterval", "Date"], now: start }))
  afterEach(() => mock.timers.reset())

  const recorder = (store: MemoryHistoryStore) => new HistoryRecorder(store, { now: () => Date.now() }, () => ({ rawMinIntervalMs: 0 }), () => {})

  test("a recording signal pauses when released and resumes with its next value; a failed write keeps the changes", async () => {
    const store = new MemoryHistoryStore()
    const history = recorder(store)
    history.release("temp")
    assert.equal(history.isPaused("temp"), false, "a signal that never recorded doesn't pause")
    history.record(temp, message(Value.number(1)))
    mock.timers.tick(1000)
    history.release("temp")
    history.release("temp")
    assert.deepEqual([history.isRecording("temp"), history.isPaused("temp")], [false, true])
    store.fail = true
    assert.equal(history.flush(), false)
    store.fail = false
    mock.timers.tick(4000)
    history.record(temp, message(Value.number(2)))
    assert.equal(history.flush(), true)
    assert.deepEqual(store.pauses, [{ signalId: "temp", at: start + 1000, kind: "pause" }, { signalId: "temp", at: start + 5000, kind: "resume" }])
    await history.dispose()
  })

  test("a pause from an earlier run is closed by the next value, a replay resumes it as of now", async () => {
    const store = new MemoryHistoryStore()
    store.paused = ["temp"]
    const history = recorder(store)
    assert.equal(history.isPaused("temp"), true)
    mock.timers.tick(2000)
    history.record(temp, message(Value.number(3), { ts: start - 60_000, flags: { restored: true } }))
    history.flush()
    assert.deepEqual(store.pauses, [{ signalId: "temp", at: start + 2000, kind: "resume" }])
    assert.equal(store.samples.length, 0, "the replay itself isn't recorded again")
    await history.dispose()
  })

  test("forgetting a signal (an import unregisters and registers it again) keeps its pause, so its next value resumes it", async () => {
    const store = new MemoryHistoryStore()
    const history = recorder(store)
    history.record(temp, message(Value.number(1)))
    history.release("temp")
    history.forget("temp")
    mock.timers.tick(1000)
    history.record(temp, message(Value.number(2)))
    history.flush()
    assert.deepEqual(store.pauses.map(change => change.kind), ["pause", "resume"])
    await history.dispose()
  })
})
