/**
 * Time and timers for a Disposable's every() and after(), and for plugin code that asks what time
 * it is (`this.clock.now()` instead of `Date.now()`). The runtime gives a plugin the system clock;
 * tests can give it a TestClock (`@lox-nexus/plugin-sdk/testing`) and move time by hand.
 */
export interface Clock {
  /** milliseconds since the epoch, like Date.now() */
  now(): number
  /** like the global setTimeout; the handle is only meant for clearTimeout */
  setTimeout(fn: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
  /** like the global setInterval; the handle is only meant for clearInterval */
  setInterval(fn: () => void, ms: number): unknown
  clearInterval(handle: unknown): void
}

/** The real clock. It looks the globals up on every call, so tests that use mock.timers still work. */
export class SystemClock implements Clock {
  static readonly instance = new SystemClock()

  now() {
    return Date.now()
  }

  setTimeout(fn: () => void, ms: number) {
    return setTimeout(fn, ms)
  }

  clearTimeout(handle: unknown) {
    clearTimeout(handle as NodeJS.Timeout)
  }

  setInterval(fn: () => void, ms: number) {
    return setInterval(fn, ms)
  }

  clearInterval(handle: unknown) {
    clearInterval(handle as NodeJS.Timeout)
  }
}
