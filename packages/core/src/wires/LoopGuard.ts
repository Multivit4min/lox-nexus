import type { Cause } from "../bus/BusMessage.ts"

/**
 * Stops wire loops inside the bus. A message carries the wires on its causal path (`via`); a
 * wire whose own id is already on that path would close a loop. Siblings in the same trace,
 * such as several states a plugin reports after one command, are not on each other's path and
 * pass. Loops through external systems can't be seen here: dedup, throttling and forces cover those.
 */
export class LoopGuard {
  static readonly MAX_DEPTH = 16

  allow(wireId: string, cause: Cause): boolean {
    return cause.depth < LoopGuard.MAX_DEPTH && !(cause.via ?? []).includes(wireId)
  }
}
