import type { PluginLogger, PluginStatus } from "@lox-nexus/plugin-sdk"
import type { ConnectFailure } from "./ConnectFailure.ts"

/**
 * Turns connection events into the instance status and log lines: degraded with the reason while
 * the broker can't be reached, running again once connected. A failure is logged when its reason
 * changes, not on every retry.
 */
export class ConnectionHealth {
  private lastLogged: string | undefined
  private wasConnected = false

  constructor(private readonly log: PluginLogger, private readonly status: PluginStatus, private readonly target: string) {}

  connected(clientId: string) {
    this.status.set("running")
    this.log.info(this.wasConnected ? `connected to ${this.target} again` : `connected to ${this.target}`, { clientId })
    this.wasConnected = true
    this.lastLogged = undefined
  }

  lost(failure: ConnectFailure, retryMs: number) {
    const seconds = Math.round(retryMs / 1000)
    this.status.set("degraded", `${this.wasConnected ? "disconnected" : "can't connect"}: ${failure.message}; retrying in ${seconds} s`)
    // every attempt at debug; at warn only a new reason, so a long outage isn't a line a minute
    this.log.debug(`MQTT broker ${this.target}: ${failure.message}; retrying in ${seconds} s`)
    if (failure.message === this.lastLogged) return
    this.lastLogged = failure.message
    this.log.warn(`MQTT broker ${this.target}: ${failure.message}`)
  }

  /** the start goes on without waiting for a broker that doesn't answer */
  stillConnecting() {
    this.status.set("degraded", `connecting to ${this.target}…`)
  }
}
