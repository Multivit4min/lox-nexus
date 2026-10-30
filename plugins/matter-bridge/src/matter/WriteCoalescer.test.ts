import assert from "node:assert/strict"
import { test } from "node:test"
import { WriteCoalescer } from "./WriteCoalescer.ts"

test("writes within the delay are merged per key, the newest wins, and flush() writes at once", () => {
  const timers: { ms: number; run: () => void; cancelled: boolean }[] = []
  const coalescer = new WriteCoalescer((ms, run) => {
    const timer = { ms, run, cancelled: false }
    timers.push(timer)
    return () => { timer.cancelled = true }
  })
  const written: string[] = []
  coalescer.write("a", () => written.push("a1"))
  coalescer.write("a", () => written.push("a2"))
  coalescer.write("b", () => written.push("b1"))
  assert.equal(timers.length, 1, "one timer for the burst")
  assert.equal(timers[0]!.ms, WriteCoalescer.DELAY_MS)
  timers[0]!.run()
  assert.deepEqual(written, ["a2", "b1"])

  coalescer.write("a", () => written.push("a3"))
  coalescer.flush()
  assert.deepEqual(written, ["a2", "b1", "a3"])
  assert.equal(timers[1]!.cancelled, true)
  assert.equal(coalescer.size, 0)
})

test("a schedule that runs at once (the plugin is stopping) writes at once and keeps working", () => {
  const coalescer = new WriteCoalescer((_ms, run) => {
    run()
    return () => {}
  })
  const written: string[] = []
  coalescer.write("a", () => written.push("a"))
  coalescer.write("b", () => written.push("b"))
  assert.deepEqual(written, ["a", "b"])
})
