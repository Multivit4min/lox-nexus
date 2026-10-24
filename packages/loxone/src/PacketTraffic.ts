import type { Clock } from "@lox-nexus/core"
import { TrafficMeter } from "./TrafficMeter.ts"

/** "in": sent by the Miniserver (a Nexus input), "out": sent to it (a Nexus output, resends included) */
export type PacketDirection = "in" | "out"

/**
 * Messages per packet id and direction over the load window, so each signal's share of the
 * Miniserver's intercommunication limit can be shown. One TrafficMeter (about 2 KB) per packet id
 * that had traffic; idle ones are dropped by prune(), and at most MAX_PACKETS are tracked at once
 * so a flood of made-up packet ids can't grow memory.
 */
export class PacketTraffic {
  static readonly MAX_PACKETS = 4096
  private readonly meters = new Map<string, TrafficMeter>()

  constructor(private readonly clock: Clock, private readonly windowSeconds: number) {}

  count(direction: PacketDirection, packetId: string) {
    const key = PacketTraffic.key(direction, packetId)
    let meter = this.meters.get(key)
    if (!meter) {
      if (this.meters.size >= PacketTraffic.MAX_PACKETS) return
      meter = new TrafficMeter(this.clock, this.windowSeconds)
      this.meters.set(key, meter)
    }
    if (direction === "in") meter.received()
    else meter.sent()
  }

  /** messages within the window */
  total(direction: PacketDirection, packetId: string) {
    const totals = this.meters.get(PacketTraffic.key(direction, packetId))?.totals()
    return totals ? totals.incoming + totals.outgoing : 0
  }

  /** forgets packet ids without traffic in the window */
  prune() {
    for (const [key, meter] of this.meters) {
      const { incoming, outgoing } = meter.totals()
      if (incoming + outgoing === 0) this.meters.delete(key)
    }
  }

  private static key(direction: PacketDirection, packetId: string) {
    return `${direction} ${packetId}`
  }
}
