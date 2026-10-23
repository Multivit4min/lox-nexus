import { randomBytes } from "node:crypto"
import { IvBlock } from "./IvBlock.ts"

/**
 * Issues IV blocks for one sender the way our test Miniserver does: a 32-bit packet counter that
 * goes up by one per packet, XOR-ed with a constant mask, so the value on the wire looks scrambled.
 */
export class IvSequence {
  private counter: number

  /** @param mask and start are random by default; tests pass fixed values */
  constructor(private readonly mask = randomBytes(4).readUint32LE(0), start = randomBytes(4).readUint32LE(0), private readonly magic?: Buffer) {
    this.counter = start >>> 0
  }

  next(kind: number): IvBlock {
    const block = IvBlock.create(kind, (this.counter ^ this.mask) >>> 0, this.magic)
    this.counter = (this.counter + 1) >>> 0
    return block
  }
}
