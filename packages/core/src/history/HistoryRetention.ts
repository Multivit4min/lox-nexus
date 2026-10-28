import { Disposable } from "@lox-nexus/plugin-sdk"
import type { Clock } from "../bus/Clock.ts"
import type { HistoryStore, HistoryTier } from "./HistoryTypes.ts"
import { SeriesAggregator } from "./SeriesAggregator.ts"

/** How long each tier is kept, in days; 0 keeps it forever. */
export interface RetentionSettings {
  rawDays: number
  fineDays: number
  coarseDays: number
}

/**
 * Deletes history past its retention, and the history of signals that no longer exist. At most
 * CHUNK rows per tick in total, so a large delete never blocks Nexus for long; what is left goes in
 * the next ticks. Whether a signal exists is asked of the configuration (`exists`), not of what is
 * running, and a signal must be missing for GRACE_MS before its history goes: a config import
 * removes and re-adds signals, and a Miniserver that failed to load must not cost its history.
 */
export class HistoryRetention extends Disposable {
  static readonly INTERVAL_MS = 60_000
  static readonly CHUNK = 10_000
  static readonly GRACE_MS = 60 * 60_000
  private static readonly DAY = 24 * 60 * 60_000
  /** since when each signal with history has been missing from the configuration */
  private readonly missing = new Map<string, number>()
  private failing = false

  constructor(
    private readonly store: HistoryStore,
    private readonly clock: Clock,
    private readonly settings: () => RetentionSettings,
    private readonly exists: (signalId: string) => boolean,
    private readonly log: (message: string, error?: unknown) => void
  ) {
    super()
    this.every(HistoryRetention.INTERVAL_MS, () => this.run())
  }

  /** one round; runs every INTERVAL_MS. Never throws: a failure is logged once, and once more when it works again. */
  run() {
    try {
      let budget = HistoryRetention.CHUNK
      budget -= this.prune(budget)
      this.purgeGone(budget)
      if (this.failing) this.log("cleaning up the history works again")
      this.failing = false
    } catch (error) {
      if (!this.failing) this.log("cleaning up the history failed; trying again every minute", error)
      this.failing = true
    }
  }

  private prune(budget: number) {
    const { rawDays, fineDays, coarseDays } = this.settings()
    const tiers: Array<[HistoryTier, number]> = [["raw", rawDays], [SeriesAggregator.FIVE_MINUTES, fineDays], [SeriesAggregator.HOUR, coarseDays]]
    let deleted = 0
    for (const [tier, days] of tiers) {
      if (days > 0 && deleted < budget) deleted += this.store.prune(tier, this.clock.now() - days * HistoryRetention.DAY, budget - deleted)
    }
    return deleted
  }

  private purgeGone(budget: number) {
    const now = this.clock.now()
    const ids = this.store.seriesIds()
    for (const id of this.missing.keys()) if (!ids.includes(id)) this.missing.delete(id)
    for (const id of ids) {
      if (this.exists(id)) {
        this.missing.delete(id)
        continue
      }
      const since = this.missing.get(id) ?? now
      this.missing.set(id, since)
      if (now - since >= HistoryRetention.GRACE_MS && budget > 0) budget -= this.store.purge(id, budget)
    }
  }
}
