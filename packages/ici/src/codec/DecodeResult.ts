import type { DataPacket } from "../packet/DataPacket.ts"
import type { EncryptedPacket } from "../packet/EncryptedPacket.ts"
import type { StatusPacket } from "../packet/StatusPacket.ts"

/** Outcome of decoding one datagram. Decoding never throws; bad input becomes "malformed". */
export type DecodeResult =
  | { kind: "data"; packet: DataPacket }
  | { kind: "status"; packet: StatusPacket }
  | { kind: "encrypted"; packet: EncryptedPacket }
  | { kind: "unknown"; control: number; buffer: Buffer }
  | { kind: "malformed"; reason: string; buffer: Buffer }
