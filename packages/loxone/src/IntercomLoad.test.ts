import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, mock, test } from "node:test"
import { EventBus, SignalRegistry } from "@lox-nexus/core"
import { DataType } from "@lox-nexus/ici"
import { IntercomLoad, type LoadSample } from "./IntercomLoad.ts"
import { MiniserverManager } from "./MiniserverManager.ts"
import { BusProbe } from "./test-support/BusProbe.ts"
import { FakeMiniserver } from "./test-support/FakeMiniserver.ts"
import { TrafficMeter } from "./TrafficMeter.ts"

class ManualClock {
  constructor(public time = 1_000_000_000) {}
  now() {
    return this.time
  }
}

describe("TrafficMeter", () => {
  test("counts per direction within the window and forgets older seconds", () => {
    const clock = new ManualClock()
    const meter = new TrafficMeter(clock, 120)
    meter.received()
    meter.sent()
    meter.sent()
    clock.time += 60_000
    meter.received()
    assert.deepEqual(meter.totals(), { incoming: 2, outgoing: 2 })
    clock.time += 61_000
    assert.deepEqual(meter.totals(), { incoming: 1, outgoing: 0 }, "the first second left the window")
    clock.time += 120_000
    assert.deepEqual(meter.totals(), { incoming: 0, outgoing: 0 })
  })
})

describe("IntercomLoad", () => {
  beforeEach(() => mock.timers.enable({ apis: ["setInterval", "Date"], now: 1_000_000_000 }))
  afterEach(() => mock.timers.reset())

  test("percent is the 2-minute average against 35 messages per second, sampled every 5 s", async () => {
    const samples: LoadSample[] = []
    const load = new IntercomLoad({ now: () => Date.now() }, sample => samples.push(sample))
    // 35/s for a full window in both directions together is exactly the limit
    for (let second = 0; second < IntercomLoad.WINDOW_SECONDS; second++) {
      for (let i = 0; i < 20; i++) load.received()
      for (let i = 0; i < 15; i++) load.sent()
      mock.timers.tick(1000)
    }
    const last = samples.at(-1)!
    assert.equal(samples.length, IntercomLoad.WINDOW_SECONDS * 1000 / IntercomLoad.SAMPLE_MS)
    assert.ok(Math.abs(last.percent - 100) < 1, `about 100%, got ${last.percent}`)
    assert.ok(Math.abs(last.incomingPerSecond - 20) < 0.2 && Math.abs(last.outgoingPerSecond - 15) < 0.2)
    mock.timers.tick(IntercomLoad.WINDOW_SECONDS * 1000)
    assert.equal(load.current().percent, 0, "quiet for two minutes")
    await load.dispose()
  })

  test("a stored history seeds it; samples older than an hour age out by time", async () => {
    const now = Date.now()
    const old = (minutesAgo: number) => ({ ts: now - minutesAgo * 60_000, incomingPerSecond: 1, outgoingPerSecond: 0, percent: 3 })
    const load = new IntercomLoad({ now: () => Date.now() }, () => {}, [old(90), old(50), old(10)])
    assert.deepEqual(load.history().map(s => s.ts), [old(50).ts, old(10).ts], "the 90-minute-old sample is dropped")
    for (let i = 0; i < 15 * 12; i++) mock.timers.tick(IntercomLoad.SAMPLE_MS)
    assert.equal(load.history()[0]!.ts, old(10).ts, "the 50-minute-old one is now past the hour")
    await load.dispose()
  })

  test("each packet id's share uses the same window and limit, per direction", async () => {
    const load = new IntercomLoad({ now: () => Date.now() })
    for (let second = 0; second < IntercomLoad.WINDOW_SECONDS; second++) {
      load.received("light")
      load.sent("light")
      for (let i = 0; i < 7; i++) load.sent("pv")
      load.received()
      mock.timers.tick(1000)
    }
    assert.ok(Math.abs(load.percentOf("out", "pv") - 20) < 0.5, "7 of 35 per second is 20%")
    assert.ok(Math.abs(load.percentOf("in", "light") - 100 / 35) < 0.1, "directions are kept apart")
    assert.equal(load.percentOf("in", "pv"), 0)
    mock.timers.tick(IntercomLoad.WINDOW_SECONDS * 1000)
    assert.equal(load.percentOf("out", "pv"), 0, "quiet for two minutes")
    await load.dispose()
  })

  test("keeps one hour of samples", async () => {
    const load = new IntercomLoad({ now: () => Date.now() })
    // step by sample: inside one long tick(), every callback would see the tick's end time
    for (let i = 0; i < 2 * IntercomLoad.HISTORY_SAMPLES; i++) mock.timers.tick(IntercomLoad.SAMPLE_MS)
    assert.equal(load.history().length, IntercomLoad.HISTORY_SAMPLES)
    await load.dispose()
  })
})

describe("IntercomLoad on a running Miniserver", { timeout: 10_000 }, () => {
  test("counts packets from the Miniserver and packets sent to it, resends included", async t => {
    const signals = new SignalRegistry()
    const bus = new EventBus({ topicKinds: signals })
    const manager = new MiniserverManager({ bus, signals })
    const fake = new FakeMiniserver()
    const port = await fake.start()
    // in a hook, so a failing assertion can't leave sockets open and keep the test run alive
    t.after(async () => {
      await manager.dispose()
      await fake.stop()
    })
    const ms = manager.add({ id: "ms", slug: "haus", label: "", host: "127.0.0.1", port, listenPort: 0, listenAddress: "127.0.0.1", ownId: "claude", remoteId: "server", resendInterval: 0 })
    ms.addSignal({ id: "in", packetId: "in", direction: "in", dataType: DataType.Analog, label: "" })
    ms.addSignal({ id: "out", packetId: "out", direction: "out", dataType: DataType.Analog, label: "" })
    await ms.start()
    fake.connect(ms.listenPort!)
    const arrived = BusProbe.next(bus, "loxone/haus/in/in")
    await fake.send("in", DataType.Analog, 1)
    await arrived
    await fake.sendRaw(FakeMiniserver.STATUS_FROM_OTHER)
    const received = fake.received("out")
    bus.publish("loxone/haus/out/out", { type: "number", value: 2 }, { source: { kind: "user", id: "t" } })
    await received
    const { incomingPerSecond, outgoingPerSecond } = ms.load.current()
    assert.deepEqual([incomingPerSecond * 120, outgoingPerSecond * 120], [1, 1], "the foreign heartbeat is not counted")
    const one = Math.round(100 / 120 / 35 * 1000) / 1000
    assert.deepEqual(Object.fromEntries(ms.signalLoad()), { in: one, out: one }, "each signal's share")
  })
})
