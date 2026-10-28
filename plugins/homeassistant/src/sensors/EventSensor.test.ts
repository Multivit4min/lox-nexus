import assert from "node:assert/strict"
import { afterEach, describe, test } from "node:test"
import { PluginTestHost, TestClock } from "@lox-nexus/plugin-sdk/testing"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { HomeAssistantPlugin } from "../HomeAssistantPlugin.ts"
import { FakeHomeAssistant } from "../test-support/FakeHomeAssistant.ts"
import { waitFor } from "../test-support/waitFor.ts"

const text = (value: string) => Value.string(value)
const bool = (value: boolean) => Value.boolean(value)

describe("HomeAssistantPlugin: event sensor", { timeout: 15_000 }, () => {
  const cleanup: Array<() => Promise<void>> = []
  afterEach(async () => {
    for (const step of cleanup.splice(0).reverse()) await step()
  })

  const setup = async () => {
    const ha = await FakeHomeAssistant.start()
    cleanup.push(() => ha.close())
    const clock = new TestClock("2026-10-28T07:30:00Z")
    const host = await PluginTestHost.start(HomeAssistantPlugin, { config: { url: ha.url, token: FakeHomeAssistant.TOKEN }, clock })
    cleanup.push(() => host.stop())
    return { ha, host, clock }
  }

  test("a matching event sends its data field, and empty text after the pulse", async () => {
    const { ha, host, clock } = await setup()
    const remote = await host.addSensor("event", { eventType: "zha_event", filter: { device_ieee: "00:11", endpoint_id: "1" } })
    assert.deepEqual(host.values(remote), [text("")], "starts empty")
    await waitFor(() => ha.subscriptions("zha_event") === 1)
    const next = host.next(remote)
    ha.fire("zha_event", { device_ieee: "99:99", endpoint_id: 1, command: "off" })
    ha.fire("zha_event", { device_ieee: "00:11", endpoint_id: 2, command: "off" })
    ha.fire("zha_event", { device_ieee: "00:11", endpoint_id: 1, args: [] })
    ha.fire("zha_event", { device_ieee: "00:11", endpoint_id: 1, command: "on", args: [] })
    assert.deepEqual(await next, text("on"), "another device, another endpoint and an event without a command send nothing; numbers match as text")
    await clock.advance(999)
    assert.deepEqual(host.values(remote), [text(""), text("on")])
    await clock.advance(1)
    assert.deepEqual(host.values(remote), [text(""), text("on"), text("")], "back to empty, so the same command again registers")
  })

  test("two sensors of a type share one subscription; a pulse is extended by an event during it", async () => {
    const { ha, host, clock } = await setup()
    const command = await host.addSensor("event", { eventType: "deconz_event", field: "event" })
    const pulse = await host.addSensor("event", { eventType: "deconz_event", filter: { "params.side": 2 }, send: "pulse", pulseMs: 1000 })
    assert.deepEqual(host.values(pulse), [bool(false)])
    await waitFor(() => ha.subscriptions("deconz_event") === 1)
    let next = host.next(pulse)
    ha.fire("deconz_event", { id: "cube", event: 1002, params: { side: 2 } })
    assert.deepEqual(await next, bool(true))
    await clock.advance(600)
    next = host.next(command)
    ha.fire("deconz_event", { id: "cube", event: 1004, params: { side: 2 } })
    assert.deepEqual(await next, text("1004"), "the field as text; the second event has arrived")
    // the second true is sent again; the bus drops it as equal to the one before
    await clock.advance(600)
    assert.deepEqual(host.values(pulse), [bool(false), bool(true), bool(true)], "still on: the second event restarted the pulse")
    await clock.advance(400)
    assert.deepEqual(host.values(pulse).at(-1), bool(false))
    assert.equal(ha.subscriptions("deconz_event"), 1, "one subscription for both")
    const panel = await host.panel()
    assert.ok(panel?.type === "keyValue" && panel.items.some(item => item.label === "Event types followed" && item.value === "deconz_event"))
  })

  test("removing the last sensor of a type unsubscribes", async () => {
    const { ha, host } = await setup()
    const first = await host.addSensor("event", { eventType: "zha_event" })
    const second = await host.addSensor("event", { eventType: "zha_event", send: "pulse" })
    await waitFor(() => ha.subscriptions("zha_event") === 1)
    await host.remove(first)
    assert.deepEqual(ha.unsubscribed, [], "the other sensor still uses it")
    await host.remove(second)
    await waitFor(() => ha.subscriptions("zha_event") === 0)
    assert.deepEqual(ha.unsubscribed, ["zha_event"])
  })

  test("after a reconnect every type in use is subscribed again, also one added meanwhile", async () => {
    const { ha, host, clock } = await setup()
    const zha = await host.addSensor("event", { eventType: "zha_event" })
    await waitFor(() => ha.subscriptions("zha_event") === 1)
    ha.dropConnections()
    await waitFor(() => host.status.status === "degraded")
    const tags = await host.addSensor("event", { eventType: "tag_scanned", field: "tag_id" })
    await clock.advance(1000)
    await waitFor(() => host.status.status === "running", "reconnected after the first backoff")
    await waitFor(() => ha.subscriptions("zha_event") === 1 && ha.subscriptions("tag_scanned") === 1)
    const nextZha = host.next(zha)
    const nextTag = host.next(tags)
    ha.fire("zha_event", { command: "toggle" })
    ha.fire("tag_scanned", { tag_id: "front-door" })
    assert.deepEqual([await nextZha, await nextTag], [text("toggle"), text("front-door")])
  })

  test("a refused subscription fails the signal", async () => {
    const { ha, host } = await setup()
    ha.refusedEvents.add("call_service")
    const id = await host.addSensor("event", { eventType: "call_service", field: "service" })
    await waitFor(() => host.sent.some(message => message.type === "signal.error" && message.signalId === id))
    const failure = host.sent.find(message => message.type === "signal.error" && message.signalId === id)
    assert.ok(failure?.type === "signal.error")
    assert.match(failure.error, /refused to subscribe to call_service: Unauthorized/)
    const later = await host.addSensor("event", { eventType: "call_service", send: "pulse" })
    assert.ok(host.sent.some(message => message.type === "signal.error" && message.signalId === later), "a later sensor of the type fails too")
  })

  test("a refused type is subscribed again after a reconnect, and the failure clears", async () => {
    const { ha, host, clock } = await setup()
    ha.refusedEvents.add("zha_event")
    const id = await host.addSensor("event", { eventType: "zha_event" })
    await waitFor(() => host.sent.some(message => message.type === "signal.error" && message.signalId === id))
    let panel = await host.panel()
    assert.ok(panel?.type === "keyValue" && panel.items.some(item => item.value === "zha_event (refused)"))
    ha.refusedEvents.clear()
    ha.dropConnections()
    await waitFor(() => host.status.status === "degraded")
    await clock.advance(1000)
    await waitFor(() => host.sent.some(message => message.type === "signal.recovered" && message.signalId === id), "the failure cleared")
    assert.equal(ha.subscriptions("zha_event"), 1)
    panel = await host.panel()
    assert.ok(panel?.type === "keyValue" && panel.items.some(item => item.value === "zha_event"))
    const next = host.next(id)
    ha.fire("zha_event", { command: "on" })
    assert.deepEqual(await next, text("on"))
  })

  test("stopping during a pulse leaves no timer, connection or subscription", async () => {
    const { ha, host, clock } = await setup()
    const id = await host.addSensor("event", { eventType: "zha_event", send: "pulse" })
    await waitFor(() => ha.subscriptions("zha_event") === 1)
    const next = host.next(id)
    ha.fire("zha_event", { command: "on" })
    await next
    await host.stop()
    assert.equal(clock.pending, 0, "no pulse reset and no ping timer")
    await waitFor(() => ha.clients === 0 && ha.subscriptions("zha_event") === 0)
  })

  test("params are checked", async () => {
    const { host } = await setup()
    await assert.rejects(host.addSensor("event", { eventType: "zha event" }), /without spaces/)
    await assert.rejects(host.addSensor("event", { eventType: "*" }), /not \* \(every event\)/)
    await assert.rejects(host.addSensor("event", { eventType: "zha_event", pulseMs: 10 }))
  })
})
