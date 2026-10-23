import { randomBytes } from "node:crypto"
import { IvBlock } from "./IvBlock.ts"

/** Issues IV blocks for one sender: a shared counter (wraps at 255) and a constant 3-byte suffix. */
export class IvSequence {
  private counter = 0

  /** @param suffix identifies this sender; random by default (any value is accepted by the Miniserver, per the reverse engineering) */
  constructor(readonly suffix: Buffer = randomBytes(3)) {
    if (suffix.length !== 3) throw new RangeError("the IV suffix is 3 bytes")
  }

  next(kind: number): IvBlock {
    const block = IvBlock.create(kind, this.counter, this.suffix)
    this.counter = (this.counter + 1) & 0xff
    return block
  }
}
