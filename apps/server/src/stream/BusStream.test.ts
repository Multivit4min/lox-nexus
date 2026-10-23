import assert from "node:assert/strict"
import { once } from "node:events"
import { after, before, describe, test } from "node:test"
import type { StreamEvent } from "@lox-nexus/api"
import { Value } from "@lox-nexus/plugin-sdk/values"
import WebSocket from "ws"
import type { ApiClient } from "../test-support/ApiClient.ts"
import { TestApp } from "../test-support/TestApp.ts"

/** collects stream events and waits for one matching a predicate */
class StreamProbe {
  readonly events: StreamEvent[] = []
  constructor(readonly socket: WebSocket) {
    socket.on("message", data => this.events.push(JSON.parse(String(data)) as StreamEvent))
  }

  async next(predicate: (event: StreamEvent) => boolean): Promise<StreamEvent> {
    for (;;) {
      const found = this.events.find(predicate)
      if (found) return found
      await once(this.socket, "message", { signal: AbortSignal.timeout(2000) })
    }
  }
}

describe("bus stream", { timeout: 10_000 }, () => {
  let app: TestApp
  let admin: ApiClient
  const user = { source: { kind: "user" as const, id: "test" } }

  before(async () => {
    app = await TestApp.start()
    admin = await app.admin()
  })
  after(() => app.dispose())

  const connect = async (headers: Record<string, string>) => {
    const socket = new WebSocket(`${app.address.replace("http", "ws")}/api/stream`, { headers })
    const probe = new StreamProbe(socket)
    await once(socket, "open")
    return probe
  }

  test("refuses connections without a session", async () => {
    const socket = new WebSocket(`${app.address.replace("http", "ws")}/api/stream`)
    const [, response] = await once(socket, "unexpected-response") as [unknown, { statusCode: number }]
    assert.equal(response.statusCode, 401)
  })

  test("streams matching bus messages in batches and the current state", async () => {
    app.app.bus.publish("a/one", Value.number(1), user)
    const stream = await connect({ cookie: admin.cookieHeader! })
    const socket = stream.socket
    // requests are handled in order, so once the state answer arrives the bus subscription is active too
    socket.send(JSON.stringify({ type: "subscribe", stream: "bus", pattern: "a/#" }))
    socket.send(JSON.stringify({ type: "subscribe", stream: "state", pattern: "a/#" }))
    const initial = await stream.next(e => e.type === "state")
    assert.deepEqual(initial.type === "state" && initial.messages.map(m => m.topic), ["a/one"])
    for (let i = 2; i <= 4; i++) app.app.bus.publish("a/one", Value.number(i), user)
    app.app.bus.publish("b/other", Value.number(1), user)
    const batch = await stream.next(e => e.type === "bus")
    assert.deepEqual(batch.type === "bus" && batch.messages.map(m => m.value), [Value.number(2), Value.number(3), Value.number(4)])
    const coalesced = await stream.next(e => e.type === "state" && e !== initial)
    assert.deepEqual(coalesced.type === "state" && coalesced.messages.map(m => m.value), [Value.number(4)])
    socket.send("not json")
    const error = await stream.next(e => e.type === "error")
    assert.match(error.type === "error" ? error.message : "", /invalid request/)
    const closed = once(socket, "close")
    socket.close()
    await closed
  })

  test("closed connections are forgotten", async () => {
    const before = app.app.streams!.size
    const stream = await connect({ cookie: admin.cookieHeader! })
    stream.socket.send(JSON.stringify({ type: "subscribe", stream: "state", pattern: "#" }))
    await stream.next(e => e.type === "state")
    assert.equal(app.app.streams!.size, before + 1)
    const closed = once(stream.socket, "close")
    stream.socket.close()
    await closed
    // the server sees the close after the client; poll the condition instead of sleeping a fixed time
    for (let i = 0; i < 100 && app.app.streams!.size > before; i++) await new Promise(resolve => setImmediate(resolve))
    assert.equal(app.app.streams!.size, before)
  })
})
