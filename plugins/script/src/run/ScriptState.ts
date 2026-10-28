/** An uncaught error of the script, described with its line. */
export interface ScriptFailure {
  text: string
  at: number
}

/**
 * What the panel shows about the script itself. The top level runs once per start; afterwards
 * the script lives on in its timers and handlers, so a failed top level doesn't stop it.
 */
export class ScriptState {
  topLevel: "running" | "finished" | "failed" = "running"
  startedAt: number | undefined
  topLevelError: string | undefined
  lastError: ScriptFailure | undefined
  errors = 0

  constructor(private readonly now: () => number = Date.now) {}

  started() {
    this.startedAt = this.now()
  }

  finished() {
    this.topLevel = "finished"
  }

  topLevelFailed(text: string) {
    this.topLevel = "failed"
    this.topLevelError = text
    this.failed(text)
  }

  failed(text: string) {
    this.errors++
    this.lastError = { text, at: this.now() }
  }
}
