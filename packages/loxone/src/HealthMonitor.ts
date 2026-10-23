import { Disposable } from "@lox-nexus/plugin-sdk"
import type { Clock } from "@lox-nexus/core"

/**
 * waiting: no packet yet since start; online: traffic within STALE_AFTER_MS; stale: silent for
 * longer; stopped: the connection is closed.
 */
export type MiniserverHealth = "waiting" | "online" | "stale" | "stopped"

/**
 * UDP has no connection, so health is derived from traffic: any packet, including the 0x8D status
 * heartbeat a Miniserver sends about every 278 s, marks it online. After two missed heartbeats
 * without any data it becomes stale.
 */
export class HealthMonitor extends Disposable {
  /** a bit over two heartbeat intervals (2 x 278 s), in ms */
  static readonly STALE_AFTER_MS = 600_000
  /** how often staleness is evaluated, in ms; so stale is detected up to this much late */
  static readonly CHECK_EVERY_MS = 30_000
  private lastSeen: number | undefined
  private current: MiniserverHealth = "waiting"

  /**
   * Starts the periodic check (owned, so disposing cancels it). Disposing reports "stopped".
   * @param onChange called only when the health actually changes, never with the current value twice
   */
  constructor(private readonly clock: Clock, private readonly onChange: (health: MiniserverHealth) => void) {
    super()
    this.every(HealthMonitor.CHECK_EVERY_MS, () => this.check())
    this.onDispose(() => this.set("stopped"))
  }

  /** the current state; "waiting" until the first packet */
  get health() {
    return this.current
  }

  /** call for every packet received from the Miniserver; also recovers from "stale" */
  seen() {
    this.lastSeen = this.clock.now()
    this.set("online")
  }

  private check() {
    if (this.lastSeen !== undefined && this.clock.now() - this.lastSeen > HealthMonitor.STALE_AFTER_MS) this.set("stale")
  }

  private set(health: MiniserverHealth) {
    if (health === this.current) return
    this.current = health
    this.onChange(health)
  }
}
