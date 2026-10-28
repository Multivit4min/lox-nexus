import type { ScriptErrors } from "./ScriptErrors.ts"
import type { ScriptLog } from "./ScriptLog.ts"
import type { ScriptState } from "./ScriptState.ts"

/** a function of the script, called by the plugin (a timer callback, a nexus.on handler) */
export type ScriptCallback = (...args: unknown[]) => unknown

/**
 * Runs script callbacks (timers, handlers) so that a throw or a rejected promise is logged with
 * the script's line and stack and recorded for the panel, instead of escaping into the worker.
 * Once the script is stopped nothing is reported: what fails then fails because of the stop.
 */
export class ScriptGuard {
  constructor(
    private readonly log: ScriptLog,
    private readonly state: ScriptState,
    private readonly errors: () => ScriptErrors,
    private readonly stopped: () => boolean
  ) {}

  /** calls fn; an error, thrown or as a rejection of the promise it returns, is reported */
  call(origin: string, fn: ScriptCallback, args: unknown[]) {
    try {
      const result = Reflect.apply(fn, undefined, args)
      if (ScriptGuard.isThenable(result)) result.then(undefined, (error: unknown) => this.report(origin, error))
    } catch (error) {
      this.report(origin, error)
    }
  }

  /** logs an uncaught script error; returns its description ("line 4, column 3: TypeError: …") */
  report(origin: string, error: unknown): string {
    const errors = this.errors()
    const text = errors.describe(error)
    if (this.stopped()) return text
    this.state.failed(text)
    this.log.write("error", () => `uncaught error in ${origin}: ${text}`, { stack: errors.stack(error) })
    return text
  }

  private static isThenable(value: unknown): value is PromiseLike<unknown> {
    return (typeof value === "object" || typeof value === "function") && value !== null && typeof (value as { then?: unknown }).then === "function"
  }
}
