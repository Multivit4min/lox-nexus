import { Disposable, type PluginLogger } from "@lox-nexus/plugin-sdk"
import type { TokenCheck } from "./TokenGuard.ts"

/**
 * Logs calls with a wrong or missing token at warn, at most once a minute: the first one right
 * away, then one summary per minute with the count, for as long as they keep coming. A brute force
 * thus costs one log line a minute instead of one per request. The token is never logged.
 */
export class AuthWarnings extends Disposable {
  static readonly WINDOW_MS = 60_000
  private pending = { wrong: 0, missing: 0 }
  private windowOpen = false

  constructor(private readonly log: PluginLogger) {
    super()
  }

  /** @param knownHook whether the call named a configured hook; the path itself may hold a mistyped token, so it isn't logged */
  note(check: Exclude<TokenCheck, "ok">, knownHook: boolean) {
    if (this.isDisposed) return
    if (this.windowOpen) {
      this.pending[check]++
      return
    }
    this.log.warn(`webhook call with a ${check} token, answered 401`, { knownHook })
    this.open()
  }

  private open() {
    this.windowOpen = true
    this.after(AuthWarnings.WINDOW_MS, () => this.close())
  }

  private close() {
    const { wrong, missing } = this.pending
    if (wrong + missing === 0) {
      this.windowOpen = false
      return
    }
    this.log.warn(`${wrong + missing} more webhook calls with a wrong or missing token in the last minute, answered 401`, { wrong, missing })
    this.pending = { wrong: 0, missing: 0 }
    this.open()
  }
}
