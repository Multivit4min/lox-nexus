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

/** Configuration of an IciReceiver. */
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

/** A data packet that passed the target and source filters. */
export interface DataEvent {
  packet: DataPacket
  /** decoded value, undefined for unknown data types */
  value: unknown
  /** false when the payload equals the previous one from the same source and packet id */
  changed: boolean
  /** UDP sender; the Miniserver uses source port 65534, not its configured port */
  from: RemoteInfo
}

/** Events of IciReceiver. Only "data" represents a usable value; the rest exist so nothing is dropped silently. */
export interface ReceiverEvents {
  /** data for us, including unchanged repeats (check `changed`) */
  data: [event: DataEvent]
  /** 0x8D heartbeat; also usable as a liveness signal */
  status: [packet: StatusPacket, from: RemoteInfo]
  /** 0x9F packet while no password is configured */
  encrypted: [packet: EncryptedPacket, from: RemoteInfo]
  /**
   * @experimental a 0x9F handshake: a Miniserver receiving encrypted data challenges its sender,
   * which must answer, or its data is dropped (see PROTOCOL.md)
   */
  handshake: [kind: "challenge" | "response", packet: EncryptedPacket, from: RemoteInfo]
  /** well-formed data addressed to another target ID or sent by a source ID we filter out */
  foreign: [packet: DataPacket, from: RemoteInfo]
  /** unrecognised control byte */
  unknown: [control: number, buffer: Buffer, from: RemoteInfo]
  /** bad length, undecodable payload or failed decryption (usually a wrong password) */
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

  /**
   * Starts listening immediately.
   * @throws RangeError if ownId or any sourceIds entry is not a valid ICI id
   */
  constructor(private readonly socket: IciSocket, private readonly options: ReceiverOptions) {
    super()
    IciId.from(options.ownId)
    options.sourceIds?.forEach(id => IciId.from(id))
    this.dedup = new DedupTable(options.maxTrackedPackets)
    this.cipher = options.password === undefined ? undefined : new IciCipher(options.password)
    socket.on("datagram", this.onDatagram)
  }

  /** Detaches from the socket (which the caller keeps owning) and forgets change-detection state. */
  dispose() {
    this.socket.off("datagram", this.onDatagram)
    this.dedup.clear()
  }

  // listener exceptions must not propagate into dgram's event loop callback
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
    let opened
    try {
      opened = this.cipher.open(packet)
    } catch (error) {
      return void this.emit("malformed", `decryption failed: ${IciReceiver.message(error)}`, buffer, from)
    }
    if (opened.kind === "data") return this.handleData(opened.packet, buffer, from)
    // a handshake between other peers carries no value and concerns nobody here
    if (this.isForUs(packet)) this.emit("handshake", opened.kind, packet, from)
  }

  // a packet counts for dedup only after it passed the filters and its payload decoded
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

  private isForUs(packet: { sourceId: string; targetId: string }) {
    const { ownId, sourceIds } = this.options
    return packet.targetId === ownId && (sourceIds === undefined || sourceIds.includes(packet.sourceId))
  }
}
