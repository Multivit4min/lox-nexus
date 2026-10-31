import assert from "node:assert/strict"
import { test } from "node:test"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { Fixtures, type Json } from "./test-support/Fixtures.ts"
import { UnifiHarness } from "./test-support/UnifiHarness.ts"

const SWITCH_ID = "00000000-0000-4000-8000-000000000002"
const on = Value.boolean(true)
const off = Value.boolean(false)

test("restart fires on a rising true only: never on a repeat, a false or a replayed value", async () => {
  const unifi = await UnifiHarness.start()
  try {
    const restart = await unifi.host.addActuator("device-restart", { device: "02:00:00:00:00:02" }, "Garage restart")
    const restarts = () => unifi.fake.calls(new RegExp(`devices/${SWITCH_ID}/actions$`), "POST")
    await unifi.host.actuate(restart, on, undefined, true)
    assert.equal(restarts().length, 0, "a replay after a start doesn't restart")
    await unifi.host.actuate(restart, off)
    await unifi.host.actuate(restart, on)
    await unifi.host.actuate(restart, on)
    assert.equal(restarts().length, 1, "the repeated true does nothing")
    assert.deepEqual(restarts()[0]!.body, { action: "RESTART" })
    await unifi.host.actuate(restart, off)
    await unifi.host.actuate(restart, on)
    assert.equal(restarts().length, 2)
    const lines = unifi.host.sent.filter(message => message.type === "log" && message.level === "info").map(message => message.type === "log" ? message.message : "")
    assert.ok(lines.includes('restarting device 02:00:00:00:00:02, asked by signal "Garage restart"'))
  } finally {
    await unifi.stop()
  }
})

test("power-cycle posts POWER_CYCLE to the port, on a pulse, and skips replays", async () => {
  const unifi = await UnifiHarness.start()
  try {
    const cycle = await unifi.host.addActuator("port-power-cycle", { device: "02:00:00:00:00:02", port: 2 })
    await unifi.host.actuate(cycle, on, undefined, true)
    await unifi.host.actuate(cycle, off)
    await unifi.host.actuate(cycle, on)
    const calls = unifi.fake.calls(/\/interfaces\/ports\/\d+\/actions$/, "POST")
    assert.deepEqual(calls.map(call => [call.path.split("/").slice(-2)[0], call.body]), [["2", { action: "POWER_CYCLE" }]])
    const unknown = await unifi.host.addActuator("port-power-cycle", { device: "02:00:00:00:00:77", port: 1 })
    await assert.rejects(unifi.host.actuate(unknown, on), /no device 02:00:00:00:00:77 on the console/)
  } finally {
    await unifi.stop()
  }
})

test("guest access authorizes a connected guest with minutes, unauthorizes it, and refuses members", async () => {
  const unifi = await UnifiHarness.start()
  try {
    const guest = await unifi.host.addActuator("guest-access", { client: "02:00:00:00:10:03", minutes: 120 })
    await unifi.host.actuate(guest, on)
    await unifi.host.actuate(guest, off)
    await unifi.host.actuate(guest, on, undefined, true)
    const bodies = unifi.fake.calls(/\/clients\/[^/]+\/actions$/, "POST").map(call => call.body)
    assert.deepEqual(bodies, [{ action: "AUTHORIZE_GUEST_ACCESS", timeLimitMinutes: 120 }, { action: "UNAUTHORIZE_GUEST_ACCESS" }])
    const member = await unifi.host.addActuator("guest-access", { client: "Desk PC", matchBy: "name" })
    await assert.rejects(unifi.host.actuate(member, on), /Desk PC isn't a guest/)
    const away = await unifi.host.addActuator("guest-access", { client: "02:00:00:00:10:99" })
    await assert.rejects(unifi.host.actuate(away, on), /isn't connected; UniFi authorizes connected guests only/)
  } finally {
    await unifi.stop()
  }
})

test("guest Wi-Fi: PUT sends the whole object back with only enabled changed, never logging it", async () => {
  const unifi = await UnifiHarness.start()
  try {
    const wifi = await unifi.host.addActuator("wifi-enabled", { network: "guests" })
    const state = await unifi.host.addSensor("wifi-enabled", { network: "Guests" })
    assert.deepEqual(unifi.host.values(state), [off])
    await unifi.host.actuate(wifi, on)
    const puts = unifi.fake.calls(/\/wifi\/broadcasts\/[^/]+$/, "PUT")
    assert.equal(puts.length, 1)
    const expected: Json = { ...Fixtures.load<Json[]>("wifi-broadcasts")[1]!, enabled: true }
    delete expected.id
    delete expected.metadata
    assert.deepEqual(puts[0]!.body, expected, "every field kept, read-only id and metadata left out")
    await unifi.plugin.poller.idle()
    assert.deepEqual(unifi.host.values(state).at(-1), on)
    await unifi.host.actuate(wifi, on)
    assert.equal(unifi.fake.calls(/\/wifi\/broadcasts\/[^/]+$/, "PUT").length, 1, "already on: nothing sent")
    assert.ok(!JSON.stringify(unifi.host.sent).includes("synthetic-guest-passphrase"), "the passphrase never leaves the plugin")
    const nowhere = await unifi.host.addActuator("wifi-enabled", { network: "Office" })
    await assert.rejects(unifi.host.actuate(nowhere, on), /no Wi-Fi network named "Office"/)
  } finally {
    await unifi.stop()
  }
})
