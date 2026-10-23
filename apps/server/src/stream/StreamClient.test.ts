import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import { afterEach, beforeEach, describe, mock, test } from "node:test"
import type { StreamEvent } from "@lox-nexus/api"
import { EventBus } from "@lox-nexus/core"
import { Value } from "@lox-nexus/plugin-sdk/values"
import type { WebSocket } from "ws"
import { StreamClient } from "./StreamClient.ts"

/** the slice of a ws WebSocket that StreamClient uses */
class FakeSocket extends EventEmitter {
  readonly OPEN = 1
  readyState = 1
  bufferedAmount = 0
  readonly sent: StreamEvent[] = []
  send(data: string) {
    this.sent.push(JSON.parse(data) as StreamEvent)
  }
  request(body: unknown) {
    this.emit("message", Buffer.from(JSON.stringify(body)))
  }
}

describe("StreamClient backpressure", () => {
  const user = { source: { kind: "user" as const, id: "t" } }
  let bus: EventBus
  let socket: FakeSocket
  let client: StreamClient

  beforeEach(() => {
    mock.timers.enable({ apis: ["setInterval", "setTimeout"] })
    bus = new EventBus()
    socket = new FakeSocket()
    client = new StreamClient(socket as unknown as WebSocket, bus)
    socket.request({ type: "subscribe", stream: "bus", pattern: "#" })
  })
  afterEach(async () => {
    await client.dispose()
    mock.timers.reset()
  })

  test("a full socket buffer drops batches and reports a gap once it drains", () => {
    socket.bufferedAmount = StreamClient.MAX_BUFFERED + 1
    for (let i = 0; i < 3; i++) bus.publish("a/x", Value.number(i), user)
    mock.timers.tick(StreamClient.FLUSH_MS)
    assert.equal(socket.sent.length, 0)
    socket.bufferedAmount = 0
    bus.publish("a/x", Value.number(9), user)
    mock.timers.tick(StreamClient.FLUSH_MS)
    assert.deepEqual(socket.sent.map(e => e.type), ["gap", "bus"])
    assert.deepEqual(socket.sent[0], { type: "gap", dropped: 3 })
  })

  test("the queue between flushes is bounded", () => {
    for (let i = 0; i < StreamClient.MAX_QUEUED + 5; i++) bus.publish("a/x", Value.number(i), user)
    mock.timers.tick(StreamClient.FLUSH_MS)
    assert.deepEqual(socket.sent[0], { type: "gap", dropped: 5 })
    const batch = socket.sent[1]
    assert.equal(batch?.type === "bus" && batch.messages.length, StreamClient.MAX_QUEUED)
  })

  test("unsubscribing stops the stream; invalid patterns are refused", () => {
    socket.request({ type: "unsubscribe", stream: "bus" })
    bus.publish("a/x", Value.number(1), user)
    socket.request({ type: "subscribe", stream: "bus", pattern: "a/#/b" })
    mock.timers.tick(StreamClient.FLUSH_MS)
    assert.deepEqual(socket.sent.map(e => e.type), ["error"])
  })
})
