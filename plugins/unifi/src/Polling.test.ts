import assert from "node:assert/strict"
import { test } from "node:test"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { FakeConsole } from "./test-support/FakeConsole.ts"
import { UnifiHarness } from "./test-support/UnifiHarness.ts"
import { newResources, waitFor } from "./test-support/waitFor.ts"

test("a failing console degrades the instance and fails the signals; polls back off and recover", async () => {
  const unifi = await UnifiHarness.start()
  try {
    const phone = await unifi.host.addSensor("client-connected", { client: "02:00:00:00:10:01" })
    unifi.fake.state.failure = { status: 500 }
    await unifi.tick()
    assert.equal(unifi.host.status.status, "degraded")
    assert.match(unifi.host.status.message ?? "", /can.t read the UniFi console: listing the clients failed with HTTP 500/)
    assert.match(unifi.errors(phone)[0] ?? "", /can't read the UniFi console/)

    // waits of 15, 30 and 60 s: of the next ticks, those at 30 s, 60 s and 120 s ask
    // the devices list is read in parallel and may arrive after a poll failed, so only the clients count
    const clients = () => unifi.fake.calls(/\/clients$/).length
    const asked: number[] = []
    for (let tick = 0; tick < 7; tick++) {
      const before = clients()
      await unifi.tick()
      asked.push(clients() - before)
    }
    assert.deepEqual(asked.map(count => count > 0), [true, false, true, false, false, false, true])
    assert.equal(unifi.errors(phone).length, 1, "one failure, not one per poll")

    unifi.fake.state.failure = undefined
    for (let tick = 0; tick < 8 && unifi.host.status.status === "degraded"; tick++) await unifi.tick()
    assert.equal(unifi.host.status.status, "running")
    assert.deepEqual(unifi.host.values(phone).at(-1), Value.boolean(true))
    assert.ok(unifi.host.sent.some(message => message.type === "panel.changed"))
    assert.ok(!JSON.stringify(unifi.host.sent).includes(FakeConsole.KEY), "the API key reaches no log, panel or value")
  } finally {
    await unifi.stop()
  }
})

test("a request without an answer times out after the configured seconds", async () => {
  const unifi = await UnifiHarness.start({ config: { timeout: 5 } })
  try {
    unifi.fake.state.hang = true
    const before = unifi.fake.requests.length
    await unifi.clock.advance(15_000)
    await waitFor(() => unifi.fake.requests.length > before, "the poll asked")
    await unifi.clock.advance(5_000)
    await unifi.plugin.poller.idle()
    assert.match(unifi.host.status.message ?? "", /no answer within 5 s/)
  } finally {
    unifi.fake.state.hang = false
    await unifi.stop()
  }
})

test("a console that is down at the start doesn't fail it: the instance is degraded and keeps trying", async () => {
  const unifi = await UnifiHarness.start({ prepare: fake => (fake.state.failure = { status: 503 }) })
  try {
    assert.equal(unifi.host.status.status, "degraded")
    unifi.fake.state.failure = undefined
    await unifi.tick()
    assert.equal(unifi.host.status.status, "running")
    assert.equal(unifi.plugin.poller.version, "10.3.58", "the version is read once the console answers")
  } finally {
    await unifi.stop()
  }
})

test("stop leaves no timers, sockets or handles behind", async () => {
  const baseline = process.getActiveResourcesInfo()
  const unifi = await UnifiHarness.start()
  await unifi.host.addSensor("device-cpu", { device: "02:00:00:00:00:01" })
  await unifi.host.addActuator("device-restart", { device: "02:00:00:00:00:01" })
  await unifi.tick()
  await unifi.stop()
  assert.equal(unifi.clock.pending, 0)
  await waitFor(() => newResources(baseline).length === 0, `left behind: ${newResources(baseline).join(", ")}`)
})
