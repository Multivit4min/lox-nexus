import assert from "node:assert/strict"
import { afterEach, test } from "node:test"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { MqttHarness } from "./test-support/MqttHarness.ts"
import { SilentBroker } from "./test-support/SilentBroker.ts"
import { MqttPlugin } from "./MqttPlugin.ts"

const { until } = MqttHarness

/** resource types active now beyond the baseline (counted per type) */
function added(baseline: string[]) {
  const left = new Map<string, number>()
  for (const type of baseline) left.set(type, (left.get(type) ?? 0) + 1)
  return process.getActiveResourcesInfo().filter(type => {
    const count = left.get(type) ?? 0
    left.set(type, count - 1)
    return count <= 0
  })
}

/** waits until nothing is left beyond the baseline (the broker closes its side a moment later) */
async function settled(baseline: string[]) {
  await until(() => added(baseline).length === 0, 3000, "no handles left").catch(() => {})
  return added(baseline)
}

const harness = new MqttHarness()
afterEach(() => harness.close())

test("stop/start cycles leave no sockets or timers behind, and the next start works", { timeout: 20_000 }, async () => {
  await harness.open()
  const baseline = process.getActiveResourcesInfo()
  for (let round = 0; round < 2; round++) {
    const host = await harness.connected({ discovery: true })
    const temp = await host.addSensor("number", { topic: "t" })
    const out = await host.addActuator("text", { topic: "o", qos: "1" })
    await host.watchSignals([{ id: "a", topic: "x/y", label: "A", valueType: "number" }])
    await host.pushValues([{ signalId: "a", value: Value.number(1) }])
    // browsing leaves a linger timer and a subscription for stop to end
    await host.catalog()
    await harness.broker.publish("t", "5")
    await until(() => host.values(temp).length === 1)
    await host.actuate(out, Value.string("x"))
    assert.ok(added(baseline).length > 0, "a connection is open")
    await harness.stop(host)
    assert.deepEqual(await settled(baseline), [], `round ${round}`)
  }
})

test("a stop while waiting to reconnect cancels the wait", { timeout: 20_000 }, async () => {
  await harness.open()
  const host = await harness.connected()
  const baseline = process.getActiveResourcesInfo()
  await harness.broker.close()
  await until(() => host.status.status === "degraded")
  await harness.stop(host)
  assert.deepEqual((await settled(baseline)).filter(type => type === "Timeout"), [])
})

test("a stop while the broker stops answering ends within CLOSE_MS and leaves nothing behind", { timeout: 20_000 }, async () => {
  // no PUBACK for the offline status, and no answer to the DISCONNECT
  const silent = await SilentBroker.start()
  try {
    await harness.open()
    const baseline = process.getActiveResourcesInfo()
    const host = await harness.connected({ url: silent.url })
    const started = performance.now()
    await harness.stop(host)
    const took = performance.now() - started
    assert.ok(took >= MqttPlugin.CLOSE_MS - 100 && took < MqttPlugin.CLOSE_MS + 1000, `took ${Math.round(took)} ms`)
    assert.deepEqual(await settled(baseline), [], "the socket is closed, on both ends")
  } finally {
    await silent.close()
  }
})

test("a failed start leaves nothing behind", { timeout: 20_000 }, async () => {
  await harness.open({ credentials: { username: "u", password: "p" } })
  const baseline = process.getActiveResourcesInfo()
  await assert.rejects(harness.start({ username: "u", password: "nope" }))
  assert.deepEqual(await settled(baseline), [])
})
