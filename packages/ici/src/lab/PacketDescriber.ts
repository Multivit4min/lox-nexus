import type { DecodeResult } from "../codec/DecodeResult.ts"
import type { DataPacket } from "../packet/DataPacket.ts"
import { DataTypeNames } from "./DataTypeNames.ts"

/** One-line, human-readable description of a decoded datagram, flagging anything unexpected. */
export class PacketDescriber {
  private static readonly ZERO_HEADER_BYTES = [1, 2, 3, 4, 5, 6, 7, 16, 25, 34]

  describe(result: DecodeResult, raw: Buffer): string {
    switch (result.kind) {
      case "data": return this.data(result.packet, raw)
      case "status": return `status  ${result.packet.sourceId} tag=${result.packet.deviceTag} raw=${raw.toString("hex")}`
      case "encrypted": return `encrypted ${result.packet.sourceId}→${result.packet.targetId} blocks=${result.packet.blockCount}`
      case "unknown": return `unknown control 0x${result.control.toString(16)} raw=${raw.toString("hex")}`
      case "malformed": return `MALFORMED ${result.reason} raw=${raw.toString("hex")}`
    }
  }

  private data(packet: DataPacket, raw: Buffer) {
    const route = `${packet.sourceId}→${packet.targetId}`
    const type = DataTypeNames.nameOf(packet.dataType)
    const parts = [`${route.padEnd(18)} ${packet.packetId.padEnd(8)} ${type.padEnd(7)} ${packet.payload.toString("hex")}`]
    parts.push(this.value(packet))
    const odd = PacketDescriber.ZERO_HEADER_BYTES.filter(offset => raw[offset] !== 0)
    if (odd.length > 0) parts.push(`⚠ non-zero header bytes ${odd.map(o => `${o}=${raw[o]?.toString(16)}`).join(",")}`)
    return parts.join("  ")
  }

  private value(packet: DataPacket) {
    try {
      const value = packet.value()
      return value === undefined ? "(unknown type)" : `= ${JSON.stringify(value)}`
    } catch (error) {
      return `⚠ ${(error as Error).message}`
    }
  }
}
