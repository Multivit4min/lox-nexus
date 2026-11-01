import { createHash } from "node:crypto"
import { Sensor } from "@lox-nexus/plugin-sdk"
import type { CronExpression } from "../cron/CronExpression.ts"
import { CronSchedule } from "../cron/CronSchedule.ts"
import type { Common } from "../params/TriggerParams.ts"
import { Jitter } from "../schedule/Jitter.ts"
import { MergedSchedule } from "../schedule/MergedSchedule.ts"
import type { NextChange, ScheduleView } from "../schedule/ScheduleView.ts"
import { Timeline, type Occurrence } from "../schedule/Timeline.ts"
import type { SchedulerPlugin } from "../SchedulerPlugin.ts"

/**
 * A schedule: a sensor whose params say when it runs. It never waits for a run with one long
 * timer. It wakes at the next moment that matters, but at least every MAX_WAIT_MS, and works out
 * from the clock what is due each time, so it doesn't drift, isn't bound by setTimeout's 24.8-day
 * limit, and notices a step of the wall clock (an NTP sync after boot) within a minute: timers
 * count elapsed time, not wall-clock time.
 */
export abstract class ScheduleSensor<Params extends Common> extends Sensor<SchedulerPlugin, Params> implements ScheduleView {
  static readonly MAX_WAIT_MS = 60_000
  /** a run missed by at most this much (Nexus was down, the clock jumped) still runs, once */
  static readonly GRACE_MS = 5 * 60_000

  /** the signal's id; with hosts that don't send one, derived from the capability and params */
  readonly key = this.signal.id || `${this.capability}:${createHash("sha256").update(JSON.stringify(this.params)).digest("hex").slice(0, 16)}`
  abstract readonly kind: string
  abstract readonly summary: string
  readonly canRun: boolean = true
  private cancelTimer: (() => void) | undefined
  /** when it last looked, to notice the clock going back */
  private lastNow: number | undefined

  get name() {
    return this.signal.label || `${this.kind} ${this.summary}`
  }

  get group() {
    return this.params.group
  }

  override start() {
    this.own(this.plugin.schedules.add(this))
    this.listen(this.plugin.changes, "changed", () => this.wake())
    this.begin(this.clock.now())
    this.wake()
  }

  /**
   * Works out and sends what is due now.
   * @returns when to look again (at the latest after MAX_WAIT_MS anyway)
   */
  protected abstract evaluate(now: number): number | undefined

  /** called once at start, before the first evaluate() */
  protected begin(now: number): void {
    void now
  }

  /**
   * The clock went back by more than GRACE_MS (it was ahead and got corrected): forget what was
   * worked out for the old time, such as a value held by Run now until a time that is now far off.
   */
  protected clockWentBack(now: number): void {
    void now
  }

  /** evaluates now and sets the timer for the next time; also after every switch or skip */
  protected wake() {
    this.cancelTimer?.()
    this.cancelTimer = undefined
    if (this.isDisposed) return
    const now = this.clock.now()
    if (this.lastNow !== undefined && this.lastNow - now > ScheduleSensor.GRACE_MS) {
      this.plugin.log.warn(`schedule "${this.name}": the clock went back to ${this.plugin.zone.dateTime(now)}; it goes on from there`)
      this.clockWentBack(now)
    }
    this.lastNow = now
    let next: number | undefined
    try {
      next = this.evaluate(now)
      // windows and next-run sensors send only changes, so a value may not come to clear a failure
      this.recover()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.plugin.log.error(`schedule "${this.name}" failed`, { error: message })
      this.fail(message)
    }
    const wait = next === undefined ? ScheduleSensor.MAX_WAIT_MS : Math.min(Math.max(next - now, 0), ScheduleSensor.MAX_WAIT_MS)
    this.cancelTimer = this.after(wait, () => this.wake())
  }

  offReason() {
    return this.plugin.switches.offReason(this.params.group)
  }

  protected get enabled() {
    return this.offReason() === undefined
  }

  lastRun(now: number): number | undefined {
    void now
    return this.plugin.runs.get(this.key)?.ran
  }

  cancelSkip() {
    return this.plugin.skips.remove(this.key)
  }

  abstract isOn(now: number): boolean | undefined
  abstract skipping(now: number): boolean
  abstract next(now: number): NextChange | undefined
  abstract upcoming(now: number, count: number): string[]
  abstract runNow(now: number): string
  abstract skipNext(now: number): boolean

  /** the events of expressions (a window's start and end) in the plugin's zone, with this schedule's random offset */
  protected timeline(...expressions: CronExpression[]) {
    const jitter = new Jitter(`${this.plugin.seed}:${this.key}`, this.params.randomMinutes ?? 0)
    return new Timeline(new MergedSchedule(expressions.map(expression => new CronSchedule(expression, this.plugin.zone))), jitter)
  }

  /** the first occurrence after `after` that isn't skipped */
  protected nextRunning(timeline: Timeline, after: number): Occurrence | undefined {
    const next = timeline.next(after)
    return next && this.plugin.skips.skips(this.key, next.raw) ? timeline.next(next.at) : next
  }

  /** "Mon 2026-11-02 06:30" plus "(skipped)" */
  protected line(occurrence: Occurrence) {
    const text = this.plugin.zone.dateTime(occurrence.at)
    return this.plugin.skips.skips(this.key, occurrence.raw) ? `${text} (skipped)` : text
  }

  private get capability() {
    return (this.constructor as { id?: string }).id ?? "schedule"
  }
}
