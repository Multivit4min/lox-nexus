import type { DecodeResult } from "../codec/DecodeResult.ts"
import type { IciCipher } from "../crypto/IciCipher.ts"

/**
 * Decides which datagrams `capture --only` prints. Only packets that carry a packet id are
 * filtered: data packets, and encrypted ones that decrypt with the given password. Status
 * heartbeats, unknown and malformed datagrams, and encrypted packets that can't be read are
 * always shown, because hiding them would hide exactly what the lab is for.
 */
export class CaptureFilter {
  constructor(private readonly only?: readonly string[], private readonly cipher?: IciCipher) {}

  shows(result: DecodeResult): boolean {
    if (!this.only) return true
    if (result.kind === "data") return this.only.includes(result.packet.packetId)
    if (result.kind !== "encrypted" || !this.cipher) return true
    try {
      return this.only.includes(this.cipher.open(result.packet).packetId)
    } catch {
      return true
    }
  }
}
