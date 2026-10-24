import type { Clock } from "../bus/Clock.ts"

/** A manually advanced Clock for bus tests; starts at a fixed instant so rendered times are stable. */
export class FakeClock implements Clock {
  constructor(public time = Date.UTC(2026, 9, 23, 12, 4, 31, 120)) {}

  now() {
    return this.time
  }

  /** moves time forward by `ms` milliseconds */
  advance(ms: number) {
    this.time += ms
  }
}
