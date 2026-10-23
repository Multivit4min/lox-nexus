/** Fixed-capacity FIFO: pushing beyond capacity overwrites the oldest item in O(1). */
export class RingBuffer<T> {
  private readonly items: Array<T | undefined>
  private start = 0
  private count = 0

  constructor(private readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError(`capacity must be a positive integer, got ${capacity}`)
    this.items = new Array<T | undefined>(capacity)
  }

  get size() {
    return this.count
  }

  /** adds an item and returns the one it evicted, if the buffer was full */
  push(item: T): T | undefined {
    const index = (this.start + this.count) % this.capacity
    if (this.count < this.capacity) {
      this.items[index] = item
      this.count++
      return undefined
    }
    const evicted = this.items[this.start]
    this.items[this.start] = item
    this.start = (this.start + 1) % this.capacity
    return evicted
  }

  /** all items, oldest first */
  toArray(): T[] {
    const result: T[] = []
    for (let i = 0; i < this.count; i++) result.push(this.items[(this.start + i) % this.capacity] as T)
    return result
  }
}
