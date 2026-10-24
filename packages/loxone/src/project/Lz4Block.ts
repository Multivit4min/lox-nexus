/**
 * Decodes one raw LZ4 block (sequences of literals and back-references) into an output of known
 * size, checking every length and offset so a corrupt file throws instead of reading out of bounds.
 */
export class Lz4Block {
  private readonly out: Buffer
  private at = 0
  private written = 0

  constructor(private readonly input: Uint8Array, size: number) {
    this.out = Buffer.alloc(size)
  }

  decode(): Buffer {
    while (this.at < this.input.length) {
      const token = this.byte()
      this.literals(this.length(token >> 4))
      // the last sequence has literals only
      if (this.at >= this.input.length) break
      const offset = this.byte() | (this.byte() << 8)
      this.match(offset, this.length(token & 0x0f) + 4)
    }
    if (this.written !== this.out.length) throw new Error(`LoxCC data is ${this.written} bytes, the header says ${this.out.length}`)
    return this.out
  }

  // a nibble of 15 continues in following bytes, each adding up to 255
  private length(nibble: number) {
    let length = nibble
    if (nibble !== 15) return length
    let next: number
    do {
      next = this.byte()
      length += next
    } while (next === 255)
    return length
  }

  private literals(count: number) {
    if (this.at + count > this.input.length) throw new Error("LoxCC data is truncated")
    this.room(count)
    this.out.set(this.input.subarray(this.at, this.at + count), this.written)
    this.at += count
    this.written += count
  }

  // a match that overlaps the bytes it produces (offset < count repeats a run) has to go byte by byte
  private match(offset: number, count: number) {
    if (offset === 0 || offset > this.written) throw new Error("LoxCC data refers before its start")
    this.room(count)
    const from = this.written - offset
    if (offset >= count) {
      this.out.copyWithin(this.written, from, from + count)
      this.written += count
      return
    }
    for (let i = 0; i < count; i++, this.written++) this.out[this.written] = this.out[from + i]!
  }

  private room(count: number) {
    if (this.written + count > this.out.length) throw new Error("LoxCC data is longer than its header says")
  }

  private byte() {
    const value = this.input[this.at++]
    if (value === undefined) throw new Error("LoxCC data is truncated")
    return value
  }
}
