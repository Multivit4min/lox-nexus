import type { DiagnosticsDto, DiagnosticsMiniserverDto, DiagnosticsSampleDto, DiagnosticsWorkerDto } from "@lox-nexus/api"
import { RingBuffer, type Clock, type EventBus } from "@lox-nexus/core"
import { Disposable } from "@lox-nexus/plugin-sdk"
import type { Logger } from "pino"
import { ProcessSampler } from "./ProcessSampler.ts"
import type { StorageSizes } from "./StorageSizes.ts"

/** Where the figures besides the process's own come from. */
export interface DiagnosticsSources {
  bus: Pick<EventBus, "tap" | "currentMatching">
  streamClients: () => number
  wires: () => number
  miniservers: () => DiagnosticsMiniserverDto[]
  /** running plugin workers only */
  workers: () => Promise<DiagnosticsWorkerDto[]>
  storage: Pick<StorageSizes, "measure">
}

/**
 * Takes a sample of the process every INTERVAL_MS and keeps KEEP_MS of them, in memory only: for
 * watching a long run (heap, event loop, plugin workers, traffic, disk), not for history. A
 * restart starts afresh, which the page shows as a new start time.
 */
export class DiagnosticsSampler extends Disposable {
  static readonly INTERVAL_MS = 30_000
  static readonly KEEP_MS = 48 * 60 * 60 * 1000
  private readonly samples = new RingBuffer<DiagnosticsSampleDto>(DiagnosticsSampler.KEEP_MS / DiagnosticsSampler.INTERVAL_MS)
  private readonly process = this.own(new ProcessSampler())
  private messages = 0
  private lastAt: number
  private taking = false

  constructor(
    private readonly sources: DiagnosticsSources,
    /** startedAt: when this app started; after a restore Nexus restarts within the same process */
    private readonly about: { version: string; startedAt: number },
    private readonly clock: Clock,
    private readonly log: Logger
  ) {
    super()
    this.lastAt = clock.now()
    this.own(sources.bus.tap(() => void this.messages++))
    this.every(DiagnosticsSampler.INTERVAL_MS, () => void this.take())
  }

  /** @param since only samples after this time, so a page that has the rest polls a few kilobytes, not up to 48 h */
  snapshot(since = -Infinity): DiagnosticsDto {
    return {
      startedAt: this.about.startedAt, version: this.about.version, node: process.version, platform: `${process.platform} ${process.arch}`,
      intervalMs: DiagnosticsSampler.INTERVAL_MS, keepMs: DiagnosticsSampler.KEEP_MS, samples: this.samples.toArray().filter(sample => sample.ts > since)
    }
  }

  /** one sample now; one that is still being taken (a slow worker) makes this one skip */
  async take() {
    if (this.taking || this.isDisposed) return
    this.taking = true
    try {
      const workers = await this.sources.workers()
      if (this.isDisposed) return
      const now = this.clock.now()
      const seconds = Math.max(0.001, (now - this.lastAt) / 1000)
      this.samples.push({
        ts: now, ...this.process.sample(),
        busPerSecond: Math.round((this.messages / seconds) * 10) / 10,
        retainedTopics: this.sources.bus.currentMatching("#").length,
        streamClients: this.sources.streamClients(), wires: this.sources.wires(),
        ...this.sources.storage.measure(), miniservers: this.sources.miniservers(),
        workers: workers.map(worker => ({ ...worker, utilization: Math.round(worker.utilization * 10_000) / 10_000 }))
      })
      this.messages = 0
      this.lastAt = now
    } catch (error) {
      // a timer callback must not throw; a missed sample shows as a gap
      this.log.warn({ err: error }, "taking a diagnostics sample failed")
    } finally {
      this.taking = false
    }
  }
}
