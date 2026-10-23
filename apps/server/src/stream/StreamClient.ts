import { StreamRequestSchema, type StreamEvent } from "@lox-nexus/api"
import { Topic, type BusMessage, type EventBus } from "@lox-nexus/core"
import { Disposable, type DisposableLike } from "@lox-nexus/plugin-sdk"
import type { WebSocket } from "ws"

export type StreamBus = Pick<EventBus, "tap" | "subscribe" | "currentMatching">

/**
 * One WebSocket client of /api/stream. Two independent subscriptions:
 * - bus: every recorded message matching the pattern (including shadowed, force and release),
 *   batched every FLUSH_MS. A slow client doesn't stall the bus: when its socket buffer is full
 *   or its queue overflows, messages are dropped and it gets a `gap` with the count instead.
 * - state: the current value per topic. The full state is sent on subscribe, then only the latest
 *   change per topic per flush (coalesced), so a busy topic costs one entry per batch.
 */
export class StreamClient extends Disposable {
  static readonly FLUSH_MS = 50
  static readonly MAX_QUEUED = 2000
  /** bytes the socket may have unsent before batches are dropped */
  static readonly MAX_BUFFERED = 1_048_576
  private readonly subscriptions = new Map<"bus" | "state", DisposableLike>()
  private queued: BusMessage[] = []
  private states = new Map<string, BusMessage>()
  private dropped = 0

  constructor(private readonly socket: WebSocket, private readonly bus: StreamBus) {
    super()
    this.listen(socket, "message", (data: Buffer) => this.onRequest(data))
    this.every(StreamClient.FLUSH_MS, () => this.flush())
    this.onDispose(() => this.subscriptions.forEach(subscription => void subscription.dispose()))
  }

  private onRequest(data: Buffer) {
    let request
    try {
      request = StreamRequestSchema.parse(JSON.parse(data.toString("utf8")))
      if (request.type === "subscribe") Topic.assertValidPattern(request.pattern)
    } catch (error) {
      return this.send({ type: "error", message: `invalid request: ${error instanceof Error ? error.message : String(error)}` })
    }
    void this.subscriptions.get(request.stream)?.dispose()
    this.subscriptions.delete(request.stream)
    if (request.type === "unsubscribe") return
    if (request.stream === "bus") this.subscribeBus(request.pattern)
    else this.subscribeState(request.pattern)
  }

  private subscribeBus(pattern: string) {
    this.subscriptions.set("bus", this.bus.tap(message => {
      if (!Topic.matches(pattern, message.topic)) return
      if (this.queued.length >= StreamClient.MAX_QUEUED) this.dropped++
      else this.queued.push(message)
    }))
  }

  private subscribeState(pattern: string) {
    this.states.clear()
    this.send({ type: "state", messages: this.bus.currentMatching(pattern) })
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

  private send(event: StreamEvent) {
    if (this.socket.readyState === this.socket.OPEN) this.socket.send(JSON.stringify(event))
  }
}
