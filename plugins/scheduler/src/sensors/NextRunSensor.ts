import { z } from "@lox-nexus/plugin-sdk"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { TriggerParams } from "../params/TriggerParams.ts"
import { TimeFormat } from "../time/TimeFormat.ts"
import { PointSchedule } from "./PointSchedule.ts"

// no random offset: it couldn't match the offsets of another schedule, which each draw their own
const params = TriggerParams.choice({
  ...TriggerParams.group,
  format: z.enum(["minutesUntil", "unix", "loxone"]).default("minutesUntil").meta({
    title: "Send as",
    description: "Minutes from now are 1000000 without a next run; the two dates are 0 without one",
    enumLabels: {
      minutesUntil: "Minutes from now", unix: "Unix time (seconds since 1970)",
      loxone: "Loxone date and time (seconds since 2009, local time)"
    }
  })
})

/**
 * When the schedule runs next: minutes from now (counting down every minute), Unix time or
 * Loxone date and time. It does nothing at the run itself; skipped runs are left out, and
 * switched off it has no next run.
 */
export class NextRunSensor extends PointSchedule<z.output<typeof params>> {
  static readonly id = "next-run"
  static readonly label = "Next run"
  static readonly description = "When the schedule runs next, e.g. minutes until the next waste collection day"
  static readonly params = params
  static readonly valueType = "number"
  readonly kind = "Next run"
  override readonly canRun = false
  protected readonly skipKeptMs = 0
  private readonly format = new TimeFormat(this.params.format, this.plugin.zone)
  private last: number | undefined

  protected evaluate(now: number) {
    const next = this.next(now)?.at
    const value = this.format.value(next, now)
    // re-checks that change nothing send nothing
    if (value !== this.last) this.emit(Value.number(value))
    this.last = value
    const tick = this.format.nextChange(next, now)
    if (next === undefined || tick === undefined) return next ?? tick
    return Math.min(next, tick)
  }

  runNow(): string {
    throw new Error(`"${this.name}" only tells when the schedule runs; there is nothing to run`)
  }
}
