import assert from "node:assert/strict"
import { test } from "node:test"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { UnifiHarness } from "./test-support/UnifiHarness.ts"

test("Create voucher answers with the code and a QR code of it; the code sensor and the store follow", async () => {
  const unifi = await UnifiHarness.start()
  try {
    const code = await unifi.host.addSensor("voucher-code")
    assert.deepEqual(unifi.host.values(code), [])
    const answer = await unifi.host.actionAnswer("create-voucher", { minutes: 90, guests: 2, downloadKbps: 5000 })
    assert.deepEqual(answer, {
      message: "Voucher 4861409510, valid 1 h 30 min for 2 guests",
      panel: { type: "qr", data: "4861409510", caption: "Voucher code 4861409510" }
    })
    const posted = unifi.fake.calls(/hotspot\/vouchers$/, "POST")[0]!.body
    assert.deepEqual(posted, { count: 1, name: "Nexus", timeLimitMinutes: 90, authorizedGuestLimit: 2, rxRateLimitKbps: 5000 })
    assert.deepEqual(unifi.host.values(code), [Value.string("4861409510")])
    assert.equal((unifi.host.store.lastVoucher as { code: string }).code, "4861409510")
    const logs = JSON.stringify(unifi.host.sent.filter(message => message.type === "log"))
    assert.ok(!logs.includes("4861409510"), "the code isn't logged")
    assert.ok(unifi.host.sent.some(message => message.type === "panel.changed"))
  } finally {
    await unifi.stop()
  }
})

test("the code sensor shows the voucher of an earlier run; a pulse creates the next one", async () => {
  const stored = { code: "1111122222", name: "Loxone", createdAt: "2026-10-30T08:00:00Z", timeLimitMinutes: 60 }
  const unifi = await UnifiHarness.start({ store: { lastVoucher: stored } })
  try {
    const code = await unifi.host.addSensor("voucher-code")
    assert.deepEqual(unifi.host.values(code), [Value.string("1111122222")])
    const create = await unifi.host.addActuator("create-voucher", { minutes: 60 })
    await unifi.host.actuate(create, Value.boolean(true), undefined, true)
    assert.equal(unifi.fake.state.vouchers.length, 0, "a replay creates nothing")
    await unifi.host.actuate(create, Value.boolean(true))
    await unifi.host.actuate(create, Value.boolean(true))
    assert.equal(unifi.fake.state.vouchers.length, 1, "one per pulse")
    assert.deepEqual(unifi.host.values(code).at(-1), Value.string("4861409510"))
  } finally {
    await unifi.stop()
  }
})

test("List vouchers shows the usable ones; Delete voucher deletes by code", async () => {
  const unifi = await UnifiHarness.start()
  try {
    assert.equal(await unifi.host.action("list-vouchers"), "No usable vouchers")
    await unifi.host.action("create-voucher", {})
    await unifi.host.action("create-voucher", { minutes: 30 })
    const list = await unifi.host.actionAnswer("list-vouchers")
    assert.ok(typeof list === "object" && list.panel?.type === "table")
    assert.equal(list.panel.type === "table" && list.panel.rows.length, 2)
    assert.equal(await unifi.host.action("delete-voucher", { code: "4861409510" }), "Deleted 1 voucher")
    assert.deepEqual(unifi.fake.calls(/hotspot\/vouchers$/, "DELETE")[0]!.query.get("filter"), "code.eq('4861409510')")
    await assert.rejects(unifi.host.action("delete-voucher", { code: "4861409510" }), /no voucher has this code/)
    await assert.rejects(unifi.host.action("delete-voucher", { code: "x') or ('1" }))
  } finally {
    await unifi.stop()
  }
})
