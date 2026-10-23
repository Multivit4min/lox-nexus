import type { DataPacket } from "../packet/DataPacket.ts"

/**
 * Remembers the last payload per (source, packet id) to tell changes from repeats. Miniservers
 * resend every output on a global 10 s tick, so most received packets are repeats.
 *
 * Keys come from the network, so the table is bounded: once full, the least recently seen
 * entry is evicted (Map keeps insertion order, and every update re-inserts its key).
 */
export class DedupTable {
  private readonly last = new Map<string, DataPacket>()

  /** @throws RangeError unless maxEntries is a positive integer */
  constructor(private readonly maxEntries = 4096) {
    if (!Number.isInteger(maxEntries) || maxEntries < 1) throw new RangeError(`maxEntries must be a positive integer, got ${maxEntries}`)
  }

  /** number of remembered (source, packet id) pairs, never above maxEntries */
  get size() {
    return this.last.size
  }

  /** stores the packet and returns true if it differs from the previous one with the same key */
  update(packet: DataPacket): boolean {
    const key = `${packet.sourceId}\u0000${packet.packetId}`
    const previous = this.last.get(key)
    this.last.delete(key)
    this.last.set(key, packet)
    if (this.last.size > this.maxEntries) this.evictOldest()
    return previous === undefined || !previous.samePayload(packet)
  }

  /** forgets everything, so the next packet per key counts as changed again */
  clear() {
    this.last.clear()
  }

  private evictOldest() {
    const oldest = this.last.keys().next()
    if (!oldest.done) this.last.delete(oldest.value)
  }
}
