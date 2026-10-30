import { StreamRequestSchema, type StaleSignalDto, type StreamEvent } from "@lox-nexus/api"
import { Topic, type BusMessage, type EventBus } from "@lox-nexus/core"
import { Disposable, type DisposableLike } from "@lox-nexus/plugin-sdk"
import type { WebSocket } from "ws"

/** the slice of EventBus a client needs; tap() sees every message including shadowed ones, subscribe() only effective ones */
export type StreamBus = Pick<EventBus, "tap" | "subscribe" | "currentMatching" | "current" | "lastCommand" | "lastCommandsMatching">

/** Which signals are stale; StaleWatcher in the app. */
export interface SignalStatusSource {
  list(): StaleSignalDto[]
  onChange(listener: (stale: StaleSignalDto[]) => void): () => void
}

/** The session a connection was opened with; BusStream closes the connection when it ends. */
export interface StreamSession {
  /** the raw cookie token, kept to re-validate expiry; never sent to the client */
  token: string
  /** SessionService.hash(token), matched against "revoked" events */
  tokenHash: string
  userId: string
}

/**
 * One WebSocket client of /api/stream. Two independent subscriptions:
 * - bus: every recorded message matching the pattern (including shadowed, force and release),
 *   batched every FLUSH_MS. A slow client doesn't stall the bus: when its socket buffer is full
 *   or its queue overflows, messages are dropped and it gets a `gap` with the count instead.
 * - state: the full current state on subscribe (`full: true`), then only the latest change per
 *   topic per flush, so a busy topic costs one entry per batch. A release that leaves a topic
 *   without a value (it was forced before any real value arrived) is sent as `cleared`. The
 *   stale signals come with it (`signal-status`): all of them on subscribe and on every change.
 * A ping every HEARTBEAT_MS without a pong since the last one terminates a half-open connection.
 */
export class StreamClient extends Disposable {
  /** batching interval; the latency a browser sees for any update */
  static readonly FLUSH_MS = 50
  /** ping interval; a connection that missed one pong is terminated at the next tick */
  static readonly HEARTBEAT_MS = 30_000
  /** messages queued per flush before further ones are counted as dropped */
  static readonly MAX_QUEUED = 2000
  /** bytes the socket may have unsent before batches are dropped */
  static readonly MAX_BUFFERED = 1_048_576
  private readonly subscriptions = new Map<"bus" | "state", DisposableLike>()
  private queued: BusMessage[] = []
  private states = new Map<string, BusMessage>()
  private released = new Set<string>()
  /** the stale set to send at the next flush, when it changed */
  private stale: StaleSignalDto[] | undefined
  private dropped = 0
  private alive = true

  /** Starts listening to the socket at once; nothing is sent until the client subscribes. */
  constructor(private readonly socket: WebSocket, private readonly bus: StreamBus, readonly session: StreamSession, private readonly status?: SignalStatusSource) {
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

  // invalid JSON, schema or pattern is answered with an `error` event; the connection stays open
  private onRequest(data: Buffer) {
    let request
    try {
      request = StreamRequestSchema.parse(JSON.parse(data.toString("utf8")))
      if (request.type === "subscribe") Topic.assertValidPattern(request.pattern)
    } catch (error) {
      return this.send({ type: "error", message: `invalid request: ${error instanceof Error ? error.message : String(error)}` })
    }
    this.resetStream(request.stream)
    if (request.type === "unsubscribe") return
    if (request.stream === "bus") this.subscribeBus(request.pattern)
    else this.subscribeState(request.pattern)
  }

  // whatever was queued for the old subscription belongs to a pattern the client no longer wants
  private resetStream(stream: "bus" | "state") {
    void this.subscriptions.get(stream)?.dispose()
    this.subscriptions.delete(stream)
    if (stream === "bus") {
      this.queued = []
      this.dropped = 0
    } else {
      this.states = new Map()
      this.released = new Set()
      this.stale = undefined
    }
  }

  private subscribeBus(pattern: string) {
    this.subscriptions.set("bus", this.bus.tap(message => {
      if (!Topic.matches(pattern, message.topic)) return
      if (this.queued.length >= StreamClient.MAX_QUEUED) this.dropped++
      else this.queued.push(message)
    }))
  }

  // the full snapshot is sent before subscribing; both run synchronously, so no change can fall between them
  private subscribeState(pattern: string) {
    this.send({ type: "state", messages: StreamClient.snapshot(this.bus, pattern), full: true })
    // a command (a plugin actuator) shows as its last sent value; shadowed ones never get here
    const states = this.bus.subscribe(pattern, message => {
      if (message.kind === "state" || message.kind === "command") this.states.set(message.topic, message)
    })
    // subscribe() doesn't deliver releases; they matter when no value is restored
    const releases = this.bus.tap(message => {
      if (message.kind === "release" && Topic.matches(pattern, message.topic)) this.released.add(message.topic)
    })
    if (this.status) this.send({ type: "signal-status", stale: this.status.list() })
    const status = this.status?.onChange(stale => (this.stale = stale))
    this.subscriptions.set("state", { dispose: () => void [states.dispose(), releases.dispose(), status?.()] })
  }

  /** the current values, and for topics without one (actuators) the last command sent */
  private static snapshot(bus: StreamBus, pattern: string) {
    const current = bus.currentMatching(pattern)
    const topics = new Set(current.map(message => message.topic))
    return [...current, ...bus.lastCommandsMatching(pattern).filter(message => !topics.has(message.topic))]
  }

  // runs every FLUSH_MS; when the socket is backed up the batch is counted as dropped instead of buffered further
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
    // checked at flush time: a value published after the release means there is nothing to clear,
    // and a forced value from the same window must not reach the client after all. A released
    // actuator keeps its last sent value (the forced one, which its device still has).
    const released = [...this.released].filter(topic => !this.bus.current(topic))
    const cleared = released.filter(topic => !this.bus.lastCommand(topic))
    for (const topic of released) this.states.delete(topic)
    for (const topic of released) {
      const last = this.bus.lastCommand(topic)
      if (last) this.states.set(topic, last)
    }
    if (this.states.size > 0 || cleared.length > 0) {
      this.send({ type: "state", messages: [...this.states.values()], ...(cleared.length > 0 ? { cleared } : {}) })
    }
    if (this.stale) this.send({ type: "signal-status", stale: this.stale })
    this.queued = []
    this.states = new Map()
    this.released = new Set()
    this.stale = undefined
  }

  // terminate() skips the close handshake, which a half-open connection would never answer
  private heartbeat() {
    if (!this.alive) return this.socket.terminate()
    this.alive = false
    this.socket.ping()
  }

  private send(event: StreamEvent) {
    if (this.socket.readyState === this.socket.OPEN) this.socket.send(JSON.stringify(event))
  }
}
