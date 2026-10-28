import { Disposable } from "@lox-nexus/plugin-sdk"
import type { ScriptCallback, ScriptGuard } from "./ScriptGuard.ts"

/**
 * setTimeout, setInterval and their clear functions for the script, on top of the plugin's
 * Disposable: stopping the instance clears every timer the script started. Callbacks run through
 * the guard, so a throw is logged instead of crashing the worker. Ids are numbers, as in browsers.
 *
 * Callbacks run in the async context of the script's start, not of the code that set the timer:
 * otherwise an interval (or a setTimeout chain) started in a `nexus.on` handler would carry that
 * command's cause into every later emit and log line.
 */
export class ScriptTimers extends Disposable {
  /** intervals below this run at this rate, so a mistyped `setInterval(fn, 1)` can't spin */
  static readonly MIN_INTERVAL_MS = 10
  private nextId = 1
  private readonly timers = new Map<number, () => void>()

  /** @param root runs a function in the start's async context (an `AsyncLocalStorage.snapshot()`) */
  constructor(
    private readonly guard: ScriptGuard,
    private readonly typeError: (message: string) => Error,
    private readonly root: <R>(fn: () => R) => R
  ) {
    super()
  }

  /** timers that are waiting to fire */
  get active() {
    return this.timers.size
  }

  globals() {
    return {
      setTimeout: (fn: unknown, ms?: unknown, ...args: unknown[]) => this.start("setTimeout", fn, ms, args),
      setInterval: (fn: unknown, ms?: unknown, ...args: unknown[]) => this.start("setInterval", fn, ms, args),
      clearTimeout: (id: unknown) => this.clear(id),
      clearInterval: (id: unknown) => this.clear(id)
    }
  }

  private start(kind: "setTimeout" | "setInterval", fn: unknown, ms: unknown, args: unknown[]): number {
    if (typeof fn !== "function") throw this.typeError(`${kind}: the callback must be a function`)
    const id = this.nextId++
    // a late callback (a fetch that resolved while stopping) gets an id that never fires
    if (this.isDisposed) return id
    const run = () => this.root(() => this.guard.call(kind, fn as ScriptCallback, args))
    const delay = ScriptTimers.delay(ms)
    const cancel = kind === "setInterval"
      ? this.every(Math.min(Math.max(delay, ScriptTimers.MIN_INTERVAL_MS), Disposable.MAX_TIMER_MS), run)
      : this.after(delay, () => {
        this.timers.delete(id)
        run()
      })
    this.timers.set(id, cancel)
    return id
  }

  private clear(id: unknown) {
    if (typeof id !== "number") return
    this.timers.get(id)?.()
    this.timers.delete(id)
  }

  /** like browsers: anything that isn't a positive number means "as soon as possible" */
  private static delay(ms: unknown) {
    const delay = typeof ms === "number" ? ms : typeof ms === "string" ? Number(ms) : 0
    return Number.isFinite(delay) && delay > 0 ? delay : 0
  }
}
