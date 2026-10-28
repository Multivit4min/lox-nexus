import type { Clock } from "../lifecycle/Clock.ts"

// taken when this module loads, so a test that also mocks timers can't stall advance()
const realSetImmediate = globalThis.setImmediate

interface Timer {
  due: number
  /** order of creation, so timers due at the same time run in the order they were set */
  seq: number
  fn: () => void
  /** set for intervals */
  every?: number
}

/**
 * A clock that only moves when the test says so. Give it to PluginTestHost (`{ clock }`): the
 * plugin's every() and after() run on it, and `this.clock.now()` reads it.
 *
 * Unlike `mock.timers.tick()`, which sets the time to the end of the tick before running the due
 * timers, advance() runs each timer at its own due time, so a callback that asks for the time or
 * sets the next timer sees the time it was due at:
 *
 * ```ts
 * const clock = new TestClock("2026-10-28T08:00:00Z")
 * const host = await PluginTestHost.start(CalendarPlugin, { clock, config })
 * await clock.advanceTo("2026-10-28T09:30:00Z")
 * ```
 */
export class TestClock implements Clock {
  private time: number
  private seq = 0
  private readonly timers = new Map<number, Timer>()

  /** @param start the initial time: epoch milliseconds, an ISO string or a Date; default 0 */
  constructor(start: number | string | Date = 0) {
    this.time = TestClock.ms(start)
  }

  now() {
    return this.time
  }

  setTimeout(fn: () => void, ms: number) {
    return this.add({ due: this.time + TestClock.delay(ms), seq: 0, fn })
  }

  clearTimeout(handle: unknown) {
    this.timers.delete(handle as number)
  }

  setInterval(fn: () => void, ms: number) {
    const every = Math.max(1, TestClock.delay(ms))
    return this.add({ due: this.time + every, seq: 0, fn, every })
  }

  clearInterval(handle: unknown) {
    this.timers.delete(handle as number)
  }

  /** timers that haven't fired yet (intervals count until cleared) */
  get pending() {
    return this.timers.size
  }

  /**
   * Moves the time forward by `ms`, running every timer that comes due on the way at its due time,
   * in order, including timers those callbacks set. After each callback it lets pending promise
   * callbacks and I/O events run once, so async work started by a timer can continue at that time.
   * @throws RangeError for a negative or non-finite `ms`
   */
  async advance(ms: number) {
    if (!Number.isFinite(ms) || ms < 0) throw new RangeError(`advance needs a finite number >= 0, got ${ms}`)
    const end = this.time + ms
    for (let timer = this.nextDue(end); timer; timer = this.nextDue(end)) {
      this.time = Math.max(this.time, timer.due)
      this.fire(timer)
      await new Promise(resolve => realSetImmediate(resolve))
    }
    this.time = end
  }

  /**
   * Steps the time by `ms` (negative goes back) without running anything, like an NTP correction:
   * timers keep their remaining delay, because real timers count elapsed time, not wall time.
   */
  jump(ms: number) {
    if (!Number.isFinite(ms)) throw new RangeError(`jump needs a finite number, got ${ms}`)
    this.time += ms
    for (const timer of this.timers.values()) timer.due += ms
  }

  /** advance() up to a time: epoch milliseconds, an ISO string or a Date; never moves backwards */
  async advanceTo(time: number | string | Date) {
    await this.advance(Math.max(0, TestClock.ms(time) - this.time))
  }

  private add(timer: Timer) {
    const id = ++this.seq
    this.timers.set(id, { ...timer, seq: id })
    return id
  }

  private nextDue(end: number) {
    let next: [number, Timer] | undefined
    for (const entry of this.timers) {
      const [, timer] = entry
      if (timer.due <= end && (!next || timer.due < next[1].due || (timer.due === next[1].due && timer.seq < next[1].seq))) next = entry
    }
    return next && { id: next[0], ...next[1] }
  }

  private fire(timer: Timer & { id: number }) {
    if (timer.every) this.timers.set(timer.id, { ...timer, due: timer.due + timer.every, seq: ++this.seq })
    else this.timers.delete(timer.id)
    timer.fn()
  }

  private static delay(ms: number) {
    return Number.isFinite(ms) && ms > 0 ? ms : 0
  }

  private static ms(time: number | string | Date) {
    const ms = typeof time === "number" ? time : typeof time === "string" ? Date.parse(time) : time.getTime()
    if (!Number.isFinite(ms)) throw new RangeError(`not a time: ${String(time)}`)
    return ms
  }
}
