/**
 * The newest `capacity` items. Appends are O(1) amortised; toArray() is only called once per
 * render batch, not per message.
 */
export class RingBuffer<T> {
  private items: T[] = []

  constructor(readonly capacity: number) {}

  get size() {
    return this.items.length
  }

  /** appends and drops the oldest items beyond capacity */
  push(batch: readonly T[]) {
    this.items.push(...batch)
    const excess = this.items.length - this.capacity
    if (excess > 0) this.items.splice(0, excess)
  }

  clear() {
    this.items = []
  }

  /** a copy, oldest first */
  toArray(): T[] {
    return this.items.slice()
  }
}
