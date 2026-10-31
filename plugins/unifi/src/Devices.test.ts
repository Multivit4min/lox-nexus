import assert from "node:assert/strict"
import { test } from "node:test"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { UnifiHarness } from "./test-support/UnifiHarness.ts"

const AP = "02:00:00:00:00:01"
const SWITCH = "02:00:00:00:00:02"
const AP_ID = "00000000-0000-4000-8000-000000000001"

test("device online, state and firmware update come from the device list", async () => {
  const unifi = await UnifiHarness.start()
  try {
    const online = await unifi.host.addSensor("device-online", { device: AP })
    const state = await unifi.host.addSensor("device-state", { device: "02:00:00:00:00:04" })
    const update = await unifi.host.addSensor("device-update", { device: AP })
    const offline = await unifi.host.addSensor("device-online", { device: "02:00:00:00:00:03" })
    assert.deepEqual(unifi.host.values(online), [Value.boolean(true)])
    assert.deepEqual(unifi.host.values(state), [Value.string("UPDATING")])
    assert.deepEqual(unifi.host.values(update), [Value.boolean(true)])
    assert.deepEqual(unifi.host.values(offline), [Value.boolean(false)])
    const missing = await unifi.host.addSensor("device-online", { device: "02:00:00:00:00:99" })
    assert.match(unifi.errors(missing)[0] ?? "", /no device 02:00:00:00:00:99 on the console/)
    assert.match(unifi.errors(missing)[0] ?? "", /devices: .*Hall AP 02:00:00:00:00:01/, "names the MACs that would work")
  } finally {
    await unifi.stop()
  }
})

test("statistics are read only of devices with a statistics signal, uplink rates in Mbit/s", async () => {
  const unifi = await UnifiHarness.start()
  try {
    assert.equal(unifi.fake.calls(/statistics/).length, 0, "no signal, no statistics request")
    const cpu = await unifi.host.addSensor("device-cpu", { device: AP })
    await unifi.plugin.poller.idle()
    const rx = await unifi.host.addSensor("device-uplink-rx", { device: AP })
    const tx = await unifi.host.addSensor("device-uplink-tx", { device: AP })
    const memory = await unifi.host.addSensor("device-memory", { device: AP })
    const uptime = await unifi.host.addSensor("device-uptime", { device: AP })
    assert.deepEqual(unifi.host.values(cpu).at(-1), Value.number(12.5))
    assert.deepEqual(unifi.host.values(rx), [Value.number(20)], "2 500 000 bytes/s")
    assert.deepEqual(unifi.host.values(tx), [Value.number(6)])
    assert.deepEqual(unifi.host.values(memory), [Value.number(41)])
    assert.deepEqual(unifi.host.values(uptime), [Value.number(86400)])
    await unifi.tick()
    assert.ok(unifi.fake.calls(/statistics/).every(request => request.path.includes(AP_ID)), "only the AP's statistics")
  } finally {
    await unifi.stop()
  }
})

test("an offline device has no statistics: the signal says so instead of showing stale numbers", async () => {
  const unifi = await UnifiHarness.start()
  try {
    const cpu = await unifi.host.addSensor("device-cpu", { device: "02:00:00:00:00:03" })
    assert.match(unifi.errors(cpu)[0] ?? "", /Garden AP is OFFLINE and reports no statistics/)
    await unifi.tick()
    assert.equal(unifi.fake.calls(/000000000003\/statistics/).length, 0)
  } finally {
    await unifi.stop()
  }
})

test("a failing port read fails the port signals only; the statistics of the same device keep coming", async () => {
  const unifi = await UnifiHarness.start()
  try {
    const cpu = await unifi.host.addSensor("device-cpu", { device: AP })
    const link = await unifi.host.addSensor("port-link", { device: AP, port: 1 })
    await unifi.plugin.poller.idle()
    delete unifi.fake.state.details[AP_ID]
    await unifi.tick()
    assert.match(unifi.errors(link).at(-1) ?? "", /not found/)
    assert.deepEqual(unifi.host.values(cpu).at(-1), Value.number(12.5))
    assert.equal(unifi.errors(cpu).length, 0, "not failed with the port read's error")
  } finally {
    await unifi.stop()
  }
})

test("nulls are read as missing: an empty SFP cage is a port, one the plugin can't read is named on the page, a null rate a missing statistic", async () => {
  const unifi = await UnifiHarness.start()
  try {
    const details = unifi.fake.state.details["00000000-0000-4000-8000-000000000002"] as { interfaces: { ports: unknown[] } }
    details.interfaces.ports.push({ idx: 25, state: "DOWN", connector: "SFPPLUS", maxSpeedMbps: null, speedMbps: null, poe: null }, { idx: 26, state: "UP" })
    const statistics = unifi.fake.state.statistics[AP_ID] as { uplink: Record<string, unknown>; memoryUtilizationPct: unknown }
    statistics.uplink.rxRateBps = null
    statistics.memoryUtilizationPct = null
    const cage = await unifi.host.addSensor("port-link", { device: SWITCH, port: 25 })
    const rx = await unifi.host.addSensor("device-uplink-rx", { device: AP })
    const tx = await unifi.host.addSensor("device-uplink-tx", { device: AP })
    await unifi.plugin.poller.idle()
    await unifi.tick()
    assert.deepEqual(unifi.host.values(cage).at(-1), Value.boolean(false))
    assert.match(unifi.errors(rx).at(-1) ?? "", /doesn't report its/)
    assert.deepEqual(unifi.host.values(tx).at(-1), Value.number(6), "the other rate of the same answer")
    const panel = await unifi.host.panel()
    const notice = panel?.type === "sections" ? panel.sections.find(section => section.title === "Ports not shown")?.panel : undefined
    assert.ok(notice?.type === "notice")
    assert.match(notice.text, /Garage Switch: 1 port in a form this plugin doesn't read/)
  } finally {
    await unifi.stop()
  }
})

test("switch ports: link, speed and PoE state; a port without PoE says so", async () => {
  const unifi = await UnifiHarness.start()
  try {
    const link1 = await unifi.host.addSensor("port-link", { device: SWITCH, port: 1 })
    const link2 = await unifi.host.addSensor("port-link", { device: SWITCH, port: 2 })
    const speed3 = await unifi.host.addSensor("port-speed", { device: SWITCH, port: 3 })
    const speed2 = await unifi.host.addSensor("port-speed", { device: SWITCH, port: 2 })
    const poe1 = await unifi.host.addSensor("port-poe", { device: SWITCH, port: 1 })
    const poe3 = await unifi.host.addSensor("port-poe", { device: SWITCH, port: 3 })
    const poe9 = await unifi.host.addSensor("port-poe", { device: SWITCH, port: 9 })
    const missing = await unifi.host.addSensor("port-link", { device: SWITCH, port: 12 })
    assert.deepEqual([link1, link2, speed3, speed2, poe1, poe3].map(id => unifi.host.values(id)[0]),
      [Value.boolean(true), Value.boolean(false), Value.number(100), Value.number(0), Value.string("UP"), Value.string("OFF")])
    assert.match(unifi.errors(poe9)[0] ?? "", /port 9 of Garage Switch has no PoE/)
    assert.match(unifi.errors(missing)[0] ?? "", /Garage Switch has no port 12/)
  } finally {
    await unifi.stop()
  }
})

test("an access point's port is read once a port signal needs it", async () => {
  const unifi = await UnifiHarness.start()
  try {
    assert.equal(unifi.fake.calls(new RegExp(`devices/${AP_ID}$`)).length, 0, "the poll reads switches' ports only")
    const link = await unifi.host.addSensor("port-link", { device: AP, port: 1 })
    await unifi.tick()
    assert.deepEqual(unifi.host.values(link), [Value.boolean(true)])
    await unifi.host.remove(link)
    const before = unifi.fake.calls(new RegExp(`devices/${AP_ID}$`)).length
    await unifi.tick()
    assert.equal(unifi.fake.calls(new RegExp(`devices/${AP_ID}$`)).length, before, "no longer read once the signal is gone")
  } finally {
    await unifi.stop()
  }
})
