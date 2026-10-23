/** Time source injected into the bus so tests can drive expiry with mock timers. */
export interface Clock {
  /** epoch milliseconds */
  now(): number
}

/** The real wall clock. */
export class SystemClock implements Clock {
  now() {
    return Date.now()
  }
}
