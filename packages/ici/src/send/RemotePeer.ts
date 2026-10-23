import { EventEmitter } from "node:events"
import { PacketEncoder } from "../codec/PacketEncoder.ts"
import type { DataType } from "../DataType.ts"
import { IciId } from "../id/IciId.ts"
import { DataPacket } from "../packet/DataPacket.ts"
import type { DatagramSender } from "../transport/IciSocket.ts"
import { Output, type OutputTransport } from "./Output.ts"
import { ResendScheduler } from "./ResendScheduler.ts"

export interface PeerOptions {
  /** our ID, as configured for this remote system on the Miniserver */
  ownId: string
  /** the Miniserver's own ID */
  remoteId: string
  host: string
  port: number
  /** cyclic resend of all outputs in ms, like the Miniserver does; 0 disables (default 10000) */
  resendInterval?: number
}

export interface PeerEvents {
  /** a cyclic resend failed; set() rejects instead */
  sendError: [error: Error, packetId: string]
}

/** The sending side towards one Miniserver: typed outputs plus cyclic resends. */
export class RemotePeer extends EventEmitter<PeerEvents> implements OutputTransport {
  private readonly encoder = new PacketEncoder()
  private readonly outputs = new Map<string, Output<DataType>>()
  private readonly scheduler: ResendScheduler
  private closed = false

  constructor(private readonly sender: DatagramSender, private readonly options: PeerOptions) {
    super()
    IciId.from(options.ownId)
    IciId.from(options.remoteId)
    this.scheduler = new ResendScheduler(options.resendInterval ?? 10_000, () => this.resendAll())
  }

  /** returns the output for packetId, creating it on first use; throws if it exists with another type */
  output<T extends DataType>(packetId: string, dataType: T): Output<T> {
    if (this.closed) throw new Error("RemotePeer is closed")
    const existing = this.outputs.get(packetId)
    if (existing && existing.dataType !== dataType) {
      throw new TypeError(`output "${packetId}" already exists with data type ${existing.dataType}`)
    }
    if (existing) return existing as Output<T>
    IciId.from(packetId)
    const output = new Output(packetId, dataType, this)
    this.outputs.set(packetId, output)
    return output
  }

  remove(packetId: string) {
    return this.outputs.delete(packetId)
  }

  async transmit(packetId: string, dataType: DataType, payload: Buffer) {
    if (this.closed) throw new Error("RemotePeer is closed")
    const { ownId, remoteId, host, port } = this.options
    const packet = new DataPacket(ownId, remoteId, packetId, dataType, payload)
    await this.sender.send(this.encoder.encodeData(packet), port, host)
  }

  /** stops cyclic resends and rejects further sends; the socket belongs to the caller */
  close() {
    this.closed = true
    this.scheduler.stop()
    this.outputs.clear()
  }

  private resendAll() {
    for (const output of this.outputs.values()) {
      output.resend().catch((error: Error) => this.emit("sendError", error, output.packetId))
    }
  }
}
