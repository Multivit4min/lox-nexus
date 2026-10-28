import assert from "node:assert/strict"
import { test } from "node:test"
import type { BusMessage, ForceRecord } from "@lox-nexus/core"
import { Value } from "@lox-nexus/plugin-sdk/values"
import type { SnapshotRepository } from "../db/repositories/SnapshotRepository.ts"
import { TopicCleanup } from "./TopicCleanup.ts"

/** records the bus calls in order; `force` throws for an expiry in the past, like EventBus */
const setup = (options: { force?: ForceRecord; real?: Partial<BusMessage> } = {}) => {
  const calls: string[] = []
  const saved: unknown[] = []
  const bus = {
    activeForces: () => (options.force ? [options.force] : []),
    real: () => options.real as BusMessage | undefined,
    release: (topic: string) => void calls.push(`release ${topic}`),
    forget: (pattern: string) => (calls.push(`forget ${pattern}`), [pattern]),
    force: (topic: string, value: Value, info: { until?: number }) => {
      if (info.until !== undefined && info.until < 1000) throw new RangeError("a force must not expire in the past")
      calls.push(`force ${topic} ${JSON.stringify(value)}`)
    },
    restoreSnapshot: (entries: Array<{ topic: string }>) => void calls.push(`restore ${entries[0]!.topic}`),
    currentMatching: () => []
  }
  const snapshot = { save: (entries: unknown[]) => void saved.push(...entries), delete: () => {} } as unknown as SnapshotRepository
  return { calls, saved, cleanup: new TopicCleanup(bus, snapshot) }
}
const force = (until?: number): ForceRecord => ({ topic: "a/old", value: Value.number(5), by: "david", at: 1, kind: "state", ...(until ? { until } : {}) })

test("the value moves as a restored snapshot entry and is saved", () => {
  const { calls, saved, cleanup } = setup({ real: { value: Value.number(1), ts: 42 } })
  cleanup.move("a/old", "a/new", "t")
  assert.deepEqual(calls, ["forget a/old", "restore a/new"])
  assert.deepEqual(saved, [{ topic: "a/new", value: Value.number(1), ts: 42 }])
})

test("a force is re-applied before the value, so the value arrives shadowed", () => {
  const { calls, cleanup } = setup({ force: force(), real: { value: Value.number(1), ts: 42 } })
  cleanup.move("a/old", "a/new", "t")
  assert.deepEqual(calls, ["release a/old", "forget a/old", `force a/new ${JSON.stringify(Value.number(5))}`, "restore a/new"])
})

test("an expired force is dropped; nothing to move is fine", () => {
  const expired = setup({ force: force(500) })
  expired.cleanup.move("a/old", "a/new", "t")
  assert.deepEqual(expired.calls, ["release a/old", "forget a/old"])
  const empty = setup()
  empty.cleanup.move("a/old", "a/new", "t")
  assert.deepEqual([empty.calls, empty.saved], [["forget a/old"], []])
})
