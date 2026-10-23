import type { RemoteInfo } from "node:dgram"
import { EventEmitter } from "node:events"
import { PacketDecoder } from "../codec/PacketDecoder.ts"
import { IciCipher } from "../crypto/IciCipher.ts"
import { IciId } from "../id/IciId.ts"
import type { DataPacket } from "../packet/DataPacket.ts"
import type { EncryptedPacket } from "../packet/EncryptedPacket.ts"
import type { StatusPacket } from "../packet/StatusPacket.ts"
import type { IciSocket } from "../transport/IciSocket.ts"
import { DedupTable } from "./DedupTable.ts"

export interface ReceiverOptions {
  /** our own ID; data packets for other targets are reported as "foreign" */
  ownId: string
  /** accept data only from these Miniserver IDs (default: any) */
  sourceIds?: readonly string[]
  /** decrypts 0x9F packets when set, otherwise they are reported as "encrypted" */
  password?: string
  /** how many (source, packet id) pairs to remember for change detection (default 4096) */
  maxTrackedPackets?: number
}

export interface DataEvent {
  packet: DataPacket
  /** decoded value, undefined for unknown data types */
  value: unknown
  /** false when the payload equals the previous one from the same source and packet id */
  changed: boolean
  from: RemoteInfo
}

export interface ReceiverEvents {
  data: [event: DataEvent]
  status: [packet: StatusPacket, from: RemoteInfo]
  encrypted: [packet: EncryptedPacket, from: RemoteInfo]
  foreign: [packet: DataPacket, from: RemoteInfo]
  unknown: [control: number, buffer: Buffer, from: RemoteInfo]
  malformed: [reason: string, buffer: Buffer, from: RemoteInfo]
  /** a listener of another event threw; reported here so the receive path never crashes */
  listenerError: [error: unknown]
}

/**
 * Decodes, filters and dedupes everything arriving on an IciSocket. Never throws: errors thrown
 * by event listeners are caught and re-emitted as "listenerError" (dropped if nobody listens).
 */
export class IciReceiver extends EventEmitter<ReceiverEvents> {
  private readonly decoder = new PacketDecoder()
  private readonly dedup: DedupTable
  private readonly cipher: IciCipher | undefined
  private readonly onDatagram = (buffer: Buffer, from: RemoteInfo) => this.guarded(() => this.handle(buffer, from))

  constructor(private readonly socket: IciSocket, private readonly options: ReceiverOptions) {
    super()
    IciId.from(options.ownId)
    options.sourceIds?.forEach(id => IciId.from(id))
    this.dedup = new DedupTable(options.maxTrackedPackets)
    this.cipher = options.password === undefined ? undefined : new IciCipher(options.password)
    socket.on("datagram", this.onDatagram)
  }

  dispose() {
    this.socket.off("datagram", this.onDatagram)
    this.dedup.clear()
  }

  private guarded(work: () => void) {
    try {
      work()
    } catch (error) {
      if (this.listenerCount("listenerError") === 0) return
      try {
        this.emit("listenerError", error)
      } catch {
        // a throwing listenerError listener must not crash the receive path either
      }
    }
  }

  private handle(buffer: Buffer, from: RemoteInfo) {
    const result = this.decoder.decode(buffer)
    switch (result.kind) {
      case "data": return this.handleData(result.packet, buffer, from)
      case "encrypted": return this.handleEncrypted(result.packet, buffer, from)
      case "status": return void this.emit("status", result.packet, from)
      case "unknown": return void this.emit("unknown", result.control, buffer, from)
      case "malformed": return void this.emit("malformed", result.reason, buffer, from)
    }
  }

  private handleEncrypted(packet: EncryptedPacket, buffer: Buffer, from: RemoteInfo) {
    if (!this.cipher) return void this.emit("encrypted", packet, from)
    try {
      this.handleData(this.cipher.open(packet), buffer, from)
    } catch (error) {
      this.emit("malformed", `decryption failed: ${IciReceiver.message(error)}`, buffer, from)
    }
  }

  private handleData(packet: DataPacket, buffer: Buffer, from: RemoteInfo) {
    if (!this.isForUs(packet)) return void this.emit("foreign", packet, from)
    let value: unknown
    try {
      value = packet.value()
    } catch (error) {
      return void this.emit("malformed", IciReceiver.message(error), buffer, from)
    }
    this.emit("data", { packet, value, changed: this.dedup.update(packet), from })
  }

  private static message(error: unknown) {
    return error instanceof Error ? error.message : String(error)
  }

  private isForUs(packet: DataPacket) {
    const { ownId, sourceIds } = this.options
    return packet.targetId === ownId && (sourceIds === undefined || sourceIds.includes(packet.sourceId))
  }
}
