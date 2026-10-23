import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import { describe, test, mock } from "node:test"
import { Disposable } from "./Disposable.ts"

class Probe extends Disposable {
  readonly log: string[] = []

  track(name: string) {
    this.onDispose(() => void this.log.push(name))
  }

  tick(ms: number, fn: () => void) {
    this.every(ms, fn)
  }

  later(ms: number, fn: () => void) {
    return this.after(ms, fn)
  }

  get pendingTeardowns() {
    return (this as unknown as { teardowns: Set<unknown> }).teardowns.size
  }

  subscribe(emitter: EventEmitter, fn: () => void) {
    this.listen(emitter, "ping", fn)
  }
}

describe("Disposable", () => {
  test("runs teardowns in reverse order", async () => {
    const probe = new Probe()
    probe.track("a")
    probe.track("b")
    await probe.dispose()
    assert.deepEqual(probe.log, ["b", "a"])
  })

  test("dispose is idempotent", async () => {
    const probe = new Probe()
    probe.track("a")
    await probe.dispose()
    await probe.dispose()
    assert.deepEqual(probe.log, ["a"])
    assert.equal(probe.isDisposed, true)
  })

  test("rejects registrations after dispose", async () => {
    const probe = new Probe()
    await probe.dispose()
    assert.throws(() => probe.track("late"))
  })

  test("stops intervals on dispose", async () => {
    mock.timers.enable({ apis: ["setInterval"] })
    try {
      const probe = new Probe()
      const fn = mock.fn()
      probe.tick(100, fn)
      mock.timers.tick(250)
      await probe.dispose()
      mock.timers.tick(1000)
      assert.equal(fn.mock.callCount(), 2)
    } finally {
      mock.timers.reset()
    }
  })

  test("after() forgets its teardown once fired or cancelled", async () => {
    mock.timers.enable({ apis: ["setTimeout"] })
    try {
      const probe = new Probe()
      const fired = mock.fn()
      for (let i = 0; i < 100; i++) probe.later(10, fired)
      probe.later(10, fired)()
      mock.timers.tick(10)
      assert.equal(fired.mock.callCount(), 100)
      assert.equal(probe.pendingTeardowns, 0)
    } finally {
      mock.timers.reset()
    }
  })

  test("removes listeners on dispose", async () => {
    const probe = new Probe()
    const emitter = new EventEmitter()
    probe.subscribe(emitter, () => {})
    assert.equal(emitter.listenerCount("ping"), 1)
    await probe.dispose()
    assert.equal(emitter.listenerCount("ping"), 0)
  })
})
