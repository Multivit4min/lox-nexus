import type { DecodeResult } from "../codec/DecodeResult.ts"
import type { IciCipher } from "../crypto/IciCipher.ts"
import type { DataPacket } from "../packet/DataPacket.ts"
import type { EncryptedPacket } from "../packet/EncryptedPacket.ts"
import { DataTypeNames } from "./DataTypeNames.ts"

/** One-line, human-readable description of a decoded datagram, flagging anything unexpected. */
export class PacketDescriber {
  /** @param cipher when given, 0x9F packets are decrypted for display; without it only their header is shown */
  constructor(private readonly cipher?: IciCipher) {}

  /** `raw` is the original datagram, shown in hex for packets that could not be decoded further */
  describe(result: DecodeResult, raw: Buffer): string {
    switch (result.kind) {
      case "data": return this.data(result.packet)
      case "status": return `status  ${result.packet.sourceId} tag=${result.packet.deviceTag} raw=${raw.toString("hex")}`
      case "encrypted": return this.encrypted(result.packet)
      case "unknown": return `unknown control 0x${result.control.toString(16)} raw=${raw.toString("hex")}`
      case "malformed": return `MALFORMED ${result.reason} raw=${raw.toString("hex")}`
    }
  }

  private encrypted(packet: EncryptedPacket) {
    const summary = `encrypted ${packet.sourceId}→${packet.targetId} blocks=${packet.blockCount}`
    if (!this.cipher) return summary
    try {
      return `🔓 ${this.data(this.cipher.open(packet))}`
    } catch (error) {
      return `${summary}  ⚠ ${error instanceof Error ? error.message : String(error)}`
    }
  }

  // the warnings (reserved bytes, trailing data) are the point of the lab: they are where new protocol knowledge hides
  private data(packet: DataPacket) {
    const route = `${packet.sourceId}→${packet.targetId}`
    const type = DataTypeNames.nameOf(packet.dataType)
    const parts = [`${route.padEnd(18)} ${packet.packetId.padEnd(8)} ${type.padEnd(7)} ${packet.payload.toString("hex")}`]
    parts.push(this.value(packet))
    const reserved = packet.reservedNonZero()
    if (reserved.length > 0) parts.push(`⚠ non-zero reserved bytes ${reserved.map(o => `${o}=${packet.raw?.[o]?.toString(16)}`).join(",")}`)
    if (packet.trailing().length > 0) parts.push(`⚠ trailing bytes ${packet.trailing().toString("hex")}`)
    return parts.join("  ")
  }

  private value(packet: DataPacket) {
    try {
      const value = packet.value()
      return value === undefined ? "(unknown type)" : `= ${JSON.stringify(value)}`
    } catch (error) {
      return `⚠ ${error instanceof Error ? error.message : String(error)}`
    }
  }
}
