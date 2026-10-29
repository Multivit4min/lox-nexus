import { Disposable } from "@lox-nexus/plugin-sdk"
import type { Logger } from "pino"
import type { SessionService } from "./SessionService.ts"

/** Removes expired sessions once an hour, for as long as it lives. */
export class SessionPruner extends Disposable {
  static readonly INTERVAL_MS = 60 * 60 * 1000

  constructor(private readonly sessions: Pick<SessionService, "prune">, private readonly log: Logger) {
    super()
    this.every(SessionPruner.INTERVAL_MS, () => this.prune())
  }

  // a timer callback must not throw: a busy database here would otherwise crash the process
  private prune() {
    try {
      this.sessions.prune()
    } catch (error) {
      this.log.warn({ err: error }, "removing expired sessions failed")
    }
  }
}
