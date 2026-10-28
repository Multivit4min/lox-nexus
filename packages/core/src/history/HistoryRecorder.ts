import { Disposable } from "@lox-nexus/plugin-sdk"
import type { BusMessage } from "../bus/BusMessage.ts"
import type { Clock } from "../bus/Clock.ts"
import type { Signal } from "../wires/Signal.ts"
import { HistoryFlags, type BucketDelta, type HistorySample, type HistoryStore } from "./HistoryTypes.ts"
import { RecordingPauses } from "./RecordingPauses.ts"
import { SeriesAggregator } from "./SeriesAggregator.ts"
import { ValueProjection } from "./ValueProjection.ts"

/** What the recorder reads from the history settings, every time it needs it. */
export interface RecorderSettings {
  /** changes of one signal closer together than this keep only the latest in the raw tier; buckets see all */
  rawMinIntervalMs: number
}

/**
 * Records the values it is given (SelectedValues decides which) and writes them in batches, like
 * the value snapshot: never per change. Raw changes go out every FLUSH_MS, the open buckets every
 * PARTIAL_MS and on dispose. A failed write keeps everything for the next try; at most MAX_PENDING
 * raw values and bucket parts wait, and a batch that fails MAX_ATTEMPTS times in a row is dropped,
 * so one bad value can't stop the history for good. Drops are counted in `dropped`.
 * Values replayed at boot or after a rename (`restored`) were recorded already and are skipped.
 * A signal that leaves the selection pauses until it records again (RecordingPauses), so readers
 * show the time in between as a gap.
 * A jump of the clock (a device without a real-time clock syncing its time) starts a new run, so
 * it shows as a gap instead of a value drawn across it.
 */
export class HistoryRecorder extends Disposable {
  static readonly FLUSH_MS = 5000
  static readonly PARTIAL_MS = 60_000
  static readonly MAX_PENDING = 100_000
  static readonly MAX_ATTEMPTS = 12
  /** more time than this between two flushes or values, or time going back, is a clock jump */
  static readonly JUMP_MS = 2 * HistoryRecorder.PARTIAL_MS
  private aggregator = new SeriesAggregator()
  private samples: HistorySample[] = []
  private buckets: BucketDelta[] = []
  /** where each signal's latest sample sits in `samples`, and when it was taken */
  private readonly latest = new Map<string, { index?: number; ts: number }>()
  private started: number
  private lastTime: number
  private lastPartial: number
  /** failed attempts of the current batch */
  private failures = 0
  /** writes fail since the last success; logged once each way */
  private failing = false
  /** raw values and bucket parts dropped because the store kept failing */
  dropped = 0
  private readonly pauses: RecordingPauses

  constructor(
    private readonly store: HistoryStore,
    private readonly clock: Clock,
    private readonly settings: () => RecorderSettings,
    private readonly log: (message: string, error?: unknown) => void
  ) {
    super()
    this.started = this.lastTime = this.lastPartial = clock.now()
    this.pauses = new RecordingPauses(this.pausedInStore())
    this.every(HistoryRecorder.FLUSH_MS, () => this.flush())
    this.onDispose(() => {
      this.flush(true)
    })
  }

  /** a value of a selected signal, as SelectedValues hands it on */
  record(signal: Signal, message: BusMessage & { value: NonNullable<BusMessage["value"]> }) {
    // a replayed value isn't recorded again, but the signal is recording from now on
    this.pauses.started(signal.id, message.flags?.restored ? this.clock.now() : message.ts)
    if (message.flags?.restored) return
    this.notice(message.ts)
    const valueType = signal.valueType === "any" ? message.value.type : signal.valueType
    const projected = ValueProjection.of(message.value)
    const flags = (message.flags?.forced ? HistoryFlags.forced : 0) | (message.kind === "command" ? HistoryFlags.command : 0)
    if (projected.numeric) this.aggregator.add(signal.id, valueType, message.ts, projected.num, flags)
    this.keep({ signalId: signal.id, valueType, ts: message.ts, num: projected.num, text: projected.text, flags })
  }

  /** a signal that is not recorded (any more): its open buckets are closed now, and it pauses */
  release(signalId: string) {
    this.pauses.stopped(signalId, this.clock.now())
    if (this.aggregator.has(signalId)) this.aggregator.release(signalId, this.clock.now())
  }

  /** a paused signal that is selected again but has no value to record: it records from now */
  resume(signalId: string) {
    this.pauses.started(signalId, this.clock.now())
  }

  isRecording(signalId: string) {
    return this.pauses.isRecording(signalId)
  }

  isPaused(signalId: string) {
    return this.pauses.isPaused(signalId)
  }

  /** a signal that was deleted: nothing more of it is written, also not its open buckets */
  forget(signalId: string) {
    this.aggregator.forget(signalId)
    this.pauses.forget(signalId)
    this.samples = this.samples.filter(sample => sample.signalId !== signalId)
    this.buckets = this.buckets.filter(bucket => bucket.signalId !== signalId)
    this.latest.clear()
  }

  /**
   * Writes what is pending; runs every FLUSH_MS and on dispose. Never throws.
   * @param partial also the open buckets (due every PARTIAL_MS anyway)
   * @returns whether the write succeeded (or there was nothing to write)
   */
  flush(partial = false): boolean {
    const now = this.clock.now()
    this.notice(now)
    const withPartial = partial || now - this.lastPartial >= HistoryRecorder.PARTIAL_MS
    if (withPartial) this.lastPartial = now
    this.pend(this.aggregator.drain(now, withPartial))
    const pauses = this.pauses.changes
    if (this.samples.length === 0 && this.buckets.length === 0 && pauses.length === 0 && !withPartial) return true
    try {
      this.store.write({ samples: this.samples, buckets: this.buckets, pauses, run: { started: this.started, seen: now } })
    } catch (error) {
      this.failed(error)
      return false
    }
    if (this.failing) this.log(`writing the history works again${this.dropped ? `; ${this.dropped} values were dropped meanwhile` : ""}`)
    this.failing = false
    this.failures = 0
    this.pauses.done(pauses.length)
    this.clear()
    return true
  }

  // a jump closes the open buckets where time last was, and starts a new run from here
  private notice(now: number) {
    if (now >= this.lastTime - HistoryRecorder.FLUSH_MS && now - this.lastTime <= HistoryRecorder.JUMP_MS) {
      this.lastTime = Math.max(this.lastTime, now)
      return
    }
    this.pend(this.aggregator.drain(this.lastTime, true))
    this.aggregator = new SeriesAggregator()
    this.started = this.lastTime = this.lastPartial = now
  }

  // a store that can't say leaves every signal unpaused: at worst a pause isn't drawn
  private pausedInStore() {
    try {
      return this.store.pausedSignals()
    } catch (error) {
      this.log("reading the paused signals failed", error)
      return []
    }
  }

  private failed(error: unknown) {
    this.failures++
    if (!this.failing) this.log("writing the history failed; keeping the values for the next try", error)
    this.failing = true
    if (this.failures < HistoryRecorder.MAX_ATTEMPTS) return
    this.dropped += this.samples.length + this.buckets.length
    this.log(`dropped a batch of history that failed ${this.failures} times`, error)
    this.failures = 0
    this.pauses.done(this.pauses.changes.length)
    this.clear()
  }

  private clear() {
    this.samples = []
    this.buckets = []
    for (const entry of this.latest.values()) delete entry.index
  }

  private pend(parts: BucketDelta[]) {
    this.buckets.push(...parts)
    if (this.buckets.length <= HistoryRecorder.MAX_PENDING) return
    this.dropped += this.buckets.length - HistoryRecorder.MAX_PENDING
    this.buckets.length = HistoryRecorder.MAX_PENDING
  }

  // close changes of one signal keep only the latest; the buckets have seen every one. Across a
  // successful flush the window starts anew, so at most one extra value per window slips through.
  private keep(sample: HistorySample) {
    const latest = this.latest.get(sample.signalId)
    if (latest?.index !== undefined && sample.ts - latest.ts < this.settings().rawMinIntervalMs) {
      this.samples[latest.index] = sample
      return
    }
    if (this.samples.length >= HistoryRecorder.MAX_PENDING) {
      this.dropped++
      return
    }
    this.latest.set(sample.signalId, { index: this.samples.length, ts: sample.ts })
    this.samples.push(sample)
  }
}
