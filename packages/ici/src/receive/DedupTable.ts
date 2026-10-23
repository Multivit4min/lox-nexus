import type { DataPacket } from "../packet/DataPacket.ts"

/**
 * Remembers the last payload per (source, packet id) to tell changes from repeats. Miniservers
 * resend every output on a global 10 s tick, so most received packets are repeats.
 */
export class DedupTable {
  private readonly last = new Map<string, DataPacket>()

  /** stores the packet and returns true if it differs from the previous one with the same key */
  update(packet: DataPacket): boolean {
    const key = `${packet.sourceId}\u0000${packet.packetId}`
    const previous = this.last.get(key)
    this.last.set(key, packet)
    return previous === undefined || !previous.samePayload(packet)
  }

  clear() {
    this.last.clear()
  }
}
