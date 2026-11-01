import { Value } from "@lox-nexus/plugin-sdk/values"
import type { StepsSpec } from "../params/StepParams.ts"
import { StepParams } from "../params/StepParams.ts"
import { TriggerParams } from "../params/TriggerParams.ts"
import type { NextChange } from "../schedule/ScheduleView.ts"
import type { Occurrence } from "../schedule/Timeline.ts"
import { ScheduleSensor } from "./ScheduleSensor.ts"

const DAY_MS = 86_400_000

/**
 * A value schedule: steps, each sending its value from its time on (07:00 Mon–Fri → 21,
 * 22:00 daily → 18). It is a state, like a window: whenever it looks, it sends the value of the
 * latest step that has passed, so it is right at start, after a restart and after a clock step,
 * without a run log or a grace for missed runs. The steps are one sequence in time order; a moment
 * two steps share belongs to the later one in the list, and random offsets never reorder steps
 * (see Timeline). Switched off it sends nothing, and on again it sends the current step's value.
 */
export abstract class StepSensor<V> extends ScheduleSensor<StepsSpec<V>> {
  readonly summary = StepParams.describe(this.params.steps, value => this.format(value), this.params.randomMinutes)
  private readonly events = this.timeline(...this.params.steps.map(step => TriggerParams.expression(step)))
  /** Run now brings the next step forward: its value holds from now until the step's own time */
  private heldUntil: number | undefined
  private last: Value | undefined

  /** the value to send */
  protected abstract toValue(value: V): Value
  /** the value in words, for the panel and Next runs */
  protected abstract format(value: V): string

  protected evaluate(now: number) {
    const step = this.enabled ? this.current(now) : undefined
    if (step) {
      const value = this.toValue(this.stepValue(step))
      // re-checks that change nothing send nothing
      if (!Value.equals(value, this.last)) {
        this.last = value
        this.emit(value)
        this.plugin.panelChanged()
      }
    }
    const times = [this.events.next(now)?.at, this.heldUntil]
    return Math.min(...times.filter((time): time is number => time !== undefined && time > now))
  }

  isOn(): undefined {
    return undefined
  }

  skipping(now: number) {
    const next = this.events.next(now)
    return next !== undefined && this.skipped(next)
  }

  next(now: number): NextChange | undefined {
    if (!this.enabled) return undefined
    const next = this.events.find(now, event => !this.skipped(event))
    return next && { at: next.at, value: this.format(this.stepValue(next)) }
  }

  override lastRun(now: number) {
    return this.passed(now)?.at
  }

  upcoming(now: number, count: number) {
    return this.events.upcoming(now, count).map(event =>
      `${this.plugin.zone.dateTime(event.at)} → ${this.format(this.stepValue(event))}${this.skipped(event) ? " (skipped)" : ""}`)
  }

  runNow(now: number) {
    const off = this.offReason()
    if (off) throw new Error(`"${this.name}" doesn't send while ${off}`)
    const next = this.events.find(now, event => !this.skipped(event))
    if (!next) throw new Error(`"${this.name}" has no next step`)
    const text = this.format(this.stepValue(next))
    const when = this.plugin.zone.dateTime(next.at)
    const unchanged = Value.equals(this.toValue(this.stepValue(next)), this.last)
    this.heldUntil = next.at
    this.wake()
    return unchanged
      ? `"${this.name}" already sends ${text}, the value of its next step (${when}); nothing changed`
      : `"${this.name}" sent ${text} now, its next step (${when})`
  }

  skipNext(now: number) {
    const target = this.events.next(now)
    if (!target) throw new Error(`"${this.name}" has no next step to skip`)
    const released = this.heldUntil === target.at
    if (released) this.heldUntil = undefined
    // kept until the step after it, which takes over from the value before the skipped one
    const until = this.events.next(target.at)?.at ?? target.at + DAY_MS
    const added = this.plugin.skips.add(this.key, { raw: target.raw, until })
    // a new skip makes every schedule look again; a step no longer held by Run now must be sent too
    if (released && !added) this.wake()
    return released || added
  }

  protected override clockWentBack() {
    this.heldUntil = undefined
  }

  /** the step whose value holds now: one brought forward by Run now, else the latest that passed */
  private current(now: number): Occurrence | undefined {
    if (this.heldUntil !== undefined && this.heldUntil > now) return this.events.find(now, event => !this.skipped(event))
    return this.passed(now)
  }

  /** the latest step that passed and wasn't skipped (only one step is skipped at a time) */
  private passed(now: number) {
    const latest = this.events.previous(now)
    return latest && this.skipped(latest) ? this.events.previous(latest.at - 1) : latest
  }

  private skipped(event: Occurrence) {
    return this.plugin.skips.skips(this.key, event.raw)
  }

  private stepValue(event: Occurrence): V {
    return this.params.steps[event.index]!.value
  }
}
