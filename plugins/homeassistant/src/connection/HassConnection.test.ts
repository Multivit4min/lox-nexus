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

  const setup = async () => {
    const ha = await FakeHomeAssistant.start()
    cleanup.push(() => ha.close())
    const warnings: string[] = []
    const entities = new EntityStore()
    const connection = new HassConnection(websocketUrl(ha.url), FakeHomeAssistant.TOKEN, entities, { warn: message => void warnings.push(message) }, timings())
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

  test("a call while disconnected says why", async () => {
    const { ha, connection } = await setup()
    await connection.start()
    await ha.close()
    await waitFor(() => !connection.connected)
    await assert.rejects(connection.callService("switch", "turn_on", {}, "switch.a"), /not connected to Home Assistant: /)
  })
})
