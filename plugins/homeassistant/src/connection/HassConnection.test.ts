import assert from "node:assert/strict"
import { afterEach, describe, test } from "node:test"
import { EntityStore } from "../entities/EntityStore.ts"
import { websocketUrl } from "../HomeAssistantConfig.ts"
import { FakeHomeAssistant } from "../test-support/FakeHomeAssistant.ts"
import { waitFor } from "../test-support/waitFor.ts"
import { Backoff } from "./Backoff.ts"
import { HassConnection } from "./HassConnection.ts"

/** short timings, so reconnects and ping timeouts happen within milliseconds */
const timings = () => ({ pingMs: 20, timeoutMs: 100, serviceTimeoutMs: 100, backoff: new Backoff(5, 20) })

describe("HassConnection", { timeout: 10_000 }, () => {
  const cleanup: Array<() => Promise<void>> = []
  afterEach(async () => {
    for (const step of cleanup.splice(0).reverse()) await step()
  })

  const setup = async (adjusted: Partial<ReturnType<typeof timings>> = {}) => {
    const ha = await FakeHomeAssistant.start()
    cleanup.push(() => ha.close())
    const warnings: string[] = []
    const entities = new EntityStore()
    const connection = new HassConnection(websocketUrl(ha.url), FakeHomeAssistant.TOKEN, entities, { warn: message => void warnings.push(message) }, { ...timings(), ...adjusted })
    cleanup.push(() => connection.dispose())
    const events: string[] = []
    connection.events.on("connected", () => events.push("connected"))
    connection.events.on("disconnected", reason => events.push(`disconnected: ${reason}`))
    connection.events.on("rejected", () => events.push("rejected"))
    return { ha, connection, entities, events, warnings }
  }

  test("a token revoked while disconnected stops the retries for good", async () => {
    const { ha, connection, events } = await setup()
    await connection.start()
    ha.token = "revoked"
    ha.dropConnections()
    await waitFor(() => events.includes("rejected"))
    const attempts = ha.authAttempts
    await new Promise(resolve => setTimeout(resolve, 100))
    assert.deepEqual([ha.authAttempts, connection.connected], [attempts, false], "no login attempt after the rejection")
    assert.match(connection.lastProblem ?? "", /rejected the token/)
  })

  test("a server that stops answering pings is dropped and reconnected", async () => {
    const { ha, connection, events } = await setup()
    await connection.start()
    ha.silent = true
    await waitFor(() => events.some(event => event.includes("didn't answer a ping")))
    ha.silent = false
    await waitFor(() => events.filter(event => event === "connected").length === 2)
  })

  test("a long outage is reported once, not on every retry", async () => {
    const ha = await FakeHomeAssistant.start()
    const url = ha.url
    await ha.close()
    const unreachable = new HassConnection(websocketUrl(url), "t", new EntityStore(), { warn: () => undefined }, timings())
    cleanup.push(() => unreachable.dispose())
    const reports: string[] = []
    unreachable.events.on("disconnected", reason => reports.push(reason))
    await unreachable.start()
    await waitFor(() => unreachable.reconnects >= 3)
    assert.equal(reports.length, 1)
  })

  test("disposing while connecting or waiting to retry leaves nothing running", async () => {
    const { ha, connection } = await setup()
    const starting = connection.start()
    await connection.dispose()
    await starting
    await new Promise(resolve => setTimeout(resolve, 50))
    assert.deepEqual([ha.clients, connection.connected], [0, false], "the handshake was cancelled")

    const url = ha.url
    await ha.close()
    const waiting = new HassConnection(websocketUrl(url), "t", new EntityStore(), { warn: () => undefined }, timings())
    await waiting.start()
    await waiting.dispose()
    const reconnects = waiting.reconnects
    await new Promise(resolve => setTimeout(resolve, 50))
    assert.equal(waiting.reconnects, reconnects, "no retry after dispose")
  })

  test("an unreadable full list reconnects; an unreadable later event is skipped", async () => {
    const { ha, connection, entities, events, warnings } = await setup()
    ha.set("switch.a", "on")
    ha.firstEvent = { a: { "switch.a": { s: 1 } } }
    await connection.start()
    await waitFor(() => events.some(event => event.includes("unreadable entity list")))
    ha.firstEvent = undefined
    await waitFor(() => entities.loaded, "the next connection loaded the list")
    ha.broadcast({ c: "nonsense" })
    ha.set("switch.a", "off")
    await waitFor(() => entities.get("switch.a")?.state === "off")
    assert.equal(warnings.length, 2)
  })

  test("an event type dropped while its subscription is pending is unsubscribed once confirmed", async () => {
    const { ha, connection } = await setup()
    await connection.start()
    const listener = { event: () => undefined, subscribed: () => undefined, refused: () => undefined }
    const stop = connection.busEvents.add("zha_event", listener)
    stop()
    assert.deepEqual(connection.busEvents.eventTypes, [])
    await waitFor(() => ha.unsubscribed.length === 1)
    assert.equal(ha.subscriptions("zha_event"), 0)
    const received: unknown[] = []
    connection.busEvents.add("zha_event", { ...listener, event: data => void received.push(data) })
    await waitFor(() => ha.subscriptions("zha_event") === 1)
    ha.fire("zha_event", { command: "on" })
    await waitFor(() => received.length === 1)
  })

  /** a listener that collects the events' data */
  const collector = () => {
    const received: unknown[] = []
    return { received, listener: { event: (data: unknown) => void received.push(data), subscribed: () => undefined, refused: () => undefined } }
  }

  test("a subscribe_events Home Assistant doesn't answer drops the connection, and the next one subscribes", async () => {
    const { ha, connection, events } = await setup()
    await connection.start()
    ha.unanswered.add("zha_event")
    const { received, listener } = collector()
    connection.busEvents.add("zha_event", listener)
    await waitFor(() => events.includes("disconnected: didn't confirm subscribe_events for zha_event"))
    await waitFor(() => ha.subscriptions("zha_event") === 1, "subscribed on the new connection")
    assert.equal(connection.busEvents.status("zha_event"), "subscribed")
    ha.fire("zha_event", { command: "on" })
    await waitFor(() => received.length === 1)
  })

  test("a connection lost while subscribe_events is pending ends with exactly one subscription", async () => {
    // a long request timeout, so only the drop ends the pending subscribe
    const { ha, connection, events } = await setup({ timeoutMs: 5000 })
    await connection.start()
    ha.unanswered.add("zha_event")
    const { received, listener } = collector()
    connection.busEvents.add("zha_event", listener)
    await waitFor(() => ha.subscribeRequests.length === 1)
    assert.equal(connection.busEvents.status("zha_event"), "pending")
    ha.dropConnections()
    await waitFor(() => events.filter(event => event === "connected").length === 2)
    await waitFor(() => connection.busEvents.status("zha_event") === "subscribed")
    assert.deepEqual([ha.subscribeRequests, ha.subscriptions("zha_event")], [["zha_event", "zha_event"], 1])
    ha.fire("zha_event", { command: "on" })
    ha.fire("zha_event", { command: "off" })
    await waitFor(() => received.length === 2)
    await new Promise(resolve => setTimeout(resolve, 20))
    assert.equal(received.length, 2, "each event once")
  })

  test("a call while disconnected says why", async () => {
    const { ha, connection } = await setup()
    await connection.start()
    await ha.close()
    await waitFor(() => !connection.connected)
    await assert.rejects(connection.callService("switch", "turn_on", {}, "switch.a"), /not connected to Home Assistant: /)
  })
})
