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
  closed: number | undefined
  pings = 0
  terminated = false
  send(data: string) {
    this.sent.push(JSON.parse(data) as StreamEvent)
  }
  ping() {
    this.pings++
  }
  terminate() {
    this.terminated = true
  }
  close(code: number) {
    this.closed = code
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
    client = new StreamClient(socket as unknown as WebSocket, bus, { token: "t", tokenHash: "h", userId: "u" })
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

  test("state: a release restores the real value, or clears a topic that never had one", () => {
    socket.request({ type: "subscribe", stream: "state", pattern: "a/#" })
    bus.publish("a/real", Value.number(1), user)
    bus.force("a/real", Value.number(5), { by: "t" })
    bus.force("a/only", Value.number(7), { by: "t" })
    mock.timers.tick(StreamClient.FLUSH_MS)
    socket.sent.length = 0
    bus.release("a/real", "t")
    bus.release("a/only", "t")
    mock.timers.tick(StreamClient.FLUSH_MS)
    const states = socket.sent.filter((e): e is Extract<StreamEvent, { type: "state" }> => e.type === "state")
    assert.deepEqual(states.map(e => [e.messages.map(m => [m.topic, m.value, m.flags?.forced]), e.cleared]), [
      [[["a/real", Value.number(1), undefined]], ["a/only"]]
    ])
  })

  test("state: a force released within one batch is sent as cleared, not as the forced value", () => {
    socket.request({ type: "subscribe", stream: "state", pattern: "a/#" })
    socket.sent.length = 0
    bus.force("a/brief", Value.number(7), { by: "t" })
    bus.release("a/brief", "t")
    mock.timers.tick(StreamClient.FLUSH_MS)
    const states = socket.sent.filter((e): e is Extract<StreamEvent, { type: "state" }> => e.type === "state")
    assert.deepEqual(states.map(e => [e.messages.length, e.cleared]), [[0, ["a/brief"]]])
  })

  test("state: an actuator shows its last sent command; a release keeps the forced value it last got", () => {
    const states = () => socket.sent.filter((e): e is Extract<StreamEvent, { type: "state" }> => e.type === "state")
      .map(e => [e.messages.map(m => [m.topic, m.value, m.flags?.forced]), e.cleared])
    socket.request({ type: "subscribe", stream: "state", pattern: "a/#" })
    socket.sent.length = 0
    bus.command("a/actuator", Value.number(1), user)
    mock.timers.tick(StreamClient.FLUSH_MS)
    bus.force("a/actuator", Value.number(20), { by: "t", kind: "command" })
    bus.command("a/actuator", Value.number(2), user)
    mock.timers.tick(StreamClient.FLUSH_MS)
    bus.release("a/actuator", "t")
    mock.timers.tick(StreamClient.FLUSH_MS)
    assert.deepEqual(states(), [
      [[["a/actuator", Value.number(1), undefined]], undefined],
      [[["a/actuator", Value.number(20), true]], undefined],
      [[["a/actuator", Value.number(20), undefined]], undefined]
    ], "the command shadowed by the force never reached the device, so it isn't shown")
    socket.sent.length = 0
    socket.request({ type: "subscribe", stream: "state", pattern: "a/#" })
    assert.deepEqual(states(), [[[["a/actuator", Value.number(20), undefined]], undefined]], "a new snapshot has it too")
  })

  test("a new pattern discards what was queued for the old one", () => {
    bus.publish("a/x", Value.number(1), user)
    socket.request({ type: "subscribe", stream: "bus", pattern: "b/#" })
    bus.publish("b/x", Value.number(2), user)
    mock.timers.tick(StreamClient.FLUSH_MS)
    const batch = socket.sent[0]
    assert.deepEqual(batch?.type === "bus" && batch.messages.map(m => m.topic), ["b/x"])
  })

  test("a client that stops answering pings is terminated", () => {
    mock.timers.tick(StreamClient.HEARTBEAT_MS)
    assert.equal(socket.pings, 1)
    socket.emit("pong")
    mock.timers.tick(StreamClient.HEARTBEAT_MS)
    assert.equal(socket.terminated, false)
    mock.timers.tick(StreamClient.HEARTBEAT_MS)
    assert.equal(socket.terminated, true)
  })

  test("unsubscribing stops the stream; invalid patterns are refused", () => {
    socket.request({ type: "unsubscribe", stream: "bus" })
    bus.publish("a/x", Value.number(1), user)
    socket.request({ type: "subscribe", stream: "bus", pattern: "a/#/b" })
    mock.timers.tick(StreamClient.FLUSH_MS)
    assert.deepEqual(socket.sent.map(e => e.type), ["error"])
  })
})
