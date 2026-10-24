import type { Clock } from "@lox-nexus/core"
import { Disposable } from "@lox-nexus/plugin-sdk"
import { PacketTraffic, type PacketDirection } from "./PacketTraffic.ts"
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
 * A sample is taken every SAMPLE_MS and kept for HISTORY_MS (one hour). `initial` seeds the history,
 * e.g. from a LoadHistoryStore after a restart; the 2-minute window itself starts empty again.
 */
export class IntercomLoad extends Disposable {
  static readonly LIMIT_PER_SECOND = 35
  static readonly WINDOW_SECONDS = 120
  static readonly SAMPLE_MS = 5000
  static readonly HISTORY_MS = 60 * 60 * 1000
  static readonly HISTORY_SAMPLES = IntercomLoad.HISTORY_MS / IntercomLoad.SAMPLE_MS
  private readonly meter: TrafficMeter
  private readonly packets: PacketTraffic
  private readonly samples: LoadSample[] = []

  /**
   * @param onSample called with every new sample, e.g. to publish the percentage or store it
   * @param initial earlier samples, oldest first; anything older than an hour is dropped
   */
  constructor(private readonly clock: Clock, private readonly onSample: (sample: LoadSample) => void = () => {}, initial: LoadSample[] = []) {
    super()
    this.meter = new TrafficMeter(clock, IntercomLoad.WINDOW_SECONDS)
    this.packets = new PacketTraffic(clock, IntercomLoad.WINDOW_SECONDS)
    const since = clock.now() - IntercomLoad.HISTORY_MS
    this.samples.push(...initial.filter(sample => sample.ts > since).slice(-IntercomLoad.HISTORY_SAMPLES))
    this.every(IntercomLoad.SAMPLE_MS, () => this.sample())
  }

  /** @param packetId given for data packets, so they also count towards that signal's share */
  received(packetId?: string) {
    this.meter.received()
    if (packetId !== undefined) this.packets.count("in", packetId)
  }

  /** @param packetId given for data packets, so they also count towards that signal's share */
  sent(packetId?: string) {
    this.meter.sent()
    if (packetId !== undefined) this.packets.count("out", packetId)
  }

  /** one packet id's share of the limit right now, in percent (same window and limit as current()) */
  percentOf(direction: PacketDirection, packetId: string) {
    return (this.packets.total(direction, packetId) / IntercomLoad.WINDOW_SECONDS / IntercomLoad.LIMIT_PER_SECOND) * 100
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
    const since = this.clock.now() - IntercomLoad.HISTORY_MS
    return this.samples.filter(sample => sample.ts > since)
  }

  private sample() {
    const sample = this.current()
    this.packets.prune()
    this.samples.push(sample)
    // by time, not count: after a restart the seeded samples have a gap and must still age out
    const since = sample.ts - IntercomLoad.HISTORY_MS
    while (this.samples.length > 0 && this.samples[0]!.ts <= since) this.samples.shift()
    this.onSample(sample)
  }
}
