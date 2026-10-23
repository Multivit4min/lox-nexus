import type { Cause } from "../bus/BusMessage.ts"

/**
 * Stops wire loops inside the bus: a wire may fire at most once per trace, and no chain may
 * grow deeper than MAX_DEPTH. Loops through external systems can't be seen here; dedup,
 * throttling and forces are the tools for those.
 */
export class LoopGuard {
  static readonly MAX_DEPTH = 16
  private readonly fired = new Map<string, Set<string>>()

  constructor(private readonly capacity = 10_000) {}

  allow(wireId: string, cause: Cause): boolean {
    if (cause.depth >= LoopGuard.MAX_DEPTH) return false
    let wires = this.fired.get(cause.traceId)
    if (wires?.has(wireId)) return false
    if (!wires) {
      wires = new Set()
      this.fired.set(cause.traceId, wires)
      this.evict()
    }
    wires.add(wireId)
    return true
  }

  private evict() {
    if (this.fired.size <= this.capacity) return
    const oldest = this.fired.keys().next()
    if (!oldest.done) this.fired.delete(oldest.value)
  }
}
