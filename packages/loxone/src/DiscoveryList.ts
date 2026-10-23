import type { DataPacket } from "@lox-nexus/ici"
import type { Value } from "@lox-nexus/plugin-sdk/values"

/** A packet id the Miniserver sends but no signal is configured for yet. */
export interface DiscoveredPacket {
  packetId: string
  dataType: number
  /** last decoded value; undefined for unknown data types */
  value?: Value
  firstSeen: number
  lastSeen: number
}

/**
 * Remembers unknown packet ids so the UI can offer to adopt them. Bounded, because packet ids
 * come from the network; when full, the entry seen longest ago is dropped.
 */
export class DiscoveryList {
  private readonly entries = new Map<string, DiscoveredPacket>()

  constructor(private readonly capacity = 1000) {}

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

  /** called when a signal is configured for the packet id */
  forget(packetId: string) {
    this.entries.delete(packetId)
  }

  /** newest last */
  list(): DiscoveredPacket[] {
    return [...this.entries.values()]
  }
}
