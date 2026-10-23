import type { Clock } from "@lox-nexus/core"

interface Attempts {
  failures: number
  /** the window starts with the first failure */
  since: number
}

/**
 * Slows down password guessing: after MAX_FAILURES failed logins from one address within WINDOW_MS,
 * further attempts from it are refused until the window has passed. A success clears the address.
 */
export class LoginThrottle {
  static readonly MAX_FAILURES = 5
  static readonly WINDOW_MS = 15 * 60 * 1000
  /** bounds memory when many addresses fail; the oldest entry goes first */
  static readonly MAX_TRACKED = 10_000
  private readonly attempts = new Map<string, Attempts>()

  constructor(private readonly clock: Clock) {}

  /** @returns ms until attempts are allowed again, 0 when allowed now */
  retryAfter(key: string): number {
    const entry = this.current(key)
    if (!entry || entry.failures < LoginThrottle.MAX_FAILURES) return 0
    return entry.since + LoginThrottle.WINDOW_MS - this.clock.now()
  }

  failed(key: string) {
    const entry = this.current(key) ?? { failures: 0, since: this.clock.now() }
    entry.failures++
    this.attempts.delete(key)
    this.attempts.set(key, entry)
    if (this.attempts.size > LoginThrottle.MAX_TRACKED) this.attempts.delete(this.attempts.keys().next().value!)
  }

  succeeded(key: string) {
    this.attempts.delete(key)
  }

  private current(key: string) {
    const entry = this.attempts.get(key)
    if (entry && this.clock.now() - entry.since >= LoginThrottle.WINDOW_MS) {
      this.attempts.delete(key)
      return undefined
    }
    return entry
  }
}
