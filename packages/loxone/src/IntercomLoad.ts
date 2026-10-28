import type { Clock } from "@lox-nexus/core"
import { Disposable } from "@lox-nexus/plugin-sdk"
import { PacketTraffic, type PacketDirection } from "./PacketTraffic.ts"
import { TrafficMeter } from "./TrafficMeter.ts"

/**
 * Traffic the limit counts that belongs to no configured signal, so the total can be explained:
 * data for packet ids without a signal, the Miniserver's packets to other targets that arrive on
 * this port, encrypted packets Nexus can't read (no password), and protocol packets (the status
 * heartbeat, encryption handshakes).
 */
export type UnassignedTraffic = typeof IntercomLoad.UNASSIGNED[number]

/**
 * What the current load is made of, in percent of the limit (unrounded). The parts add up to
 * current().percent: `recentlyChanged` is what is left, the traffic of signals deleted or given
 * another packet id within the window.
 */
export type LoadBreakdown = Record<UnassignedTraffic | "signals" | "recentlyChanged", number>

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
  static readonly UNASSIGNED = ["unconfigured", "otherTargets", "encrypted", "protocol"] as const
  private readonly meter: TrafficMeter
  private readonly packets: PacketTraffic
  private readonly unassigned: Record<UnassignedTraffic, TrafficMeter>
  private readonly samples: LoadSample[] = []

  /**
   * @param onSample called with every new sample, e.g. to publish the percentage or store it
   * @param initial earlier samples, oldest first; anything older than an hour is dropped
   */
  constructor(private readonly clock: Clock, private readonly onSample: (sample: LoadSample) => void = () => {}, initial: LoadSample[] = []) {
    super()
    this.meter = new TrafficMeter(clock, IntercomLoad.WINDOW_SECONDS)
    this.packets = new PacketTraffic(clock, IntercomLoad.WINDOW_SECONDS)
    const meters = IntercomLoad.UNASSIGNED.map(kind => [kind, new TrafficMeter(clock, IntercomLoad.WINDOW_SECONDS)] as const)
    this.unassigned = Object.fromEntries(meters) as Record<UnassignedTraffic, TrafficMeter>
    const since = clock.now() - IntercomLoad.HISTORY_MS
    this.samples.push(...initial.filter(sample => sample.ts > since).slice(-IntercomLoad.HISTORY_SAMPLES))
    this.every(IntercomLoad.SAMPLE_MS, () => this.sample())
  }

  /** a data packet for a configured input; it also counts towards that signal's share */
  received(packetId: string) {
    this.meter.received()
    this.packets.count("in", packetId)
  }

  /** a packet from the Miniserver that belongs to no signal; counted in the total and by kind */
  receivedUnassigned(kind: UnassignedTraffic) {
    this.meter.received()
    this.unassigned[kind].received()
  }

  /** @param packetId of the data packet, so it also counts towards that signal's share; anything else is protocol */
  sent(packetId?: string) {
    this.meter.sent()
    if (packetId !== undefined) this.packets.count("out", packetId)
    else this.unassigned.protocol.sent()
  }

  /** one packet id's share of the limit right now, in percent (same window and limit as current()) */
  percentOf(direction: PacketDirection, packetId: string) {
    return IntercomLoad.percent(this.packets.total(direction, packetId))
  }

  /**
   * What the load right now is made of, given the configured signals. Counted in whole messages
   * from one clock reading and converted at the end, so the parts add up to the total exactly:
   * per-signal rounding, or a second passing between reads, would otherwise show up as traffic of
   * recently changed signals.
   */
  breakdown(signals: Iterable<{ direction: PacketDirection; packetId: string }>, now = this.clock.now()): LoadBreakdown {
    const messages = (meter: TrafficMeter) => {
      const { incoming, outgoing } = meter.totals(now)
      return incoming + outgoing
    }
    let ofSignals = 0
    for (const { direction, packetId } of signals) ofSignals += this.packets.total(direction, packetId, now)
    const kinds = IntercomLoad.UNASSIGNED.map(kind => [kind, messages(this.unassigned[kind])] as const)
    const rest = messages(this.meter) - ofSignals - kinds.reduce((sum, [, count]) => sum + count, 0)
    return {
      signals: IntercomLoad.percent(ofSignals),
      ...Object.fromEntries(kinds.map(([kind, count]) => [kind, IntercomLoad.percent(count)])) as Record<UnassignedTraffic, number>,
      recentlyChanged: IntercomLoad.percent(Math.max(0, rest))
    }
  }

  /** the load right now, not yet in the history; `now` lets a breakdown use the same reading */
  current(now = this.clock.now()): LoadSample {
    const { incoming, outgoing } = this.meter.totals(now)
    const window = IntercomLoad.WINDOW_SECONDS
    const perSecond = (incoming + outgoing) / window
    return {
      ts: now,
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

  private static percent(messages: number) {
    return (messages / IntercomLoad.WINDOW_SECONDS / IntercomLoad.LIMIT_PER_SECOND) * 100
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
