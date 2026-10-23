import type { Clock } from "@lox-nexus/core"
import { Disposable } from "@lox-nexus/plugin-sdk"
import { TrafficMeter } from "./TrafficMeter.ts"

/** One point of the load history. Rates are averages over the 2-minute window, in messages per second. */
export interface LoadSample {
  /** epoch ms */
  ts: number
  incomingPerSecond: number
  outgoingPerSecond: number
  /** both directions against LIMIT_PER_SECOND; above 100 Loxone no longer guarantees delivery */
  percent: number
}

/**
 * How busy a Miniserver's network intercommunication is. Loxone documents the limit as "an average
 * value of 35 messages per second over a period of 2 minutes. If this is exceeded, secure
 * transmission is no longer guaranteed and a system message appears."
 * (https://www.loxone.com/enen/kb/network-intercommunication/)
 *
 * Both directions count: what the Miniserver sends (to Nexus, and to other targets through
 * Nexus's port) and what Nexus sends, including the cyclic resends of every output. Traffic between
 * the Miniserver and other systems that Nexus can't see is missing, so this is a lower bound.
 * A sample is taken every SAMPLE_MS and kept for HISTORY_SAMPLES (one hour), in memory only.
 */
export class IntercomLoad extends Disposable {
  static readonly LIMIT_PER_SECOND = 35
  static readonly WINDOW_SECONDS = 120
  static readonly SAMPLE_MS = 5000
  static readonly HISTORY_SAMPLES = 720
  private readonly meter: TrafficMeter
  private readonly samples: LoadSample[] = []

  /** @param onSample called with every new sample, e.g. to publish the percentage on the bus */
  constructor(private readonly clock: Clock, private readonly onSample: (sample: LoadSample) => void = () => {}) {
    super()
    this.meter = new TrafficMeter(clock, IntercomLoad.WINDOW_SECONDS)
    this.every(IntercomLoad.SAMPLE_MS, () => this.sample())
  }

  received() {
    this.meter.received()
  }

  sent() {
    this.meter.sent()
  }

  /** the load right now, not yet in the history */
  current(): LoadSample {
    const { incoming, outgoing } = this.meter.totals()
    const window = IntercomLoad.WINDOW_SECONDS
    const perSecond = (incoming + outgoing) / window
    return {
      ts: this.clock.now(),
      incomingPerSecond: incoming / window,
      outgoingPerSecond: outgoing / window,
      percent: (perSecond / IntercomLoad.LIMIT_PER_SECOND) * 100
    }
  }

  /** the samples of the last hour, oldest first */
  history(): LoadSample[] {
    return this.samples.slice()
  }

  private sample() {
    const sample = this.current()
    this.samples.push(sample)
    if (this.samples.length > IntercomLoad.HISTORY_SAMPLES) this.samples.shift()
    this.onSample(sample)
  }
}
