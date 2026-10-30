import { Disposable } from "@lox-nexus/plugin-sdk"
import { Backoff } from "./Backoff.ts"

/** The restart policy, in ms. */
export interface RestartTimings {
  backoffInitialMs: number
  backoffMaxMs: number
  /** running this long without a crash resets the backoff */
  stableMs: number
}

/**
 * When a crashed plugin starts again: after a doubling delay, which starts over once the plugin
 * ran `stableMs` without crashing. Counts the automatic restarts until a start or stop from outside.
 */
export class RestartSchedule extends Disposable {
  private readonly backoff: Backoff
  private count = 0
  private cancelRestart = () => {}
  private cancelStable = () => {}

  constructor(private readonly timings: RestartTimings) {
    super()
    this.backoff = new Backoff(timings.backoffInitialMs, timings.backoffMaxMs)
  }

  /** automatic restarts since the last resetCount() */
  get restarts() {
    return this.count
  }

  /** a start or stop from outside: what follows is no automatic restart */
  resetCount() {
    this.count = 0
  }

  /** the plugin runs; if it keeps running, the next crash waits the shortest delay again */
  running() {
    this.cancelStable = this.after(this.timings.stableMs, () => this.backoff.reset())
  }

  /** the plugin ended before it counted as stable */
  ended() {
    this.cancelStable()
  }

  /**
   * Runs `restart` after the next delay, counted in `restarts`.
   * @returns the delay in ms
   */
  crashed(restart: () => void) {
    const delay = this.backoff.next()
    this.cancelRestart = this.after(delay, () => {
      this.count++
      restart()
    })
    return delay
  }

  /** a start or stop meanwhile: no pending restart, and the running time no longer counts */
  cancel() {
    this.cancelRestart()
    this.cancelStable()
  }
}
