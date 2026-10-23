import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import { describe, test, mock } from "node:test"
import { Disposable } from "./Disposable.ts"

class Probe extends Disposable {
  readonly log: string[] = []

  tick(ms: number, fn: () => void) {
    this.every(ms, fn)
  }

  later(ms: number, fn: () => void) {
    return this.after(ms, fn)
  }

  repeat(ms: number, fn: () => void) {
    return this.every(ms, fn)
  }

  track(name: string, teardown?: () => Promise<void>) {
    this.onDispose(async () => {
      await teardown?.()
      this.log.push(name)
    })
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

  test("a second dispose() waits for the first to finish", async () => {
    const probe = new Probe()
    let release!: () => void
    probe.track("slow", () => new Promise<void>(resolve => (release = resolve)))
    const first = probe.dispose()
    const second = probe.dispose()
    assert.equal(first, second)
    release()
    await second
    assert.deepEqual(probe.log, ["slow"])
  })

  test("after() honours delays beyond setTimeout's 24.8 day limit", () => {
    mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 })
    try {
      const probe = new Probe()
      const fired = mock.fn()
      probe.later(30 * 86_400_000, fired)
      mock.timers.tick(29 * 86_400_000)
      assert.equal(fired.mock.callCount(), 0)
      mock.timers.tick(86_400_000)
      assert.equal(fired.mock.callCount(), 1)
      assert.equal(probe.pendingTeardowns, 0)
    } finally {
      mock.timers.reset()
    }
  })

  test("every() validates its interval and can be cancelled", () => {
    mock.timers.enable({ apis: ["setInterval"] })
    try {
      const probe = new Probe()
      for (const bad of [0, -1, Number.NaN, 2 ** 31]) assert.throws(() => probe.repeat(bad, () => {}), RangeError)
      const fn = mock.fn()
      const cancel = probe.repeat(100, fn)
      mock.timers.tick(100)
      cancel()
      mock.timers.tick(1000)
      assert.equal(fn.mock.callCount(), 1)
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
