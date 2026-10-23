import { isIPv6 } from "node:net"
import type { Clock } from "@lox-nexus/core"

/** Failures counted for one address (or IPv6 /64) in the current window. */
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
  /** attempts allowed per window, counting the one in flight */
  static readonly MAX_FAILURES = 5
  /** fixed window from the first attempt, not sliding: a steady trickle can't keep the lock open forever */
  static readonly WINDOW_MS = 15 * 60 * 1000
  /** bounds memory when many addresses fail; the oldest entry goes first */
  static readonly MAX_TRACKED = 10_000
  // Map keeps insertion order; begin() re-inserts on every attempt, so the first key is the least recently used
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

  /**
   * The attempt was right: forget the address. An attacker who owns one valid account can therefore
   * reset the counter of their own address, but not of anybody else's.
   */
  succeeded(address: string) {
    this.attempts.delete(LoginThrottle.key(address))
  }

  // the entry of the key, or undefined when none exists or its window has passed (it is dropped then)
  private current(key: string) {
    const entry = this.attempts.get(key)
    if (entry && this.clock.now() - entry.since >= LoginThrottle.WINDOW_MS) {
      this.attempts.delete(key)
      return undefined
    }
    return entry
  }

  // IPv4 and IPv4-mapped IPv6 addresses are used as they are; other IPv6 addresses collapse to their first 64 bits
  private static key(address: string) {
    if (!isIPv6(address)) return address
    const plain = address.toLowerCase().split("%")[0]!
    if (plain.startsWith("::ffff:") && plain.includes(".")) return plain.slice(7)
    // expand "::" so that e.g. ::1 and 2001:db8:: land in their own /64
    const [head = "", tail] = plain.split("::")
    const left = head ? head.split(":") : []
    const right = tail ? tail.split(":") : []
    const groups = [...left, ...Array<string>(8 - left.length - right.length).fill("0"), ...right]
    return `${groups.slice(0, 4).map(group => group.replace(/^0+(?=.)/, "")).join(":")}::/64`
  }
}
