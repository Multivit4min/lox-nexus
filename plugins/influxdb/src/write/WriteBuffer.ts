/**
 * The lines waiting to be written, oldest first, bounded so an unreachable InfluxDB can't exhaust
 * the worker's memory: by points (`capacity`) and by characters (`maxChars`), since lines of long
 * names take more room. Beyond either bound the oldest waiting lines are dropped and counted.
 *
 * A batch taken for writing stays *held* (and counted against both bounds) until it is released,
 * so a batch being retried is never dropped from under the writer; only lines still waiting are.
 */
export class WriteBuffer {
  /** 32M characters: 32 MB as one-byte strings, 64 MB at most (two-byte strings), of a 128 MB heap */
  static readonly MAX_CHARS = 32_000_000

  private queue: string[] = []
  private held = 0
  private heldChars = 0
  private queuedChars = 0
  private droppedCount = 0

  constructor(readonly capacity: number, readonly maxChars = WriteBuffer.MAX_CHARS) {}

  /** lines waiting, not counting a held batch */
  get waiting() {
    return this.queue.length
  }

  /** every line not written yet: the waiting ones and a held batch */
  get size() {
    return this.queue.length + this.held
  }

  /** characters of every line not written yet */
  get chars() {
    return this.queuedChars + this.heldChars
  }

  /** lines dropped because the buffer was full, since the start */
  get dropped() {
    return this.droppedCount
  }

  /** appends lines and returns how many old ones had to be dropped for them */
  add(lines: readonly string[]): number {
    for (const line of lines) {
      this.queue.push(line)
      this.queuedChars += line.length
    }
    let drop = 0
    let size = this.size
    let chars = this.chars
    while (drop < this.queue.length && (size > this.capacity || chars > this.maxChars)) {
      chars -= (this.queue[drop] as string).length
      size--
      drop++
    }
    if (drop === 0) return 0
    this.queue.splice(0, drop)
    this.queuedChars = chars - this.heldChars
    this.droppedCount += drop
    return drop
  }

  /** takes up to `count` of the oldest lines as the held batch (one at a time) */
  take(count: number): string[] {
    if (this.held > 0) throw new Error("a batch is still held")
    const batch = this.queue.splice(0, count)
    this.held = batch.length
    this.heldChars = WriteBuffer.length(batch)
    this.queuedChars -= this.heldChars
    return batch
  }

  /** puts the end of the held batch back in front of the waiting lines, e.g. to send a smaller batch */
  giveBack(lines: readonly string[]) {
    const chars = WriteBuffer.length(lines)
    this.queue = [...lines, ...this.queue]
    this.held = Math.max(0, this.held - lines.length)
    this.heldChars -= chars
    this.queuedChars += chars
  }

  /** the held batch was written or given up on */
  release() {
    this.held = 0
    this.heldChars = 0
  }

  private static length(lines: readonly string[]) {
    let chars = 0
    for (const line of lines) chars += line.length
    return chars
  }
}
