import type { Clock } from "../bus/Clock.ts"

export class FakeClock implements Clock {
  constructor(public time = Date.UTC(2026, 9, 23, 12, 4, 31, 120)) {}

  now() {
    return this.time
  }

  advance(ms: number) {
    this.time += ms
  }
}
