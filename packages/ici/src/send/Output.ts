import type { DataType } from "../DataType.ts"
import { PayloadCodecs } from "../payload/PayloadCodecs.ts"
import type { ValueMap } from "../payload/values.ts"

export interface OutputTransport {
  transmit(packetId: string, dataType: DataType, payload: Buffer): Promise<void>
}

/** One typed value sent to a remote Miniserver. Created through RemotePeer.output(). */
export class Output<T extends DataType> {
  private payload: Buffer | undefined
  private current: ValueMap[T] | undefined

  constructor(
    readonly packetId: string,
    readonly dataType: T,
    private readonly transport: OutputTransport
  ) {}

  get value(): ValueMap[T] | undefined {
    return this.current
  }

  get hasValue() {
    return this.payload !== undefined
  }

  /** validates and stores the value, then sends it exactly once; the peer handles cyclic resends */
  async set(value: ValueMap[T]) {
    const payload = PayloadCodecs.for(this.dataType).encode(value)
    this.current = value
    this.payload = payload
    await this.transport.transmit(this.packetId, this.dataType, payload)
  }

  /** sends the stored value again; does nothing before the first set() */
  async resend() {
    if (this.payload) await this.transport.transmit(this.packetId, this.dataType, this.payload)
  }
}
