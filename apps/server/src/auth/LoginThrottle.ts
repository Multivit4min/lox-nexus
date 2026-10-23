import { isIPv6 } from "node:net"
import type { Clock } from "@lox-nexus/core"

interface Attempts {
  failures: number
  /** the window starts with the first attempt */
  since: number
}

/**
 * Slows down password guessing. An attempt counts as a failure from the moment it starts
 * (begin()), so parallel requests can't all pass the check while the slow hash runs; a success
 * clears the address. After MAX_FAILURES within WINDOW_MS the address is refused until the window
 * has passed. IPv6 addresses count per /64, since one host usually owns a whole /64.
 */
export class LoginThrottle {
  static readonly MAX_FAILURES = 5
  static readonly WINDOW_MS = 15 * 60 * 1000
  /** bounds memory when many addresses fail; the oldest entry goes first */
  static readonly MAX_TRACKED = 10_000
  private readonly attempts = new Map<string, Attempts>()

  constructor(private readonly clock: Clock) {}

  /**
   * Call before verifying a password.
   * @returns ms until attempts are allowed again; 0 means go ahead (the attempt is already counted)
   */
  begin(address: string): number {
    const key = LoginThrottle.key(address)
    const entry = this.current(key) ?? { failures: 0, since: this.clock.now() }
    if (entry.failures >= LoginThrottle.MAX_FAILURES) return entry.since + LoginThrottle.WINDOW_MS - this.clock.now()
    entry.failures++
    this.attempts.delete(key)
    this.attempts.set(key, entry)
    if (this.attempts.size > LoginThrottle.MAX_TRACKED) this.attempts.delete(this.attempts.keys().next().value!)
    return 0
  }

  /** the attempt was right: forget the address */
  succeeded(address: string) {
    this.attempts.delete(LoginThrottle.key(address))
  }

  private current(key: string) {
    const entry = this.attempts.get(key)
    if (entry && this.clock.now() - entry.since >= LoginThrottle.WINDOW_MS) {
      this.attempts.delete(key)
      return undefined
    }
    return entry
  }

  private static key(address: string) {
    if (!isIPv6(address) || address.startsWith("::ffff:")) return address
    const groups = address.split("::")[0]!.split(":")
    return `${groups.slice(0, 4).join(":")}::/64`
  }
}
