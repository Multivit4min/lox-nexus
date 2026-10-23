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

  test("keeps one hour of samples", async () => {
    const load = new IntercomLoad({ now: () => Date.now() })
    mock.timers.tick(2 * 60 * 60 * 1000)
    assert.equal(load.history().length, IntercomLoad.HISTORY_SAMPLES)
    await load.dispose()
  })
})

describe("IntercomLoad on a running Miniserver", { timeout: 10_000 }, () => {
  test("counts packets from the Miniserver and packets sent to it, resends included", async () => {
    const signals = new SignalRegistry()
    const bus = new EventBus({ topicKinds: signals })
    const manager = new MiniserverManager({ bus, signals })
    const fake = new FakeMiniserver()
    const port = await fake.start()
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
    await manager.dispose()
    await fake.stop()
  })
})
