import { EventEmitter } from "node:events"
import { Disposable, type PluginLogger } from "@lox-nexus/plugin-sdk"
import type { EntityStore } from "../entities/EntityStore.ts"
import { Backoff } from "./Backoff.ts"
import { EventSubscriptions } from "./EventSubscriptions.ts"
import { EntitiesEventSchema } from "./HassMessages.ts"
import { HassAuthError, HassSocket } from "./HassSocket.ts"

type ConnectionEvents = { connected: []; disconnected: [reason: string]; rejected: [reason: string] }

/** Timings, adjustable so tests don't wait for real ones. */
export interface ConnectionTimings {
  pingMs: number
  /** the handshake and every request but service calls */
  timeoutMs: number
  /** call_service answers only when the service finished, e.g. a script run as `script.<name>` */
  serviceTimeoutMs: number
  backoff: Backoff
}

/**
 * Keeps one session with Home Assistant open: logs in, subscribes to every entity's state (into
 * the EntityStore) and to the event types in use (`busEvents`), pings to notice a dead
 * connection, and reconnects with backoff. A rejected token stops it for good: retrying with a
 * bad token gets Nexus's address banned by Home Assistant's ip_ban, so the user has to fix the
 * config first.
 */
export class HassConnection extends Disposable {
  static readonly TIMINGS = (): ConnectionTimings =>
    ({ pingMs: 30_000, timeoutMs: HassSocket.TIMEOUT_MS, serviceTimeoutMs: 60_000, backoff: new Backoff(1000, 60_000) })
  readonly events = new EventEmitter<ConnectionEvents>()
  version: string | undefined
  connectedSince: Date | undefined
  lastProblem: string | undefined
  reconnects = 0
  /** `subscribe_events` per event type the sensors use, renewed on every connection */
  readonly busEvents: EventSubscriptions
  private socket: HassSocket | undefined
  private stopPing: (() => void) | undefined
  /** cancels the connect in progress when disposed */
  private readonly attempts = new AbortController()

  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly entities: EntityStore,
    private readonly log: Pick<PluginLogger, "warn" | "debug">,
    private readonly timings = HassConnection.TIMINGS()
  ) {
    super()
    this.busEvents = new EventSubscriptions(log)
    this.onDispose(() => {
      this.attempts.abort()
      return this.socket?.dispose()
    })
  }

  /** true once logged in and subscribed */
  get connected() {
    return this.connectedSince !== undefined
  }

  /**
   * The first attempt. Other failures than a rejected token are retried in the background.
   * @throws HassAuthError when the token is rejected
   */
  start() {
    return this.connect(true)
  }

  /**
   * Calls a service, e.g. ("light", "turn_on", { brightness_pct: 40 }, "light.kitchen").
   * @throws Error while disconnected or after serviceTimeoutMs, HassError when Home Assistant refuses the call
   */
  async callService(domain: string, service: string, data: Record<string, unknown>, entityId?: string) {
    const target = entityId ? { target: { entity_id: entityId } } : {}
    // field names only: the values may be a lock's or an alarm's code
    this.log.debug(`call ${domain}.${service}`, { entityId, fields: Object.keys(data) })
    await this.request({ type: "call_service", domain, service, service_data: data, ...target }, this.timings.serviceTimeoutMs)
  }

  /** @throws Error while disconnected, HassError when Home Assistant answers with an error */
  request(message: { type: string } & Record<string, unknown>, timeoutMs?: number) {
    if (!this.socket) return Promise.reject(new Error(`not connected to Home Assistant${this.lastProblem ? `: ${this.lastProblem}` : ""}`))
    return this.socket.request(message, timeoutMs)
  }

  private async connect(first: boolean) {
    let socket: HassSocket | undefined
    try {
      socket = await HassSocket.open(this.url, this.token, { timeoutMs: this.timings.timeoutMs, signal: this.attempts.signal })
      if (this.isDisposed) return void socket.dispose()
      this.socket = socket
      const opened = socket
      // once, not listen(): a teardown per reconnect would pile up on this long-lived object
      socket.events.once("closed", reason => this.lost(opened, reason))
      await socket.subscribe({ type: "subscribe_entities" }, this.entitiesHandler(socket))
      this.opened(socket)
    } catch (error) {
      if (this.isDisposed) return
      if (error instanceof HassAuthError) return this.reject(error, first)
      const reason = error instanceof Error ? error.message : String(error)
      if (socket) socket.close(reason)
      else this.retry(reason)
    }
  }

  /**
   * The subscription's first event lists every entity; later ones change, add or remove some. A
   * malformed later event is logged and skipped. A malformed first one closes the connection, so
   * the reconnect brings a new full list: without one, entities removed meanwhile would linger.
   */
  private entitiesHandler(socket: HassSocket) {
    let initial = true
    return (event: unknown) => {
      const parsed = EntitiesEventSchema.safeParse(event)
      if (!parsed.success) {
        this.log.warn("Home Assistant sent an entity update in an unexpected shape", { problem: parsed.error.message })
        if (initial) socket.close("sent an unreadable entity list")
        return
      }
      this.entities.apply(parsed.data, initial)
      if (initial) this.log.debug(`loaded ${Object.keys(parsed.data.a ?? {}).length} entities`)
      initial = false
    }
  }

  private opened(socket: HassSocket) {
    this.version = socket.version
    this.connectedSince = new Date()
    this.lastProblem = undefined
    this.timings.backoff.reset()
    this.busEvents.attach(socket)
    this.stopPing = this.every(this.timings.pingMs, () => void socket.request({ type: "ping" }).catch(() => socket.close("didn't answer a ping")))
    this.events.emit("connected")
  }

  private lost(socket: HassSocket, reason: string) {
    if (socket !== this.socket || this.isDisposed) return
    this.socket = undefined
    this.stopPing?.()
    this.connectedSince = undefined
    this.busEvents.detach()
    void socket.dispose()
    this.retry(reason)
  }

  /** reports a problem only when it differs from the last one, so a long outage isn't reported every minute */
  private retry(reason: string) {
    if (this.isDisposed) return
    if (reason !== this.lastProblem) this.events.emit("disconnected", reason)
    this.lastProblem = reason
    const delay = this.timings.backoff.next()
    this.log.debug(`reconnecting in ${Math.round(delay / 1000)} s`, { reason })
    this.after(delay, () => {
      this.reconnects++
      void this.connect(false)
    })
  }

  private reject(error: HassAuthError, first: boolean) {
    this.lastProblem = error.message
    if (first) throw error
    this.events.emit("rejected", error.message)
  }
}
