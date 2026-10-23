import type { DataType } from "../DataType.ts"
import { PayloadCodecs } from "../payload/PayloadCodecs.ts"
import type { ValueMap } from "../payload/values.ts"

/** What an Output needs from its peer; narrow so Output can be tested alone. */
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

  /** last value passed to set() */
  get value(): ValueMap[T] | undefined {
    return this.current
  }

  /** false until the first successful set(); outputs without a value are not resent */
  get hasValue() {
    return this.payload !== undefined
  }

  /**
   * validates and stores the value, then sends it exactly once; the peer handles cyclic resends.
   * @throws RangeError | TypeError if the codec rejects the value (nothing is stored or sent), or
   *   the send fails (the value stays stored and is retried by the next cyclic resend)
   */
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
