const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * A time scale from minutes to years: pixel positions, and ticks on round local times (whole
 * minutes, hours, midnights) with labels that fit the span: "14:30", "28 Oct", "Oct 2026".
 */
export class TimeAxis {
  private static readonly STEPS = [MINUTE, 5 * MINUTE, 15 * MINUTE, 30 * MINUTE, HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR, DAY, 2 * DAY, 7 * DAY, 14 * DAY, 30 * DAY, 91 * DAY, 365 * DAY]

  constructor(readonly from: number, readonly to: number, private readonly left: number, private readonly width: number) {}

  x(ts: number) {
    return this.left + ((ts - this.from) / Math.max(1, this.to - this.from)) * this.width
  }

  /** the time at a pixel, for pointers */
  at(px: number) {
    return this.from + ((px - this.left) / Math.max(1, this.width)) * (this.to - this.from)
  }

  /** the step between ticks: the smallest round one that keeps at most `max` ticks */
  step(max = 6) {
    const span = this.to - this.from
    return TimeAxis.STEPS.find(step => span / step <= max) ?? TimeAxis.STEPS.at(-1)!
  }

  /** ticks on round local times within the range; steps of a month or more fall on the first of a month */
  ticks(max = 6): number[] {
    const step = this.step(max)
    if (step >= 30 * DAY) return this.monthTicks(Math.round(step / (30 * DAY)) >= 12 ? 12 : Math.round(step / (30 * DAY)))
    const ticks: number[] = []
    for (let ts = TimeAxis.align(this.from, step); ts <= this.to; ts = TimeAxis.align(ts + step, step)) {
      if (ts >= this.from) ticks.push(ts)
    }
    return ticks
  }

  /** a tick's label: the clock within a day's steps, the date for days, month and year beyond */
  label(ts: number, max = 6) {
    const step = this.step(max)
    const date = new Date(ts)
    if (step < DAY) return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    if (step < 30 * DAY) return date.toLocaleDateString([], { day: "numeric", month: "short" })
    return date.toLocaleDateString([], { month: "short", year: "numeric" })
  }

  // the first of every `months`-th month (January, April, … for quarters) within the range
  private monthTicks(months: number) {
    const ticks: number[] = []
    const start = new Date(this.from)
    const date = new Date(start.getFullYear(), Math.ceil((start.getMonth() + (start.getDate() > 1 || start.getHours() > 0 ? 1 : 0)) / months) * months, 1)
    for (; date.getTime() <= this.to; date.setMonth(date.getMonth() + months)) ticks.push(date.getTime())
    return ticks
  }

  // rounds up to the next multiple of the step in local time, so a day tick is a local midnight
  private static align(ts: number, step: number) {
    const offset = -new Date(ts).getTimezoneOffset() * MINUTE
    return Math.ceil((ts + offset) / step) * step - offset
  }
}
