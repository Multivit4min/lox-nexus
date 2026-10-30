import fs from "node:fs"
import { HistoryQuerySchema, type HistorySeriesDto, type HistoryStatsDto } from "@lox-nexus/api"
import { SeriesAggregator, SignalDisplays, type Clock, type SignalRegistry, type SignalSelection } from "@lox-nexus/core"
import type { HistoryReadRepository } from "../db/history/HistoryReadRepository.ts"
import type { HistoryRepository } from "../db/history/HistoryRepository.ts"
import { HttpError } from "../http/HttpError.ts"
import { HistoryQuery } from "./HistoryQuery.ts"
import type { HistorySettingsStore } from "./HistorySettingsStore.ts"

const HOUR = 60 * 60_000
/** stored size per row, measured with HistoryLoadCheck (131 MB for 4.3 million changes and their buckets) */
const RAW_BYTES = 30
const BUCKET_BYTES = 60

/** What the history API needs; built by HistoryAssembly. */
export interface HistoryServiceDeps {
  reader: HistoryReadRepository
  store: Pick<HistoryRepository, "purge">
  settings: HistorySettingsStore
  signals: Pick<SignalRegistry, "get" | "list">
  /** the history's selection, whether or not recording is switched on */
  selection: () => SignalSelection
  /** drops what the recorder holds of a signal */
  forget: (signalId: string) => void
  dropped: () => number
  clock: Clock
  /** history.db, for its size; ":memory:" in tests */
  file: string
}

/** Charts, deletion and statistics of the value history. */
export class HistoryService {
  private readonly query: HistoryQuery

  constructor(private readonly deps: HistoryServiceDeps) {
    this.query = new HistoryQuery(deps.reader, () => deps.settings.current, deps.clock)
  }

  /** @throws ZodError 400 for an invalid range; HttpError 404 for a signal that neither exists nor has history */
  series(signalId: string, input: unknown): HistorySeriesDto {
    const query = HistoryQuerySchema.parse(input)
    const signal = this.deps.signals.get(signalId)
    if (!signal && !this.deps.reader.series(signalId)) throw HttpError.notFound(`signal "${signalId}"`)
    // the signal's display settings now, also for values recorded before they were set
    return { ...this.query.run(signalId, signal?.valueType ?? "any", query), ...(signal ? SignalDisplays.of(signal) : {}) }
  }

  /**
   * Deletes all stored history of the signal, in rounds that let other work run in between; what
   * the recorder still holds of it goes first, so it can't bring old values back. It is recorded
   * again from its next value if selected.
   */
  async purge(signalId: string) {
    this.deps.forget(signalId)
    while (this.deps.store.purge(signalId, 10_000) > 0) await new Promise(resolve => setImmediate(resolve))
  }

  /** the ids of the signals the selection takes (recorded while recording is on) */
  recorded(): string[] {
    const selection = this.deps.selection()
    return this.deps.signals.list().filter(signal => selection.includes(signal)).map(signal => signal.id)
  }

  stats(): HistoryStatsDto {
    const { enabled, rawDays, fineDays, coarseDays } = this.deps.settings.current
    const recent = this.deps.reader.recent(this.deps.clock.now() - HOUR, [SeriesAggregator.FIVE_MINUTES, SeriesAggregator.HOUR])
    // a day at the last hour's rate; an hourly bucket for every 12 five-minute ones
    const perDay = { raw: recent.raw * 24, fine: recent.fine * 24, coarse: recent.fine * 2 }
    const bytes = perDay.raw * RAW_BYTES * HistoryService.days(rawDays) + (perDay.fine * HistoryService.days(fineDays) + perDay.coarse * HistoryService.days(coarseDays)) * BUCKET_BYTES
    return {
      enabled, fileBytes: this.fileBytes(), series: recent.series, recorded: this.recorded().length,
      lastHour: { raw: recent.raw, fine: recent.fine, coarse: recent.coarse },
      projectedBytes: bytes > 0 ? Math.round(bytes) : null,
      dropped: this.deps.dropped()
    }
  }

  // "kept forever" is projected over a year
  private static days(retention: number) {
    return retention === 0 ? 365 : retention
  }

  private fileBytes() {
    if (this.deps.file === ":memory:") return 0
    const size = (path: string) => (fs.existsSync(path) ? fs.statSync(path).size : 0)
    return size(this.deps.file) + size(`${this.deps.file}-wal`)
  }
}
