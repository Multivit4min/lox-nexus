import assert from "node:assert/strict"
import { test } from "node:test"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { UnifiHarness } from "./test-support/UnifiHarness.ts"

test("a client by MAC is connected, with its access point and IP, until it leaves the connected list", async () => {
  const unifi = await UnifiHarness.start()
  try {
    const connected = await unifi.host.addSensor("client-connected", { client: "02-00-00-00-10-01" })
    const uplink = await unifi.host.addSensor("client-uplink", { client: "020000001001" })
    const ip = await unifi.host.addSensor("client-ip", { client: "02:00:00:00:10:01" })
    assert.deepEqual(unifi.host.values(connected), [Value.boolean(true)])
    assert.deepEqual(unifi.host.values(uplink), [Value.string("Hall AP")])
    assert.deepEqual(unifi.host.values(ip), [Value.string("192.0.2.21")])

    unifi.fake.state.clients = unifi.fake.state.clients.filter(client => client.name !== "Phone A")
    await unifi.tick()
    assert.deepEqual(unifi.host.values(connected).at(-1), Value.boolean(false))
    assert.deepEqual(unifi.host.values(uplink).at(-1), Value.string(""))
    assert.deepEqual(unifi.host.values(ip).at(-1), Value.string(""))
  } finally {
    await unifi.stop()
  }
})

test("by name a rotating MAC address doesn't matter, and case and spaces are ignored", async () => {
  const unifi = await UnifiHarness.start()
  try {
    const phone = await unifi.host.addSensor("client-connected", { client: " phone b ", matchBy: "name" })
    assert.deepEqual(unifi.host.values(phone), [Value.boolean(true)])
    const entry = unifi.fake.state.clients.find(client => client.name === "Phone B")!
    entry.macAddress = "06:11:22:33:44:55"
    await unifi.tick()
    assert.ok(unifi.host.values(phone).every(value => Value.equals(value, Value.boolean(true))), "still connected under its new address")
    await assert.rejects(unifi.host.addSensor("client-connected", { client: "Phone B" }), /MAC address/)
  } finally {
    await unifi.stop()
  }
})

test("a VPN client is where its type says, a wired one at its switch", async () => {
  const unifi = await UnifiHarness.start()
  try {
    const vpn = await unifi.host.addSensor("client-uplink", { client: "Remote Laptop", matchBy: "name" })
    const wired = await unifi.host.addSensor("client-uplink", { client: "02:00:00:00:10:02" })
    assert.deepEqual(unifi.host.values(vpn), [Value.string("VPN")])
    assert.deepEqual(unifi.host.values(wired), [Value.string("Garage Switch")])
  } finally {
    await unifi.stop()
  }
})

test("long lists are read page by page up to totalCount", async () => {
  const unifi = await UnifiHarness.start({ prepare: fake => (fake.state.pageLimit = 2) })
  try {
    const last = await unifi.host.addSensor("client-connected", { client: "Phone B", matchBy: "name" })
    assert.deepEqual(unifi.host.values(last), [Value.boolean(true)], "the client on the third page is found")
    const offsets = unifi.fake.calls(/\/clients$/).slice(0, 3).map(request => request.query.get("offset"))
    assert.deepEqual(offsets, ["0", "2", "4"])
    assert.ok(unifi.fake.calls(/\/clients$/).every(request => request.query.get("limit") === "200"))
  } finally {
    await unifi.stop()
  }
})
