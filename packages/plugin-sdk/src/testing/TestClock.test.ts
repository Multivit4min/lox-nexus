import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { Disposable } from "../lifecycle/Disposable.ts"
import { SystemClock } from "../lifecycle/Clock.ts"
import { Plugin } from "../plugin/Plugin.ts"
import { Sensor } from "../plugin/Sensor.ts"
import { Value } from "../values/Value.ts"
import { PluginTestHost } from "./PluginTestHost.ts"
import { TestClock } from "./TestClock.ts"

describe("TestClock", () => {
  test("runs each timer at its own due time, in order, including timers set by callbacks", async () => {
    const clock = new TestClock(1000)
    const seen: string[] = []
    clock.setTimeout(() => seen.push(`b@${clock.now()}`), 200)
    clock.setTimeout(() => {
      seen.push(`a@${clock.now()}`)
      clock.setTimeout(() => seen.push(`c@${clock.now()}`), 150)
    }, 100)
    clock.setTimeout(() => seen.push(`late@${clock.now()}`), 600)
    await clock.advance(500)
    assert.deepEqual(seen, ["a@1100", "b@1200", "c@1250"])
    assert.equal(clock.now(), 1500)
    assert.equal(clock.pending, 1)
  })

  test("intervals repeat until cleared; timers due together run in the order they were scheduled", async () => {
    const clock = new TestClock("2026-10-28T00:00:00Z")
    const seen: number[] = []
    const id = clock.setInterval(() => seen.push(clock.now() - Date.parse("2026-10-28T00:00:00Z")), 1000)
    clock.setTimeout(() => seen.push(-1), 2000)
    await clock.advance(3000)
    clock.clearInterval(id)
    await clock.advanceTo("2026-10-28T00:01:00Z")
    // the interval was rescheduled for 2000 at 1000, after the timeout was set for 2000
    assert.deepEqual(seen, [1000, -1, 2000, 3000])
    assert.equal(clock.pending, 0)
  })

  test("a jump moves the time but leaves every timer its remaining delay", async () => {
    const clock = new TestClock(0)
    const seen: number[] = []
    clock.setTimeout(() => seen.push(clock.now()), 1000)
    await clock.advance(400)
    clock.jump(3_600_000)
    await clock.advance(599)
    assert.deepEqual(seen, [])
    await clock.advance(1)
    assert.deepEqual(seen, [3_601_000])
  })

  test("refuses to go backwards or to non-times", async () => {
    const clock = new TestClock(5000)
    await assert.rejects(clock.advance(-1), RangeError)
    await clock.advanceTo(1000)
    assert.equal(clock.now(), 5000)
    assert.throws(() => new TestClock("not a date"), RangeError)
  })
})

class Child extends Disposable {
  ping(fn: () => void) {
    this.after(10, fn)
  }

  get clock() {
    return this.currentClock()
  }
}

class TickSensor extends Sensor<ClockPlugin> {
  static readonly id = "tick"
  static readonly valueType = "number"

  override start() {
    this.every(1000, () => this.emit(Value.number(this.clock.now())))
  }
}

class ClockPlugin extends Plugin {
  static readonly sensors = [TickSensor]
  readonly child = this.own(new Child())
  readonly pings: number[] = []

  override start() {
    this.child.ping(() => this.pings.push(this.clock.now()))
  }
}

describe("a plugin on a TestClock", () => {
  test("the plugin, its sensors and its owned children run on the clock it was given", async () => {
    const clock = new TestClock(10_000)
    const host = await PluginTestHost.start(ClockPlugin, { clock })
    const id = await host.addSensor("tick")
    await clock.advance(2000)
    assert.deepEqual(host.plugin.pings, [10_010])
    const emitted = host.sent.flatMap(m => (m.type === "emit" && m.signalId === id ? [m.value] : []))
    assert.deepEqual(emitted, [Value.number(11_000), Value.number(12_000)])
    await host.stop()
    assert.equal(clock.pending, 0, "stopping cleared every timer")
  })

  test("without a clock everything uses the system clock", async () => {
    const host = await PluginTestHost.start(ClockPlugin)
    assert.equal(host.plugin.clock, SystemClock.instance)
    assert.equal(host.plugin.child.clock, SystemClock.instance)
    await host.stop()
  })
})
