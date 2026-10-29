import { EventEmitter } from "node:events"
import { Disposable } from "@lox-nexus/plugin-sdk"
import { connect, type IClientOptions, type IClientPublishOptions } from "mqtt"
import { Backoff } from "./Backoff.ts"
import { BrokerSession } from "./BrokerSession.ts"
import { BrokerTarget } from "./BrokerTarget.ts"
import { ConnectFailure } from "./ConnectFailure.ts"
import type { ConnectionHealth } from "./ConnectionHealth.ts"
import { TrafficStats } from "./TrafficStats.ts"

/** how to reach and log in to the broker; `statusTopic` turns on the online status and last will */
export interface BrokerOptions {
  url: string
  clientId: string
  username?: string | undefined
  password?: string | undefined
  rejectUnauthorized: boolean
  statusTopic?: string | undefined
}

/**
 * The plugin's link to one broker. Connects, and after a lost connection waits 1 s, 2 s, 4 s … up
 * to a minute before the next attempt, with a fresh MQTT.js client each time. Publishes only
 * while connected, so nothing piles up for an offline broker.
 *
 * `events`: "connected" after every successful connect (subscribe there), "disconnected",
 * "message" (topic, payload, retained).
 */
export class BrokerConnection extends Disposable {
  static readonly CONNECT_TIMEOUT_MS = 10_000
  /** a start waits at most this long for the broker; then it goes on as degraded */
  static readonly START_WAIT_MS = 5000
  static readonly PUBLISH_TIMEOUT_MS = 10_000
  static readonly KEEPALIVE_S = 30

  readonly events = new EventEmitter()
  readonly stats = new TrafficStats()
  private readonly backoff = new Backoff()
  private session: BrokerSession | undefined
  private failure: ConnectFailure | undefined
  /** why the last connection ended, for "not connected" errors while the next attempt runs */
  private lastReason: string | undefined
  private firstOutcome: { resolve: () => void; reject: (error: Error) => void } | undefined
  private closing = false

  constructor(private readonly options: BrokerOptions, private readonly health: ConnectionHealth) {
    super()
    this.events.setMaxListeners(0)
    this.onDispose(() => this.session?.dispose())
    // a stop while connecting tears the session down without its close event: start() must still end
    this.onDispose(() => this.settleStart())
  }

  get connected() {
    return this.session?.connected ?? false
  }

  /** resolves once connected, or as degraded when the broker can't be reached; rejects for a refused login */
  start() {
    const outcome = new Promise<void>((resolve, reject) => (this.firstOutcome = { resolve, reject }))
    this.after(BrokerConnection.START_WAIT_MS, () => {
      if (!this.firstOutcome) return
      this.health.stillConnecting()
      this.settleStart()
    })
    this.attempt()
    return outcome
  }

  async publish(topic: string, payload: string, options: IClientPublishOptions = {}) {
    const session = this.session
    if (!session?.connected) throw new Error(`not connected to the broker${this.lastReason ? `: ${this.lastReason}` : ""}`)
    try {
      await this.deadline(session.publish(topic, payload, options), "the broker didn't confirm the message")
      this.stats.published++
    } catch (error) {
      this.stats.publishFailed++
      throw error
    }
  }

  /** subscribes while connected (else the next connect does); resolves with the refused filters */
  async subscribe(filters: string[]) {
    if (!this.session?.connected || filters.length === 0) return []
    return this.deadline(this.session.subscribe(filters), "the broker didn't confirm the subscription")
  }

  async unsubscribe(filters: string[]) {
    if (!this.session?.connected || filters.length === 0) return
    await this.deadline(this.session.unsubscribe(filters), "the broker didn't confirm the unsubscription")
  }

  /** ends the connection for a stop: offline status first, then a clean DISCONNECT, at most `ms` in all */
  async close(ms: number) {
    this.closing = true
    this.stats.state = "stopped"
    const session = this.session
    if (!session?.connected) return
    const deadline = this.currentClock().now() + ms
    const left = () => Math.max(1, deadline - this.currentClock().now())
    const status = this.options.statusTopic
    if (status) await this.deadline(session.publish(status, "offline", { qos: 1, retain: true }), "", left()).catch(() => {})
    await this.deadline(session.end(), "", left()).catch(() => {})
  }

  private attempt() {
    if (this.isDisposed || this.closing) return
    this.stats.state = "connecting"
    // each attempt reports its own reason, not one left from an earlier attempt
    this.failure = undefined
    const session = new BrokerSession(connect(this.clientOptions()), {
      connected: () => this.onConnected(session),
      message: (topic, payload, retained) => {
        this.stats.received++
        this.events.emit("message", topic, payload, retained)
      },
      failed: error => (this.failure = ConnectFailure.of(error)),
      closed: () => this.onClosed(session)
    })
    this.session = session
  }

  private onConnected(session: BrokerSession) {
    if (session !== this.session) return
    this.backoff.reset()
    this.failure = undefined
    this.lastReason = undefined
    Object.assign(this.stats, { state: "connected", connectedSince: this.currentClock().now(), nextAttemptAt: undefined })
    this.health.connected(this.options.clientId)
    const status = this.options.statusTopic
    if (status) this.publish(status, "online", { qos: 1, retain: true }).catch(() => {})
    this.settleStart()
    this.events.emit("connected")
  }

  private onClosed(session: BrokerSession) {
    if (session !== this.session) return
    const wasConnected = this.stats.state === "connected"
    this.session = undefined
    session.dispose().catch(() => {})
    const failure = this.failure ?? ConnectFailure.closed()
    this.lastReason = failure.message
    const now = this.currentClock().now()
    this.stats.failed(failure.message, now)
    if (wasConnected) this.events.emit("disconnected")
    if (this.closing || this.isDisposed) return
    if (failure.fatal && this.firstOutcome) return this.settleStart(new Error(failure.message))
    const retryMs = failure.fatal ? Backoff.MAX_MS : this.backoff.next()
    Object.assign(this.stats, { state: "waiting", connectedSince: undefined, nextAttemptAt: now + retryMs })
    this.health.lost(failure, retryMs)
    this.settleStart()
    this.after(retryMs, () => this.attempt())
  }

  private settleStart(error?: Error) {
    const outcome = this.firstOutcome
    this.firstOutcome = undefined
    if (error) outcome?.reject(error)
    else outcome?.resolve()
  }

  private clientOptions(): IClientOptions {
    const { clientId, username, password, rejectUnauthorized, statusTopic } = this.options
    return {
      ...BrokerTarget.options(this.options.url),
      clientId, username, password, rejectUnauthorized,
      protocolVersion: 4,
      clean: true,
      keepalive: BrokerConnection.KEEPALIVE_S,
      connectTimeout: BrokerConnection.CONNECT_TIMEOUT_MS,
      // reconnecting is ours (with backoff and a fresh client), and so is resubscribing
      reconnectPeriod: 0,
      resubscribe: false,
      queueQoSZero: false,
      ...statusTopic ? { will: { topic: statusTopic, payload: Buffer.from("offline"), qos: 1 as const, retain: true } } : {}
    }
  }

  /** rejects when `promise` takes longer than `ms` */
  private deadline<T>(promise: Promise<T>, message: string, ms = BrokerConnection.PUBLISH_TIMEOUT_MS) {
    return new Promise<T>((resolve, reject) => {
      const cancel = this.after(ms, () => reject(new Error(`${message} within ${Math.round(ms / 1000)} s`)))
      promise.then(
        value => (cancel(), resolve(value)),
        (error: unknown) => (cancel(), reject(error instanceof Error ? error : new Error(String(error))))
      )
    })
  }
}
