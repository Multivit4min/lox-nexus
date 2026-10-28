/** How often something happened and when last (ms since the epoch). */
export interface Tally {
  count: number
  lastAt?: number
}

/** A hook's calls, with the outcome of the last one, e.g. "ok" or "bad request: …". */
export interface HookTally extends Tally {
  lastResult?: string
}

/**
 * Call counters for the panel. They live in memory only: a webhook can be called every second, and
 * writing a counter to the store on every call (as the old integration did) costs a database
 * write each time for numbers nobody needs to survive a restart.
 *
 * Only configured hook names get an entry, so callers probing random names can't grow the map.
 */
export class CallStats {
  readonly wrongToken: Tally = { count: 0 }
  readonly missingToken: Tally = { count: 0 }
  readonly unknownHook: Tally = { count: 0 }
  private readonly hooks = new Map<string, HookTally>()

  constructor(private readonly now: () => number = Date.now) {}

  /** a call that reached a configured hook, whatever its outcome */
  record(hook: string, result: string) {
    const tally = this.hooks.get(hook) ?? { count: 0 }
    this.count(tally)
    tally.lastResult = result
    this.hooks.set(hook, tally)
  }

  /** a call refused before any hook handled it */
  rejected(reason: "wrong" | "missing" | "unknown") {
    this.count(reason === "wrong" ? this.wrongToken : reason === "missing" ? this.missingToken : this.unknownHook)
  }

  hook(name: string): HookTally | undefined {
    return this.hooks.get(name)
  }

  private count(tally: Tally) {
    tally.count++
    tally.lastAt = this.now()
  }
}
