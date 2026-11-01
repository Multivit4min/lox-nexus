import type { z } from "@lox-nexus/plugin-sdk"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { WindowParams } from "../params/WindowParams.ts"
import type { NextChange } from "../schedule/ScheduleView.ts"
import type { Occurrence } from "../schedule/Timeline.ts"
import { ScheduleSensor } from "./ScheduleSensor.ts"

type Params = z.output<typeof WindowParams.schema>

const DAY_MS = 86_400_000
const START = 0
const END = 1

/**
 * On from a start until the next end, off otherwise; 22:00–06:00 crosses midnight. Starts and
 * ends are one sequence of events (see Timeline), and the window is on when the latest event is a
 * start. Worked out from the clock whenever it is needed, so it is right after a restart and a
 * clock step. Random offsets can't make an end come before its start. Switched off it sends
 * false; a skipped window stays off until its end; one opened by Run now stays open until its
 * next end, also across a restart.
 */
export class WindowSensor extends ScheduleSensor<Params> {
  static readonly id = "window"
  static readonly label = "Window"
  static readonly description = "On between a start and an end time, e.g. 22:00–06:00 for night mode"
  static readonly params = WindowParams.schema
  static readonly valueType = "boolean"
  readonly kind = "Window"
  readonly summary = WindowParams.describe(this.params)
  private readonly expressions = WindowParams.expressions(this.params)
  private readonly events = this.timeline(this.expressions.start, this.expressions.end)
  private openedUntil: number | undefined
  private last: boolean | undefined

  protected override begin(now: number) {
    const until = this.plugin.runs.started(this.key, now)?.openUntil
    if (until !== undefined && until > now) this.openedUntil = until
  }

  protected evaluate(now: number) {
    const on = this.enabled && this.isOn(now)
    // re-checks that change nothing send nothing, so Loxone sees one value per transition
    if (on !== this.last) {
      if (on && this.last === false) this.plugin.runs.ran(this.key, now)
      this.last = on
      this.emit(Value.boolean(on))
      this.plugin.panelChanged()
    }
    const times = [this.events.next(now)?.at, this.openedUntil]
    return Math.min(...times.filter((time): time is number => time !== undefined && time > now))
  }

  isOn(now: number) {
    return (this.openedUntil !== undefined && this.openedUntil > now) || this.regularlyOn(now)
  }

  skipping(now: number) {
    const target = this.current(now) ?? this.nextStart(now)
    return target !== undefined && this.plugin.skips.skips(this.key, target.raw)
  }

  next(now: number): NextChange | undefined {
    if (!this.enabled) return undefined
    if (this.openedUntil !== undefined && this.openedUntil > now) {
      // opened by Run now: off then, unless the regular window is on by then (an edit or a clock step may have moved it)
      if (!this.regularlyOn(this.openedUntil)) return { at: this.openedUntil, turns: "off" }
      const end = this.events.find(this.openedUntil, event => event.index === END)
      return end && { at: end.at, turns: "off" }
    }
    if (this.isOn(now)) {
      const end = this.events.find(now, event => event.index === END)
      return end && { at: end.at, turns: "off" }
    }
    const start = this.events.find(now, event => event.index === START && !this.plugin.skips.skips(this.key, event.raw))
    return start && { at: start.at, turns: "on" }
  }

  upcoming(now: number, count: number) {
    return this.events.upcoming(now, count, event => event.index === START).map(start => {
      const end = this.endAfter(start)
      return `${this.line(start)} – ${end ? this.plugin.zone.dateTime(end.at) : "never"}`
    })
  }

  runNow(now: number) {
    const off = this.offReason()
    if (off) throw new Error(`"${this.name}" doesn't open while ${off}`)
    const end = this.events.find(now, event => event.index === END)
    if (!end) throw new Error(`"${this.name}" has no end to close at`)
    this.open(end.at)
    this.wake()
    return `Opened "${this.name}" until ${this.plugin.zone.dateTime(end.at)}`
  }

  skipNext(now: number) {
    // a window that is open now is the one to skip: it closes at once
    const target = this.current(now) ?? this.nextStart(now)
    if (!target) throw new Error(`"${this.name}" has no next window to skip`)
    const closed = this.open(undefined)
    const until = this.endAfter(target)?.at ?? target.at + DAY_MS
    const added = this.plugin.skips.add(this.key, { raw: target.raw, until })
    // a new skip makes every schedule look again; closing a window opened by Run now must be sent too
    if (closed && !added) this.wake()
    return closed || added
  }

  protected override clockWentBack() {
    this.open(undefined)
  }

  /** @returns whether it changed */
  private open(until: number | undefined) {
    if (this.openedUntil === until) return false
    this.openedUntil = until
    this.plugin.runs.opened(this.key, until)
    return true
  }

  /** on by its own starts and ends, skips included */
  private regularlyOn(at: number) {
    const current = this.current(at)
    return current !== undefined && !this.plugin.skips.skips(this.key, current.raw)
  }

  /** the start of the window open now, skips ignored */
  private current(now: number): Occurrence | undefined {
    const latest = this.events.previous(now)
    return latest?.index === START ? latest : undefined
  }

  private nextStart(now: number) {
    return this.events.find(now, event => event.index === START)
  }

  private endAfter(start: Occurrence) {
    return this.events.find(start.at, event => event.index === END)
  }
}
