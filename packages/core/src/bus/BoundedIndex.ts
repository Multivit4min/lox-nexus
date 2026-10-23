/**
 * A map that keeps only the most recently *inserted* `capacity` keys (updating an existing key
 * does not refresh its position). Eviction is O(1) through a ring of keys;
 * deleting from the front of a Map instead leaves holes that V8 scans on every eviction.
 */
export class BoundedIndex<V> {
  private readonly map = new Map<string, V>()
  private readonly ring: Array<string | undefined>
  private head = 0

  /** @throws RangeError unless capacity is a positive integer */
  constructor(private readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError(`capacity must be a positive integer, got ${capacity}`)
    this.ring = new Array<string | undefined>(capacity)
  }

  get size() {
    return this.map.size
  }

  get(key: string) {
    return this.map.get(key)
  }

  /** Inserting a new key into a full index silently evicts the oldest one. */
  set(key: string, value: V) {
    if (!this.map.has(key)) {
      const evicted = this.ring[this.head]
      if (evicted !== undefined) this.map.delete(evicted)
      this.ring[this.head] = key
      this.head = (this.head + 1) % this.capacity
    }
    this.map.set(key, value)
  }
}
