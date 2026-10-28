import type { PluginLogger, PluginStatus } from "@lox-nexus/plugin-sdk"
import type { ExportStats } from "../ExportStats.ts"

/**
 * Reports what writes do: the counters, the log and the plugin's status. Degraded while InfluxDB
 * can't be written to; running again as soon as it answers in a way that isn't a failure (a
 * success, or a rejection of bad data, which says the server and the credentials are fine).
 *
 * Logs a failure when its reason changes, not on every retry, and a rejection at most once a
 * minute, so an outage or a stream of bad data can't flood the log.
 */
export class ExportHealth {
  static readonly WARN_EVERY_MS = 60_000

  private degraded = false
  private lastReason: string | undefined
  private lastRejectWarning = -Infinity
  private quietRejects = 0

  constructor(private readonly stats: ExportStats, private readonly log: PluginLogger, private readonly status: PluginStatus) {}

  succeeded(points: number, latencyMs: number) {
    this.stats.succeeded(points, Math.round(latencyMs))
    this.answered()
  }

  rejected(points: number, reason: string, now = Date.now()) {
    this.stats.refused(points, reason)
    this.answered()
    if (now - this.lastRejectWarning < ExportHealth.WARN_EVERY_MS) {
      this.quietRejects++
      return
    }
    const since = this.quietRejects > 0 ? ` (${this.quietRejects} more batches were rejected since the last warning)` : ""
    this.log.warn(`InfluxDB rejected ${points} points, they are dropped: ${reason}${since}`)
    this.lastRejectWarning = now
    this.quietRejects = 0
  }

  /** a write failed and will be retried in `delayMs` */
  failed(reason: string, delayMs: number, degraded: string | undefined) {
    const seconds = Math.round(delayMs / 1000)
    this.stats.failed(reason, seconds === 0 ? `retrying now: ${reason}` : `retrying in ${seconds} s: ${reason}`)
    if (reason !== this.lastReason) this.log.warn(`writing to InfluxDB failed, retrying ${seconds === 0 ? "now" : `in ${seconds} s`}: ${reason}`)
    this.lastReason = reason
    if (degraded !== undefined) this.degrade(degraded)
  }

  /** the check at start failed; only reported while nothing was written yet */
  checkFailed(reason: string) {
    if (this.stats.lastSuccessAt !== undefined) return
    this.stats.failed(reason, `check failed: ${reason}`)
    this.log.warn(`InfluxDB check failed: ${reason}`)
    this.degrade(`check failed: ${reason}`)
  }

  /** at stop: these points could not be written and are lost */
  unwritten(points: number) {
    if (points > 0) this.log.warn(`${points} points were not written to InfluxDB before the stop`)
  }

  private degrade(message: string) {
    this.degraded = true
    this.status.set("degraded", message)
  }

  private answered() {
    if (this.lastReason !== undefined) this.log.info("InfluxDB answers again")
    this.lastReason = undefined
    if (!this.degraded) return
    this.degraded = false
    this.status.set("running")
  }
}
