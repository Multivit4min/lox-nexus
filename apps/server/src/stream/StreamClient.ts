import { StreamRequestSchema, type StreamEvent } from "@lox-nexus/api"
import { Topic, type BusMessage, type EventBus } from "@lox-nexus/core"
import { Disposable, type DisposableLike } from "@lox-nexus/plugin-sdk"
import type { WebSocket } from "ws"

export type StreamBus = Pick<EventBus, "tap" | "subscribe" | "currentMatching">

/** The session a connection was opened with; BusStream closes the connection when it ends. */
export interface StreamSession {
  token: string
  tokenHash: string
  userId: string
}

/**
 * One WebSocket client of /api/stream. Two independent subscriptions:
 * - bus: every recorded message matching the pattern (including shadowed, force and release),
 *   batched every FLUSH_MS. A slow client doesn't stall the bus: when its socket buffer is full
 *   or its queue overflows, messages are dropped and it gets a `gap` with the count instead.
 * - state: the full current state on subscribe (`full: true`), then only the latest change per
 *   topic per flush, so a busy topic costs one entry per batch.
 * A ping every HEARTBEAT_MS without a pong since the last one terminates a half-open connection.
 */
export class StreamClient extends Disposable {
  static readonly FLUSH_MS = 50
  static readonly HEARTBEAT_MS = 30_000
  static readonly MAX_QUEUED = 2000
  /** bytes the socket may have unsent before batches are dropped */
  static readonly MAX_BUFFERED = 1_048_576
  private readonly subscriptions = new Map<"bus" | "state", DisposableLike>()
  private queued: BusMessage[] = []
  private states = new Map<string, BusMessage>()
  private dropped = 0
  private alive = true

  constructor(private readonly socket: WebSocket, private readonly bus: StreamBus, readonly session: StreamSession) {
    super()
    this.listen(socket, "message", (data: Buffer) => this.onRequest(data))
    this.listen(socket, "pong", () => (this.alive = true))
    this.every(StreamClient.FLUSH_MS, () => this.flush())
    this.every(StreamClient.HEARTBEAT_MS, () => this.heartbeat())
    this.onDispose(() => this.subscriptions.forEach(subscription => void subscription.dispose()))
  }

  /** closes the socket; the "close" event then disposes this client (see BusStream) */
  close(code: number, reason: string) {
    this.socket.close(code, reason)
  }

  private onRequest(data: Buffer) {
    let request
    try {
      request = StreamRequestSchema.parse(JSON.parse(data.toString("utf8")))
      if (request.type === "subscribe") Topic.assertValidPattern(request.pattern)
    } catch (error) {
      return this.send({ type: "error", message: `invalid request: ${error instanceof Error ? error.message : String(error)}` })
    }
    this.drop(request.stream)
    if (request.type === "unsubscribe") return
    if (request.stream === "bus") this.subscribeBus(request.pattern)
    else this.subscribeState(request.pattern)
  }

  // whatever was queued for the old subscription belongs to a pattern the client no longer wants
  private drop(stream: "bus" | "state") {
    void this.subscriptions.get(stream)?.dispose()
    this.subscriptions.delete(stream)
    if (stream === "bus") {
      this.queued = []
      this.dropped = 0
    } else {
      this.states = new Map()
    }
  }

  private subscribeBus(pattern: string) {
    this.subscriptions.set("bus", this.bus.tap(message => {
      if (!Topic.matches(pattern, message.topic)) return
      if (this.queued.length >= StreamClient.MAX_QUEUED) this.dropped++
      else this.queued.push(message)
    }))
  }

  private subscribeState(pattern: string) {
    this.send({ type: "state", messages: this.bus.currentMatching(pattern), full: true })
    this.subscriptions.set("state", this.bus.subscribe(pattern, message => {
      if (message.kind === "state") this.states.set(message.topic, message)
    }))
  }

  private flush() {
    if (this.socket.readyState !== this.socket.OPEN) return
    if (this.socket.bufferedAmount > StreamClient.MAX_BUFFERED) {
      this.dropped += this.queued.length
      this.queued = []
      return
    }
    if (this.dropped > 0) this.send({ type: "gap", dropped: this.dropped })
    this.dropped = 0
    if (this.queued.length > 0) this.send({ type: "bus", messages: this.queued })
    if (this.states.size > 0) this.send({ type: "state", messages: [...this.states.values()] })
    this.queued = []
    this.states = new Map()
  }

  private heartbeat() {
    if (!this.alive) return this.socket.terminate()
    this.alive = false
    this.socket.ping()
  }

  private send(event: StreamEvent) {
    if (this.socket.readyState === this.socket.OPEN) this.socket.send(JSON.stringify(event))
  }
}
