import type { DataPacket } from "@lox-nexus/ici"
import type { Value } from "@lox-nexus/plugin-sdk/values"

/** A packet id the Miniserver sends but no signal is configured for yet. */
export interface DiscoveredPacket {
  packetId: string
  /** raw ICI data type byte, kept even when it is unknown and `value` is missing */
  dataType: number
  /** last decoded value; undefined for unknown data types */
  value?: Value
  /** epoch ms of the first packet seen since the id was last forgotten or evicted */
  firstSeen: number
  /** epoch ms of the latest packet; drives eviction order */
  lastSeen: number
}

/**
 * Remembers unknown packet ids so the UI can offer to adopt them. Bounded, because packet ids
 * come from the network; when full, the entry seen longest ago is dropped.
 */
export class DiscoveryList {
  private readonly entries = new Map<string, DiscoveredPacket>()

  /** @param capacity maximum number of remembered packet ids */
  constructor(private readonly capacity = 1000) {}

  /**
   * Notes a packet for an unconfigured id and moves it to the newest position. Keeps `firstSeen`
   * of an existing entry; evicts the least recently seen entry when over capacity.
   */
  record(packet: DataPacket, value: Value | undefined, now: number) {
    const previous = this.entries.get(packet.packetId)
    this.entries.delete(packet.packetId)
    this.entries.set(packet.packetId, {
      packetId: packet.packetId,
      dataType: packet.dataType,
      ...(value ? { value } : {}),
      firstSeen: previous?.firstSeen ?? now,
      lastSeen: now
    })
    if (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next()
      if (!oldest.done) this.entries.delete(oldest.value)
    }
  }

  /** called when a signal is configured for the packet id; a no-op for ids that were never recorded */
  forget(packetId: string) {
    this.entries.delete(packetId)
  }

  /** snapshot ordered by last seen, newest last */
  list(): DiscoveredPacket[] {
    return [...this.entries.values()]
  }
}
